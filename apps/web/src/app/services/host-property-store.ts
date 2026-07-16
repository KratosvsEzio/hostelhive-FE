import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HostShellApi } from './host-shell-api';
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
 * Loads the real hostel list (with status) from HostShellApi and persists the
 * active selection to localStorage across page refreshes.
 */
@Injectable({ providedIn: 'root' })
export class HostPropertyStore {
  private readonly api = inject(HostShellApi);

  readonly properties = signal<PropertyEntry[]>([]);
  readonly selected = signal<string>(this.restore() ?? '');

  // `undefined` until the listings load (or when the host has none) — the `[0]`
  // fallback lies to the type system otherwise, so annotate the honest type.
  readonly activeProperty = computed<PropertyEntry | undefined>(
    () => this.properties().find(p => p.id === this.selected()) ?? this.properties()[0],
  );

  constructor() {
    this.api.listings().pipe(takeUntilDestroyed()).subscribe(data => {
      const entries: PropertyEntry[] = data.listings.map(l => ({
        id: l.id,
        name: l.name,
        status: l.status,
        area: l.area,
        city: l.city,
        gender: l.gender,
      }));
      this.properties.set(entries);
      const saved = this.selected();
      if (!saved || !entries.some(p => p.id === saved)) {
        this.selected.set(entries[0]?.id ?? '');
      }
    });
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
