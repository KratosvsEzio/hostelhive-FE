import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, catchError, map, of } from 'rxjs';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';

/** One of a country's most populous cities, as `tools/build-popular-cities.mjs` writes it. */
export interface GeoCity {
  name: string;
  lat: number;
  lng: number;
  population: number;
}

/**
 * The cities in a `/geo/cities/{ISO2}.json` file, or none when it is not that shape.
 *
 * A country without a file does not always 404: the server renders the app for any path it has
 * no file for, so the answer can be a page of HTML. Checking the shape here turns that, and any
 * future change to the generator, into "no cities" rather than a broken card.
 */
export function parseGeoCities(body: unknown): GeoCity[] {
  if (!Array.isArray(body)) return [];
  return body.filter(
    (c): c is GeoCity =>
      typeof c === 'object' &&
      c !== null &&
      typeof c.name === 'string' &&
      c.name.trim() !== '' &&
      Number.isFinite(c.lat) &&
      Number.isFinite(c.lng) &&
      Number.isFinite(c.population),
  );
}

/**
 * A country's most populous cities, from the static files generated from GeoNames.
 *
 * Population rather than listings decides what shows, so a country with no stays yet still has
 * somewhere to start a search. Browser only: the country is unknown during SSR anyway, and the
 * page renders placeholders there.
 */
@Injectable({ providedIn: 'root' })
export class PopularCities {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Most populous first; empty when the country has no file or it could not be read. */
  forCountry(code: string): Observable<GeoCity[]> {
    if (!this.isBrowser || !/^[a-z]{2}$/i.test(code)) return of([]);
    return this.http
      .get<unknown>(`/geo/cities/${code.toUpperCase()}.json`, {
        // A country we have no file for is an ordinary answer, not something to toast about.
        context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true),
      })
      .pipe(
        map(parseGeoCities),
        catchError(() => of<GeoCity[]>([])),
      );
  }
}
