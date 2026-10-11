import {
  Injectable,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AsyncSubject, Observable, Subscription, throwError } from 'rxjs';
import { Listing } from '@hostelhive/data-access';
import { SessionStore } from '@core/auth/session-store';
import { isUnauthorized } from '@core/errors/is-unauthorized';
import { FavouritesApi } from '@services/favourites-api';

const STORAGE_KEY = 'hh:favorites';

/** The saved hostels and whose they are — `owner` is the session user id, null when signed out. */
interface FavoritesState {
  owner: string | null;
  items: Listing[];
}

/**
 * Saved hostels ("favourites") of the signed-in user.
 *
 * The server is the source of truth: whenever the session user changes (sign-in, restore,
 * account switch) the store empties and refills from `GET /api/favourites`; on sign-out it
 * empties. Hearts flip optimistically and roll back if the write fails, and a hostel whose
 * write is still in flight ignores further clicks. A failed write (other than a 401, which
 * ends the session) also re-loads the list quietly, since the rollback restores what this tab
 * assumed and the server may hold otherwise — e.g. it rejected a save it already had.
 *
 * localStorage is only a per-user cache: the full `Listing` snapshots are kept under the
 * owner's id so a reload paints the right hearts before the load arrives, and the cache is
 * ignored (and dropped on sign-out) when it belongs to anyone else. SSR-safe: storage access
 * is guarded and nothing loads on the server.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesStore {
  private readonly favouritesApi = inject(FavouritesApi);
  private readonly session = inject(SessionStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly userId = computed(() => this.session.user()?.id ?? null);
  private readonly state = signal<FavoritesState>(
    untracked(() => this.readCache()),
  );

  /** Hostel id → the saved state its in-flight write is heading to. */
  private readonly pending = new Map<string, boolean>();
  /**
   * Writes that succeeded while a load was in flight, which that load's response may predate.
   * Laid over its result alongside `pending`; emptied whenever a load starts or finishes.
   */
  private readonly settled = new Map<string, boolean>();
  private loading = false;
  /** Bumped on every owner change, so late responses for a previous user are ignored. */
  private epoch = 0;
  /** The owner a load was last started for — a matching owner on first run still refreshes. */
  private loadedFor: string | null = null;
  private loadSub: Subscription | null = null;

  /** Saved listings, most-recently-saved first. */
  readonly items = computed(() => this.state().items);
  readonly count = computed(() => this.state().items.length);
  private readonly idSet = computed(
    () => new Set(this.state().items.map((l) => l.id)),
  );

  constructor() {
    // Mirror every change to the cache: kept under its owner, removed once signed out.
    effect(() => {
      const { owner, items } = this.state();
      if (typeof localStorage === 'undefined') return;
      try {
        if (owner)
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, items }));
        else localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* best-effort: ignore quota / private-mode failures */
      }
    });

    // Keyed on the id, not the user object — restoring and refreshing a session re-set the
    // same user, which must neither wipe the hearts nor fetch them again.
    effect(() => {
      const id = this.userId();
      untracked(() => {
        this.syncOwner();
        if (id !== null && this.isBrowser && this.loadedFor !== id)
          this.load(id);
      });
    });
  }

  /** Reactive membership check — call inside a computed/template so it tracks changes. */
  isFavorite(id: string): boolean {
    return this.idSet().has(id);
  }

  /**
   * Saves the hostel if it is not saved, unsaves it if it is, and returns the resulting state.
   * Signed out it does nothing and returns false — callers send guests to log in first. While
   * a write for this hostel is in flight the click is ignored and the current state returned.
   */
  toggle(listing: Listing): boolean {
    this.syncOwner();
    const saved = untracked(() => this.idSet().has(listing.id));
    if (this.state().owner === null || this.pending.has(listing.id))
      return saved;
    // The failure is already toasted by the error interceptor and rolled back by `write`.
    this.write(listing, !saved).subscribe({ error: () => undefined });
    return !saved;
  }

  /**
   * Unsaves the hostel and reports how the server took it, so a page can restore its own row
   * on failure. Works for a listing the store has not loaded yet; a failure never adds back
   * something that was not there.
   */
  unsave(listing: Listing): Observable<void> {
    this.syncOwner();
    if (this.state().owner === null) {
      return throwError(() => new Error('Sign in to change your favourites.'));
    }
    if (this.pending.has(listing.id)) {
      return throwError(
        () => new Error('This favourite is already being updated.'),
      );
    }
    return this.write(listing, false);
  }

  /**
   * Applies the change locally, then sends it. The returned observable is already running —
   * subscribing is only for hearing the outcome.
   */
  private write(listing: Listing, save: boolean): Observable<void> {
    const { id } = listing;
    const epoch = this.epoch;
    const before = this.state().items;
    const index = before.findIndex((l) => l.id === id);
    const prior = index >= 0 ? before[index] : undefined;

    this.state.update((s) => {
      const rest = s.items.filter((l) => l.id !== id);
      return { ...s, items: save ? [listing, ...rest] : rest };
    });
    this.pending.set(id, save);

    const outcome = new AsyncSubject<void>();
    const request = save
      ? this.favouritesApi.markFavourite(id)
      : this.favouritesApi.unmarkFavourite(id);
    request.subscribe({
      error: (err: unknown) => {
        if (epoch === this.epoch) {
          this.restore(id, prior, index);
          this.pending.delete(id);
          this.reloadAfterFailure(err);
        }
        outcome.error(err);
      },
      complete: () => {
        if (epoch === this.epoch) {
          this.pending.delete(id);
          if (this.loading) this.settled.set(id, save);
        }
        outcome.next();
        outcome.complete();
      },
    });
    return outcome.asObservable();
  }

  /** Puts a hostel back exactly as it was before a failed write: present at its index, or absent. */
  private restore(id: string, prior: Listing | undefined, index: number): void {
    this.state.update((s) => {
      const items = s.items.filter((l) => l.id !== id);
      if (prior) items.splice(Math.min(index, items.length), 0, prior);
      return { ...s, items };
    });
  }

  /**
   * Lets the server settle the hearts after a rolled-back write. Skipped on a 401 (the session
   * is ending) and once the owner has changed; only writes call this, so a failing load cannot
   * loop. The load's merge keeps every other in-flight write.
   */
  private reloadAfterFailure(err: unknown): void {
    const owner = this.state().owner;
    if (owner === null || isUnauthorized(err)) return;
    if (untracked(() => this.userId()) !== owner) return;
    this.load(owner);
  }

  /**
   * Hands the store to the current session user when it has changed: empty list, no pending
   * writes, any load for the previous user dropped. Runs from the session effect and,
   * synchronously, before each write so a click can never land on the previous user's list.
   */
  private syncOwner(): void {
    const id = untracked(() => this.userId());
    if (id === this.state().owner) return;
    this.epoch++;
    this.pending.clear();
    this.settled.clear();
    this.loading = false;
    this.loadSub?.unsubscribe();
    this.loadSub = null;
    this.loadedFor = null;
    this.state.set({ owner: id, items: [] });
  }

  /**
   * Replaces the list with the server's. Quiet: a failed background read keeps the cached
   * hearts and shows no toast, though a 401 still ends the session through the interceptor.
   */
  private load(owner: string): void {
    this.loadedFor = owner;
    this.loadSub?.unsubscribe();
    // Anything settled before this request goes out is already in its response.
    this.settled.clear();
    this.loading = true;
    this.loadSub = this.favouritesApi
      .listFavourites({ quiet: true })
      .subscribe({
        next: (server) => {
          if (this.state().owner === owner)
            this.state.set({ owner, items: this.mergePending(server) });
          this.endLoad();
        },
        error: () => this.endLoad(),
      });
  }

  private endLoad(): void {
    this.loading = false;
    this.settled.clear();
  }

  /**
   * The server list with in-flight writes, and writes that settled while it was loading, laid
   * over it — so a load never undoes a click.
   */
  private mergePending(server: Listing[]): Listing[] {
    // An in-flight write is newer than a settled one, so it wins.
    const target = (id: string): boolean | undefined =>
      this.pending.has(id) ? this.pending.get(id) : this.settled.get(id);
    const serverIds = new Set(server.map((l) => l.id));
    const saving = this.state().items.filter(
      (l) => target(l.id) === true && !serverIds.has(l.id),
    );
    const kept = server.filter((l) => target(l.id) !== false);
    return [...saving, ...kept];
  }

  /**
   * The cache, if it belongs to whoever is signed in right now. Anything else — another user's
   * list, the legacy un-owned array, unreadable JSON — starts empty; signed out, it is removed.
   */
  private readCache(): FavoritesState {
    const owner = this.session.user()?.id ?? null;
    if (typeof localStorage === 'undefined') return { owner, items: [] };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!owner) {
        if (raw !== null) localStorage.removeItem(STORAGE_KEY);
        return { owner, items: [] };
      }
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (isOwnedCache(parsed) && parsed.owner === owner) {
        return { owner, items: parsed.items };
      }
    } catch {
      /* unreadable cache: start empty, the load refills it */
    }
    return { owner, items: [] };
  }
}

function isOwnedCache(value: unknown): value is FavoritesState {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const { owner, items } = value as Partial<FavoritesState>;
  return typeof owner === 'string' && Array.isArray(items);
}
