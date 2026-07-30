import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { HostShellApi } from './host-shell-api';
// Imported by its direct path, NOT the `@core/auth` barrel: that barrel also exports AuthService,
// which imports AuthApi from `@services` — routing this through it would form a @services↔@core/auth
// import cycle. `session-store.ts` itself imports nothing from @services, so the direct path is safe.
import { SessionStore } from '@app/core/auth/session-store';
import { ListingStatus, PropertyGender } from '@hostelhive/data-access';

export interface PropertyEntry {
  id: string;
  name: string;
  status: ListingStatus;
  area: string;
  city: string;
  gender: PropertyGender;
}

const STORAGE_KEY = 'hh_property';

/**
 * Singleton store for the host's active property selection.
 *
 * The hostel list is fetched on demand via `load()` — the host shell calls it on every dashboard
 * entry, so a host who switches accounts within one SPA session never sees the previous account's
 * hostels. `clear()` wipes the list and the persisted selection; it fires automatically the moment
 * the session ends (logout, or a token that fails re-validation), so nothing leaks across sessions.
 * Only the active selection id is persisted (localStorage `hh_property`) — the list itself is
 * always re-fetched, never cached to disk.
 */
@Injectable({ providedIn: 'root' })
export class HostPropertyStore {
  private readonly api = inject(HostShellApi);
  private readonly session = inject(SessionStore);

  readonly properties = signal<PropertyEntry[]>([]);
  readonly selected = signal<string>(this.restore() ?? '');

  // `undefined` until the listings load (or when the host has none) — the `[0]`
  // fallback lies to the type system otherwise, so annotate the honest type.
  readonly activeProperty = computed<PropertyEntry | undefined>(
    () => this.properties().find((p) => p.id === this.selected()) ?? this.properties()[0],
  );

  private loadSub?: Subscription;
  /** Whether the session was authenticated on the previous effect run. Used so `clear()` fires only
   *  on the authed→signed-out transition — never on the initial `null` at bootstrap, which would
   *  otherwise wipe the persisted selection before `restoreSession()` re-establishes the session. */
  private wasAuthenticated = false;

  constructor() {
    // Drop all host data the instant the session ends — an explicit logout OR a persisted token
    // that fails re-validation both funnel through SessionStore.clear(). Guarded to the
    // authed→unauthed transition so bootstrap and the persisted selection survive.
    effect(() => {
      const authed = this.session.isAuthenticated();
      if (this.wasAuthenticated && !authed) this.clear();
      this.wasAuthenticated = authed;
    });
  }

  /**
   * (Re)fetch the signed-in host's hostels. Called on every dashboard entry so the list is always
   * fresh; cancels any in-flight fetch first so overlapping entries can't race to a stale result.
   */
  load(): void {
    this.loadSub?.unsubscribe();
    this.loadSub = this.api.listings().subscribe((data) => {
      const entries: PropertyEntry[] = data.listings.map((l) => ({
        id: l.id,
        name: l.name,
        status: l.status,
        area: l.area,
        city: l.city,
        gender: l.gender,
      }));
      this.properties.set(entries);
      const saved = this.selected();
      if (!saved || !entries.some((p) => p.id === saved)) {
        this.selected.set(entries[0]?.id ?? '');
      }
    });
  }

  /** Wipe the cached hostel list and the persisted selection — on logout / session end. */
  clear(): void {
    this.loadSub?.unsubscribe();
    this.loadSub = undefined;
    this.properties.set([]);
    this.selected.set('');
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors (private browsing, quota exceeded)
    }
  }

  setProperty(id: string): void {
    this.selected.set(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore storage errors (private browsing, quota exceeded)
    }
  }

  private restore(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
