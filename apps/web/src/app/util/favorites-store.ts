import { Injectable, computed, effect, signal } from '@angular/core';
import { Listing } from '@hostelhive/data-access';

const STORAGE_KEY = 'hh:favorites';

/**
 * Saved hostels ("favourites"), persisted to localStorage.
 *
 * We store the full `Listing` snapshot (not just ids) because the public API has no
 * batch-get-by-id endpoint — so the Favorites page can render saved cards offline,
 * with no refetch. SSR-safe: reads/writes are guarded and the store starts empty on
 * the server, then hydrates from localStorage in the browser.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesStore {
  private readonly _items = signal<Listing[]>(this.load());

  /** Saved listings, most-recently-saved first. */
  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().length);
  private readonly idSet = computed(
    () => new Set(this._items().map((l) => l.id)),
  );

  constructor() {
    // Mirror every change to localStorage (browser only).
    effect(() => {
      const items = this._items();
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch {
        /* best-effort: ignore quota / private-mode failures */
      }
    });
  }

  /** Reactive membership check — call inside a computed/template so it tracks changes. */
  isFavorite(id: string): boolean {
    return this.idSet().has(id);
  }

  /** Add if missing, remove if present. Returns the resulting saved state. */
  toggle(listing: Listing): boolean {
    const has = this.idSet().has(listing.id);
    if (has) this.remove(listing.id);
    else this._items.update((list) => [listing, ...list]);
    return !has;
  }

  add(listing: Listing): void {
    if (!this.idSet().has(listing.id))
      this._items.update((list) => [listing, ...list]);
  }

  remove(id: string): void {
    this._items.update((list) => list.filter((l) => l.id !== id));
  }

  clear(): void {
    this._items.set([]);
  }

  private load(): Listing[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? (parsed as Listing[]) : [];
    } catch {
      return [];
    }
  }
}
