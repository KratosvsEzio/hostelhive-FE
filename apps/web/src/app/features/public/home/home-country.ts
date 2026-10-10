import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import { GeoPreference } from '@core/geo/geo-preference';
import { LocaleStore } from '@core/i18n/locale-store';
import { ListingsApi } from '@services';
import { toLocationSlug } from '@util/location-slug';
import { HomeCity } from './home-cities/home-cities';
import { PAKISTAN_CITY_PHOTOS } from './home-cities/city-photos';
import { GeoCity, PopularCities } from './popular-cities';
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

type CountryState =
  | { status: 'pending' }
  | { status: 'ready'; code: string; locations: CountryLocations }
  | { status: 'failed'; code: string };

const PENDING: CountryState = { status: 'pending' };

type CitiesState =
  | { status: 'pending' }
  | { status: 'ready'; cities: HomeCity[]; fromGeoNames: boolean };

const CITIES_PENDING: CitiesState = { status: 'pending' };

/**
 * Pakistan's popular cities: the hand-picked list, each with a photograph and a landing page.
 *
 * Chosen over the population ranking because the curated landing pages are where a visitor
 * lands best, and the photographs only exist for these.
 */
const PAKISTAN_CITIES: HomeCity[] = [...PAKISTAN_CITY_PHOTOS.values()].map(
  ({ name, slug, img }) => ({
    name,
    slug,
    img,
    initial: initialOf(name),
    path: `/hostels/${slug}`,
    query: null,
  }),
);

/** A GeoNames city as a globe with no photograph, opening search centred on it. */
export function fromGeoCity({ name, lat, lng }: GeoCity): HomeCity {
  return {
    name,
    // Names with no Latin letters slug to nothing; the name itself still keys the list.
    slug: toLocationSlug(name) || name,
    img: null,
    initial: initialOf(name),
    path: '/search',
    query: { city: name, lat, lng },
  };
}

/** The first letter of a name, skipping leading marks such as the ‘ in ‘Ajmān. */
function initialOf(name: string): string {
  const letter = /\p{L}/u.exec(name)?.[0] ?? name.charAt(0);
  return letter.toLocaleUpperCase();
}

/**
 * The home page's view of the visitor's country: which one, its popular cities, and where its
 * hostels are.
 *
 * Provided by the home page rather than at root — it holds a country's worth of hostels, which
 * nothing else wants kept once the visitor moves on.
 *
 * The country comes from the IP lookup, so it is unknown under SSR and on a first visit until
 * the lookup lands; everything here reads as pending until then, and the sections show a
 * placeholder rather than guessing. A lookup that fails outright falls back to
 * {@link FALLBACK_COUNTRY}.
 *
 * Popular cities do not depend on listings: Pakistan has its hand-picked list, every other
 * country its most populous cities (see `PopularCities`). The regions, by contrast, are tallied
 * in the browser from one page of the public search (see `tallyLocations`) — a stopgap until the
 * backend can answer "which cities have hostels" itself.
 */
@Injectable()
export class HomeCountry {
  private readonly geo = inject(GeoPreference);
  private readonly listings = inject(ListingsApi);
  private readonly popularCities = inject(PopularCities);
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

  private readonly citiesState = toSignal(
    toObservable(this.code).pipe(
      switchMap((code) => (code ? this.citiesFor(code) : of(CITIES_PENDING))),
    ),
    { initialValue: CITIES_PENDING },
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

  readonly citiesPending = computed(
    () => this.citiesState().status === 'pending',
  );

  /** The country's popular cities, most popular first; empty when none could be found. */
  readonly cities = computed<HomeCity[]>(() => {
    const state = this.citiesState();
    return state.status === 'ready' ? state.cities : [];
  });

  /** Whether {@link cities} came from GeoNames, which the page has to credit. */
  readonly citiesFromGeoNames = computed(() => {
    const state = this.citiesState();
    return state.status === 'ready' && state.fromGeoNames;
  });

  /** The shortcuts under the closing search: the top of the same list the globes show. */
  readonly popular = computed(() => this.cities().slice(0, POPULAR_COUNT));

  private citiesFor(code: string): Observable<CitiesState> {
    if (code === 'PK') {
      return of<CitiesState>({
        status: 'ready',
        cities: PAKISTAN_CITIES,
        fromGeoNames: false,
      });
    }
    return this.popularCities.forCountry(code).pipe(
      map(
        (cities): CitiesState => ({
          status: 'ready',
          cities: cities.map(fromGeoCity),
          fromGeoNames: true,
        }),
      ),
      startWith(CITIES_PENDING),
    );
  }

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
