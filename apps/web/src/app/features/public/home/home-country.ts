import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Params } from '@angular/router';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import { GeoPreference } from '@core/geo/geo-preference';
import { LocaleStore } from '@core/i18n/locale-store';
import { ListingsApi } from '@services';
import { HomeCity } from './home-cities/home-cities';
import { PAKISTAN_CITY_PHOTOS } from './home-cities/city-photos';
import {
  CountryLocations,
  NO_LOCATIONS,
  tallyLocations,
} from './country-locations';

/** Where the page lands when nobody could say where the visitor is: the market it was built for. */
export const FALLBACK_COUNTRY = 'PK';

/**
 * How many hostels are fetched to tally a country from.
 *
 * Generous on purpose — the tally is only as complete as this page — but still one request.
 * Past it, counts undercount and the quietest cities drop off; the fix is a locations
 * endpoint on the backend, not a bigger number here.
 */
export const COUNTRY_HOSTEL_LIMIT = 500;

/** How many cities the closing search offers as one-tap shortcuts. */
const POPULAR_COUNT = 4;

/** A shortcut under the closing search bar. */
export interface PopularCity {
  name: string;
  slug: string;
  path: string;
  query: Params | null;
}

type CountryState =
  | { status: 'pending' }
  | { status: 'ready'; code: string; locations: CountryLocations }
  | { status: 'failed'; code: string };

const PENDING: CountryState = { status: 'pending' };

/**
 * The home page's view of the visitor's country: which one, and where its hostels are.
 *
 * Provided by the home page rather than at root — it holds a country's worth of hostels, which
 * nothing else wants kept once the visitor moves on.
 *
 * The country comes from the IP lookup, so it is unknown under SSR and on a first visit until
 * the lookup lands; everything here reads as pending until then, and the sections show a
 * placeholder rather than guessing. A lookup that fails outright falls back to
 * {@link FALLBACK_COUNTRY}.
 *
 * The locations are tallied in the browser from one page of the public search (see
 * `tallyLocations`). A stopgap until the backend can answer "which cities have hostels" itself.
 */
@Injectable()
export class HomeCountry {
  private readonly geo = inject(GeoPreference);
  private readonly listings = inject(ListingsApi);
  private readonly locale = inject(LocaleStore);

  /** The ISO alpha-2 the page is about, or null while that is still being asked. */
  readonly code = computed(
    () =>
      this.geo.countryCode() ??
      (this.geo.countrySettled() ? FALLBACK_COUNTRY : null),
  );

  private readonly state = toSignal(
    toObservable(this.code).pipe(
      switchMap((code) => (code ? this.fetch(code) : of(PENDING))),
    ),
    { initialValue: PENDING },
  );

  readonly pending = computed(() => this.state().status === 'pending');
  readonly failed = computed(() => this.state().status === 'failed');
  readonly isPakistan = computed(() => this.code() === 'PK');

  /** "Germany", "Allemagne", "جرمنی" — the country in the language being read. */
  readonly name = computed(() => {
    const code = this.code();
    if (!code) return '';
    try {
      return (
        new Intl.DisplayNames([this.locale.active()], { type: 'region' }).of(
          code,
        ) ?? code
      );
    } catch {
      return code; // a locale the runtime cannot build a formatter for
    }
  });

  readonly locations = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.locations : NO_LOCATIONS;
  });

  readonly regions = computed(() => this.locations().regions);
  readonly hasStays = computed(() => this.locations().total > 0);

  /** Cities with hostels that also have a photograph, busiest first. Pakistan only. */
  readonly globeCities = computed<HomeCity[]>(() => {
    if (!this.isPakistan()) return [];
    return this.locations()
      .cities.map((c) => PAKISTAN_CITY_PHOTOS.get(c.slug))
      .filter((c) => c !== undefined)
      .map(({ name, slug, img }) => ({ name, slug, img }));
  });

  /**
   * The busiest cities, linked where they will land best.
   *
   * A city with a curated landing page goes there, as these chips always did; any other opens
   * search on the city by name, centred on its hostels when they carry coordinates — the same
   * shape the map's "Browse stays" link uses.
   */
  readonly popular = computed<PopularCity[]>(() =>
    this.locations()
      .cities.slice(0, POPULAR_COUNT)
      .map((c) => {
        const landing = this.isPakistan()
          ? PAKISTAN_CITY_PHOTOS.get(c.slug)
          : undefined;
        if (landing) {
          return {
            name: landing.name,
            slug: c.slug,
            path: `/hostels/${landing.slug}`,
            query: null,
          };
        }
        const near =
          c.lat !== null && c.lng !== null ? { lat: c.lat, lng: c.lng } : {};
        return {
          name: c.name,
          slug: c.slug,
          path: '/search',
          query: { city: c.name, ...near },
        };
      }),
  );

  private fetch(code: string): Observable<CountryState> {
    return this.listings
      .list({ countryCode: code, pageSize: COUNTRY_HOSTEL_LIMIT })
      .pipe(
        map(
          ({ items }): CountryState => ({
            status: 'ready',
            code,
            locations: tallyLocations(items),
          }),
        ),
        // Not "no stays": an outage must not tell a visitor their country is empty.
        catchError(() => of<CountryState>({ status: 'failed', code })),
        startWith(PENDING),
      );
  }
}
