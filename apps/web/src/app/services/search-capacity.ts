import { Injectable, signal } from '@angular/core';

/** Shared signal for the capacity the user has selected in the search bar.
 *  Listing cards and map pins read this to compute the displayed price client-side
 *  without triggering a new API call. */
@Injectable({ providedIn: 'root' })
export class SearchCapacity {
  readonly active = signal<string>('');

  priceFor(priceByCapacity: Record<string, number> | undefined, priceFrom: number): number {
    const cap = this.active();
    if (cap && priceByCapacity?.[cap] != null) return priceByCapacity[cap];
    return priceFrom;
  }
}
