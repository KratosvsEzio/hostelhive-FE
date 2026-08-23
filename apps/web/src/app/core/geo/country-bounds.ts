import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { GeoPreference } from './geo-preference';

/** A map viewport, in the corner form the search page and Leaflet both speak. */
export interface CountryBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** `[west, south, east, north]`, as `tools/build-country-bounds.mjs` writes it. */
type Bbox = [number, number, number, number];

/**
 * The middle of a box. Good enough to rank place-search results by — nobody's country
 * is a rectangle, and a few hundred kilometres of error in the centre of one changes
 * only the order of suggestions, never which ones exist.
 */
export function centreOf(box: CountryBox): { lat: number; lng: number } {
  return { lat: (box.north + box.south) / 2, lng: (box.east + box.west) / 2 };
}

const ASSET = '/geo/country-bounds.json';

/**
 * Where a country is on the map.
 *
 * Exists so the search page can open on the visitor's own country instead of a hardcoded
 * one, without asking a geocoder at page load — that would put a third-party request on the
 * path to the first paint, and Nominatim's fair-use limit is about one request a second
 * shared by every visitor at once.
 *
 * The table is generated rather than written: see the tool for the source and why the box
 * is the country's largest landmass rather than everything it owns.
 */
@Injectable({ providedIn: 'root' })
export class CountryBounds {
  private readonly http = inject(HttpClient);
  private readonly geo = inject(GeoPreference);

  /** One in-flight request at most, and one parse — every caller awaits the same promise. */
  private table?: Promise<Record<string, Bbox> | null>;

  /**
   * Where the visitor is and the viewport that frames it, or null when that cannot be
   * answered — no country resolved yet, a country the table does not carry, or the asset
   * failed.
   *
   * Null is a normal answer, not an error. The caller falls back to the app's default view,
   * which is what it did before this existed.
   *
   * The code comes back with the box because a caller that frames the map on a country
   * generally has to name it too, and looking it up separately invites the label and the
   * view disagreeing about which country is on screen.
   */
  async forVisitor(): Promise<{ code: string; box: CountryBox } | null> {
    const code = this.geo.country();
    const box = await this.forCountry(code);
    return code && box ? { code: code.toUpperCase(), box } : null;
  }

  async forCountry(code: string | null): Promise<CountryBox | null> {
    if (!code || typeof window === 'undefined') return null; // SSR has no visitor IP
    const table = await this.load();
    const box = table?.[code.toUpperCase()];
    if (!box) return null;
    const [west, south, east, north] = box;
    return { north, south, east, west };
  }

  private load(): Promise<Record<string, Bbox> | null> {
    this.table ??= firstValueFrom(this.http.get<Record<string, Bbox>>(ASSET)).catch(
      () => null, // a missing frame is not worth a toast; the default view still works
    );
    return this.table;
  }
}
