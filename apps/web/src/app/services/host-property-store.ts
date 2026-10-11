import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { HostShellApi } from './host-shell-api';
// Imported by its direct path, NOT the `@core/auth` barrel: that barrel also exports AuthService,
// which imports AuthApi from `@services` — routing this through it would form a @services↔@core/auth
// import cycle. `session-store.ts` itself imports nothing from @services, so the direct path is safe.
import { SessionStore } from '@app/core/auth/session-store';
import { HostListing, ListingStatus, PropertyAccommodationType } from '@hostelhive/data-access';

export interface PropertyEntry {
  id: string;
  name: string;
  status: ListingStatus;
  area: string;
  city: string;
  accommodationType: PropertyAccommodationType;
}

const STORAGE_KEY = 'hh:host-property';
/** The selection as builds before owners existed stored it: a bare hostel id, nobody's in particular. */
const LEGACY_STORAGE_KEY = 'hh_property';

/** The loaded hostels and whose they are — `owner` is the session user id the list was fetched for. */
interface HostPropertyState {
  owner: string | null;
  properties: PropertyEntry[];
  hostels: HostListing[];
  loaded: boolean;
}

/** The persisted selection: a hostel id and the user who picked it. */
interface StoredSelection {
  owner: string;
  id: string;
}

const NOTHING_LOADED: Omit<HostPropertyState, 'owner'> = { properties: [], hostels: [], loaded: false };

/**
 * Singleton store for the host's active property selection, scoped to the signed-in user.
 *
 * The hostel list is fetched on demand via `load()` — the host shell calls it on every dashboard
 * entry, and the route guards call it whenever {@link loaded} is false. Everything the store
 * holds belongs to the user it was loaded for: {@link properties}, {@link hostels} and
 * {@link loaded} read empty the instant the session user id differs from that owner, so a guard
 * running in the same tick as an account switch already waits for the new user's list instead of
 * routing them into the previous account's hostel. A session can be replaced in place — accepting
 * an invitation while someone else is signed in, or a restore that resolves to a different user —
 * without ever passing through "signed out", which is why the store keys on the user id rather
 * than on being authenticated.
 *
 * A session effect then does the clean-up: a sign-out runs `clear()`; a different user cancels
 * the previous user's request, takes up that user's own saved selection (if any) and, only when
 * that request was still in flight, loads again so a guard waiting on {@link loaded} does not
 * hang. A list that had finished loading is not re-fetched: {@link loaded} already reads false for
 * the new user, so the next guard or the host shell loads on its own, and a user who never opens
 * a host page never calls the host endpoint. A token with no user yet is a session still being
 * restored, not a sign-out, and is left alone.
 *
 * Only the active selection is persisted (localStorage `hh:host-property`, as `{ owner, id }`) and
 * only ever handed back to the user who picked it; an entry belonging to anyone else is removed
 * when read. The bare id older builds kept under `hh_property` is adopted once by whoever is
 * signed in when it is first read — it is an opaque id `load()` checks against their own list.
 * The list itself is always re-fetched, never cached to disk.
 */
@Injectable({ providedIn: 'root' })
export class HostPropertyStore {
  private readonly api = inject(HostShellApi);
  private readonly session = inject(SessionStore);

  private readonly userId = computed(() => this.session.user()?.id ?? null);
  /**
   * Who the store may hold data for: the user id, or null once fully signed out. A token without
   * a user is a session still being restored or established, which is not a sign-out.
   */
  private readonly holder = computed<string | null | undefined>(() => {
    const id = this.userId();
    if (id !== null) return id;
    return this.session.accessToken() ? undefined : null;
  });

  private readonly state = signal<HostPropertyState>({
    owner: untracked(() => this.userId()),
    ...NOTHING_LOADED,
  });
  /** The state when it belongs to the session user, otherwise nothing loaded. */
  private readonly current = computed(() => {
    const state = this.state();
    return state.owner === this.userId() ? state : NOTHING_LOADED;
  });

  readonly properties = computed<PropertyEntry[]>(() => this.current().properties);

  /**
   * The full hostel records behind {@link properties}, exactly as the list endpoint sent them.
   *
   * The store used to keep six fields per hostel and throw the rest away, so a page needing
   * the currency, the room types or the billing cycle had to re-fetch a hostel the app had
   * already loaded \x2D\x2D and every one of those needs arrived as a separate round trip on a
   * screen that had the answer in memory. One request already carries all of it; this keeps
   * it. Read it through {@link activeHostel}.
   */
  readonly hostels = computed<HostListing[]>(() => this.current().hostels);
  readonly selected = signal<string>(this.restore(untracked(() => this.userId())) ?? '');
  /** True once a `load()` for the signed-in user has resolved (success or failure) — lets the
   *  `/host` root redirect wait for the real hostel list instead of guessing from an empty selection. */
  readonly loaded = computed<boolean>(() => this.current().loaded);

  // `undefined` until the listings load (or when the host has none) — the `[0]`
  // fallback lies to the type system otherwise, so annotate the honest type.
  readonly activeProperty = computed<PropertyEntry | undefined>(
    () => this.properties().find((p) => p.id === this.selected()) ?? this.properties()[0],
  );

  /**
   * Everything known about the hostel the host is working in.
   *
   * The one place any host screen should reach for hostel data. Falls back to the first
   * hostel the same way {@link activeProperty} does, so the two never disagree about which
   * hostel is current.
   */
  readonly activeHostel = computed<HostListing | undefined>(
    () => this.hostels().find((h) => h.id === this.selected()) ?? this.hostels()[0],
  );

  /**
   * Whether a hostel bills by the month rather than by the night.
   *
   * The distinction decides what half of the console applies: a month-billed hostel sells
   * tenancies to renters, so it has no night-by-night calendar, no bookings, and nothing for
   * the availability check to collide with. Three screens were each deriving that from
   * `activeHostel()` themselves; this is the one place it is decided.
   *
   * `id` names the hostel to ask about, and defaults to the active one. Pass it wherever the
   * answer has to be about a hostel the store may not have been switched to yet — a route
   * guard runs before the shell syncs the selection from the URL, so "the active hostel"
   * there can still be the previous one.
   *
   * **Strict on `'month'`.** `billingFrequency` is empty when the payload did not say, and an
   * unknown value answers false — nightly. Hiding a page because a field failed to arrive is
   * the worse failure of the two: showing Bookings on a hostel that has none costs a host one
   * empty list, while hiding it on a hostel that lives by it removes the daily job.
   */
  isMonthlyBilled(id?: string): boolean {
    const hostel = id ? this.hostels().find((h) => h.id === id) : this.activeHostel();
    return hostel?.billingFrequency === 'month';
  }

  /**
   * Whether a hostel bills by the night rather than by the month.
   *
   * **Not `!isMonthlyBilled()`.** That would answer true for a hostel whose billing cycle
   * simply failed to arrive, and the pages this gates — Utilities and Mess — would vanish
   * from a month-billed console because a field was missing. Both predicates are therefore
   * strict on the value they name, and both fail toward *showing* the page: an unknown
   * cycle is neither monthly nor nightly, so it keeps Bookings **and** Utilities.
   *
   * Utilities and Mess belong to a hostel that houses people by the month. A nightly hostel
   * has guests for two days, not electricity meters to split between them or a weekly menu
   * to plan — so the pages are empty by construction, and their forms write records the
   * hostel has no use for.
   */
  isNightlyBilled(id?: string): boolean {
    const hostel = id ? this.hostels().find((h) => h.id === id) : this.activeHostel();
    return hostel?.billingFrequency === 'night';
  }

  private loadSub?: Subscription;
  /** Whether a `load()` is still waiting on its response — a guard may be waiting on {@link loaded}
   *  for it, so a switch to another user, which cancels it, has to fetch again. */
  private inFlight = false;

  constructor() {
    // Keyed on the user id, not on being authenticated: a session can be replaced by another
    // user's without passing through signed-out, and restoring or refreshing a session re-sets
    // the same user, which must change nothing.
    effect(() => {
      const holder = this.holder();
      if (holder === undefined) return;
      untracked(() => {
        // A store nobody owned has nothing to drop, and its first run at a signed-out bootstrap
        // must not wipe a list a guard has just loaded or the selection saved for a later sign-in.
        if (holder === null) {
          if (this.state().owner !== null) this.clear();
          return;
        }
        if (holder === this.state().owner) return;
        // Only a cancelled request can leave a guard waiting; after a finished one, guards load themselves.
        const wasLoading = this.inFlight;
        this.syncOwner();
        if (wasLoading) this.load();
      });
    });
  }

  /**
   * (Re)fetch the signed-in host's hostels. Called on every dashboard entry so the list is always
   * fresh; cancels any in-flight fetch first so overlapping entries can't race to a stale result.
   * The response is kept only if the same user is still signed in when it lands.
   */
  load(): void {
    untracked(() => {
      this.syncOwner();
      const owner = this.state().owner;
      this.inFlight = true;
      this.loadSub?.unsubscribe();
      // Back to "not loaded" for the duration of the fetch: the route guards wait on this
      // signal, and leaving it true lets them resolve against the previous list before the new
      // response lands.
      this.state.update((s) => ({ ...s, loaded: false }));
      this.loadSub = this.api.listings().subscribe({
        next: (data) => {
          // Left in flight when stale, so the pending session effect still reloads for the new user.
          if (!this.ownedBy(owner)) return;
          this.inFlight = false;
          const entries: PropertyEntry[] = data.listings.map((l) => ({
            id: l.id,
            name: l.name,
            status: l.status,
            area: l.area,
            city: l.city,
            accommodationType: l.accommodationType,
          }));
          const saved = this.selected();
          if (!saved || !entries.some((p) => p.id === saved)) {
            // Persist the auto-picked hostel so a reload (or the first post-login /host click)
            // resolves it instantly, without waiting for another load.
            const next = entries[0]?.id ?? '';
            if (next) this.setProperty(next);
            else this.selected.set('');
          }
          this.state.set({ owner, properties: entries, hostels: data.listings, loaded: true });
        },
        // Still mark loaded on failure so the root redirect resolves instead of hanging.
        error: () => {
          if (!this.ownedBy(owner)) return;
          this.inFlight = false;
          this.state.update((s) => ({ ...s, loaded: true }));
        },
      });
    });
  }

  /** Wipe the cached hostel list and the persisted selection — on logout / session end. */
  clear(): void {
    this.loadSub?.unsubscribe();
    this.loadSub = undefined;
    this.inFlight = false;
    this.state.set({ owner: untracked(() => this.userId()), ...NOTHING_LOADED });
    this.selected.set('');
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignore storage errors (private browsing, quota exceeded)
    }
  }

  /** Selects a hostel; it is remembered across reloads only for a signed-in user. */
  setProperty(id: string): void {
    this.selected.set(id);
    const owner = untracked(() => this.userId());
    if (owner === null) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, id } satisfies StoredSelection));
    } catch {
      // ignore storage errors (private browsing, quota exceeded)
    }
  }

  /** Whether the store still belongs to `owner` and `owner` is still the one signed in. */
  private ownedBy(owner: string | null): boolean {
    return this.state().owner === owner && untracked(() => this.userId()) === owner;
  }

  /**
   * Hands the store to the session user when it has changed: nothing loaded, the previous
   * user's request dropped, and the selection replaced by the new user's own saved one, if any.
   * Runs from the session effect and, synchronously, at the start of each `load()` so a guard
   * that loads in the same tick as a switch fetches for the new user.
   */
  private syncOwner(): void {
    const id = untracked(() => this.userId());
    if (id === this.state().owner) return;
    this.loadSub?.unsubscribe();
    this.loadSub = undefined;
    this.inFlight = false;
    this.state.set({ owner: id, ...NOTHING_LOADED });
    this.selected.set(this.restore(id) ?? '');
  }

  /**
   * The saved selection if `owner` picked it. Signed out, nothing is read or removed — a token
   * may still be restoring the user it belongs to. Otherwise an entry saved by anyone else is
   * removed, and a bare id from an older build is adopted for `owner` when it is all there is.
   */
  private restore(owner: string | null): string | null {
    if (owner === null) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy !== null) localStorage.removeItem(LEGACY_STORAGE_KEY);
      if (raw === null) {
        if (!legacy) return null;
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ owner, id: legacy } satisfies StoredSelection),
        );
        return legacy;
      }
      const stored = parseSelection(raw);
      if (stored?.owner === owner) return stored.id;
      localStorage.removeItem(STORAGE_KEY);
      return null;
    } catch {
      return null;
    }
  }
}

function parseSelection(raw: string): StoredSelection | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const { owner, id } = parsed as Partial<StoredSelection>;
    return typeof owner === 'string' && typeof id === 'string' && id ? { owner, id } : null;
  } catch {
    return null;
  }
}
