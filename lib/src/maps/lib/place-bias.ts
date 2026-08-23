import { Injectable, signal } from '@angular/core';

/** A point to rank place results around. */
export interface PlaceBiasPoint {
  lat: number;
  lng: number;
}

/**
 * Where the person searching is, shared by every `hh-place-search` in the app.
 *
 * The typeahead searches the whole world (see `photonSearch`), which is correct — the
 * listings are not necessarily in the visitor's country — but it means "central",
 * "station" or "north" match thousands of places on every continent. This is the tiebreak:
 * the same query, ordered by what is near the person typing it.
 *
 * A service rather than an input on the component because the typeahead appears in the
 * header on every page, on the landing hero, in the search page, in the onboarding wizard
 * and inside the location picker — six call sites that would each have to be handed the
 * same value, including two nested inside other components. What biases them is one fact
 * about the visitor, so it is stored once.
 *
 * Lives in the library while the app decides what to put in it: resolving a visitor's
 * country needs an IP lookup and a bounds table, neither of which belongs down here.
 * Unset is the normal state on a first paint and simply means unranked results.
 */
@Injectable({ providedIn: 'root' })
export class PlaceSearchBias {
  private readonly _at = signal<PlaceBiasPoint | null>(null);

  /** The current bias, or null when the visitor's location is not known (yet). */
  readonly at = this._at.asReadonly();

  set(point: PlaceBiasPoint | null): void {
    this._at.set(point);
  }
}
