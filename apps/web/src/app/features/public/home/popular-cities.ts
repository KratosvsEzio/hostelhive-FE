import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  Observable,
  catchError,
  filter,
  from,
  map,
  of,
  switchMap,
  take,
} from 'rxjs';
import { Listing } from '@hostelhive/data-access';
import { ListingsApi } from '@services';
import { CountryBounds } from '@core/geo/country-bounds';
import { StartupGate } from '@core/startup-gate';
import { searchRouteFor, toLocationSlug } from '@util/location-slug';
import { findPlace } from '../landing/places';

/** A city link under the search bar. */
export interface PopularCity {
  name: string;
  /** Router commands: the city's landing page when it has one, otherwise a search there. */
  link: string[];
  /** The search's centre, for a city with no landing page; null for a landing page. */
  query: { place: string; lat: number; lng: number } | null;
}

/** How many hostels a city is ranked on, at most. Enough to rank a country's top few. */
const SAMPLE = 100;

/** Shown when the visitor's country is unknown or has no hostels on the site yet. */
export const DEFAULT_POPULAR = 4;

/**
 * The cities with the most hostels among `listings`, busiest first.
 *
 * Grouped case-insensitively and with surrounding space ignored, because the city is free
 * text a host typed: "Lahore", "lahore " and "LAHORE" are one city. The spelling shown is the
 * one most of its hostels use. Ties go alphabetically so the order does not shuffle between
 * visits. Each city's centre is the mean of its hostels' positions — the search it links to
 * opens there.
 */
export function rankCities(
  listings: readonly Pick<Listing, 'city' | 'lat' | 'lng'>[],
  limit = DEFAULT_POPULAR,
): PopularCity[] {
  const groups = new Map<
    string,
    {
      spellings: Map<string, number>;
      count: number;
      lat: number;
      lng: number;
      located: number;
    }
  >();
  for (const l of listings) {
    const name = l.city?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const g = groups.get(key) ?? {
      spellings: new Map(),
      count: 0,
      lat: 0,
      lng: 0,
      located: 0,
    };
    g.count++;
    g.spellings.set(name, (g.spellings.get(name) ?? 0) + 1);
    // A hostel with no position is mapped to 0,0; counting it would drag the centre into the sea.
    if (l.lat || l.lng) {
      g.lat += l.lat;
      g.lng += l.lng;
      g.located++;
    }
    groups.set(key, g);
  }

  return [...groups.values()]
    .map((g) => ({
      name: [...g.spellings].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0][0],
      count: g.count,
      centre: g.located
        ? { lat: g.lat / g.located, lng: g.lng / g.located }
        : null,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((c) => cityLink(c.name, c.centre));
}

/**
 * Where a city name leads. A city with its own landing page goes there, exactly as before;
 * any other goes to the search, centred on it when its position is known.
 */
export function cityLink(
  name: string,
  centre: { lat: number; lng: number } | null,
): PopularCity {
  const place = findPlace(toLocationSlug(name));
  if (place) return { name, link: ['/hostels', place.slug], query: null };
  return {
    name,
    link: searchRouteFor(name),
    query: centre
      ? { place: name, lat: round(centre.lat), lng: round(centre.lng) }
      : null,
  };
}

/** Four decimals is about ten metres — plenty for a city centre, and a tidy URL. */
function round(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * The busiest cities in the visitor's own country, for the links under the search bar.
 *
 * Emits null whenever there is nothing honest to show — on the server, before or without a
 * detected country, for a country with no hostels listed, or when the request fails — and the
 * caller keeps its default list. A visitor in a country the site does not serve yet would
 * otherwise see an empty row.
 */
@Injectable({ providedIn: 'root' })
export class PopularCities {
  private readonly bounds = inject(CountryBounds);
  private readonly listings = inject(ListingsApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /**
   * Startup has settled, and with it the country lookup, which holds the gate while it runs.
   * On a first visit the home page is built before the lookup answers; reading the country
   * then finds nothing, and the row would stay on the default list for that whole visit.
   */
  private readonly settled = toObservable(inject(StartupGate).busy).pipe(
    filter((busy) => !busy),
    take(1),
  );

  forVisitor(): Observable<PopularCity[] | null> {
    if (!this.isBrowser) return of(null);
    return this.settled.pipe(
      switchMap(() => from(this.bounds.forVisitor())),
      switchMap((home) =>
        home
          ? this.listings.list({ bounds: home.box, pageSize: SAMPLE })
          : of(null),
      ),
      map((page) => {
        const cities = page ? rankCities(page.items) : [];
        return cities.length ? cities : null;
      }),
      catchError(() => of(null)),
    );
  }
}
