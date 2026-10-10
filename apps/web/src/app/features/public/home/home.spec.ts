import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import {
  ComponentFixture,
  DeferBlockBehavior,
  TestBed,
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterLink, provideRouter } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subject, of, throwError } from 'rxjs';
import { Listing, ListingQuery, Paginated } from '@hostelhive/data-access';
import { Container, Skeleton } from '@hostelhive/ui';
import { GeoPreference } from '@core/geo/geo-preference';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { Seo } from '@core/seo';
import { ListingsApi } from '@services';
import { Home } from './home';
import { HomeCities } from './home-cities/home-cities';
import { PAKISTAN_CITY_PHOTOS } from './home-cities/city-photos';
import { COUNTRY_HOSTEL_LIMIT } from './home-country';
import { GeoCity, PopularCities } from './popular-cities';

// Lenis animates the real page; nothing here scrolls.
vi.mock('./smooth-scroll', () => ({ useSmoothScroll: () => undefined }));

/** What the IP lookup has said so far, driven by each test. */
class GeoStub {
  readonly countryCode = signal<string | null>(null);
  readonly countrySettled = signal(false);
}

/** Answers the country query with whatever the test put in `hostels`, and records the ask. */
class ListingsStub {
  hostels: Partial<Listing>[] = [];
  fail = false;
  readonly asked: ListingQuery[] = [];

  list(query: ListingQuery): Observable<Paginated<Listing>> {
    this.asked.push(query);
    if (this.fail) return throwError(() => new Error('offline'));
    const items = this.hostels as Listing[];
    return of({
      items,
      total: items.length,
      page: 1,
      pageSize: 500,
      totalPages: 1,
    });
  }

  featured(): Observable<Listing[]> {
    return of([]);
  }
}

/** The generated city files, as a table per country; a country absent from it has no file. */
class PopularCitiesStub {
  files: Record<string, GeoCity[]> = {};
  /** When set, answers arrive only once the test pushes them. */
  held: Subject<GeoCity[]> | null = null;
  readonly asked: string[] = [];

  forCountry(code: string): Observable<GeoCity[]> {
    this.asked.push(code);
    return this.held ?? of(this.files[code] ?? []);
  }
}

const PAKISTAN: Partial<Listing>[] = [
  { city: 'Lahore', state: 'Punjab', lat: 31.5, lng: 74.3 },
  { city: 'Lahore', state: 'Punjab', lat: 31.6, lng: 74.4 },
  { city: 'Karachi', state: 'Sindh', lat: 24.8, lng: 67 },
  { city: 'Gujranwala', state: 'Punjab', lat: 32.1, lng: 74.2 },
];

const GERMANY: Partial<Listing>[] = [
  { city: 'Berlin', state: 'Berlin', lat: 52.5, lng: 13.4 },
  { city: 'Berlin', state: 'Berlin', lat: 52.6, lng: 13.3 },
  { city: 'München', state: 'Bayern', lat: 48.1, lng: 11.6 },
];

const DE_CITIES: GeoCity[] = [
  { name: 'Berlin', lat: 52.5244, lng: 13.4105, population: 3426354 },
  { name: 'Hamburg', lat: 53.5507, lng: 9.993, population: 1973896 },
  { name: 'Munich', lat: 48.1374, lng: 11.5755, population: 1505005 },
  { name: 'Köln', lat: 50.9333, lng: 6.95, population: 1024621 },
  { name: 'Frankfurt am Main', lat: 50.1155, lng: 8.6842, population: 650000 },
];

const PAKISTAN_NAMES = [...PAKISTAN_CITY_PHOTOS.values()].map((c) => c.name);

let geo: GeoStub;
let listings: ListingsStub;
let popularCities: PopularCitiesStub;

function render(): ComponentFixture<Home> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Home],
    // The map is deferred; manual keeps it on its placeholder instead of building Leaflet.
    deferBlockBehavior: DeferBlockBehavior.Manual,
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: GeoPreference, useValue: geo },
      { provide: ListingsApi, useValue: listings },
      { provide: PopularCities, useValue: popularCities },
      {
        provide: LocaleStore,
        useValue: { ready: signal(false), active: signal('en') },
      },
      {
        provide: Seo,
        useValue: { apply: () => undefined, setJsonLd: () => undefined },
      },
    ],
  });
  // Only the sections under test are real; the hero, search bar, mascot and the rest are
  // inert elements, so this exercises the page's country logic and nothing else.
  TestBed.overrideComponent(Home, {
    set: {
      imports: [TranslocoPipe, RouterLink, Container, Skeleton, HomeCities],
      schemas: [NO_ERRORS_SCHEMA],
    },
  });
  const fixture = TestBed.createComponent(Home);
  fixture.detectChanges();
  return fixture;
}

async function settle(fixture: ComponentFixture<Home>): Promise<HTMLElement> {
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function popularLinks(el: HTMLElement): HTMLAnchorElement[] {
  return Array.from(el.querySelectorAll<HTMLAnchorElement>('.hl-popular a'));
}

function globeNames(el: HTMLElement): (string | undefined)[] {
  return Array.from(el.querySelectorAll('.hl-orbs b')).map((b) =>
    b.textContent?.trim(),
  );
}

function globeLinks(el: HTMLElement): (string | null)[] {
  return Array.from(el.querySelectorAll('.hl-orbs a')).map((a) =>
    a.getAttribute('href'),
  );
}

function inCountry(code: string, hostels: Partial<Listing>[]): void {
  geo.countryCode.set(code);
  geo.countrySettled.set(true);
  listings.hostels = hostels;
}

/** jsdom has no IntersectionObserver, which `@defer (on viewport)` registers even when held. */
class IntersectionObserverStub {
  observe(): void {
    // Never intersects: the map stays deferred.
  }
  unobserve(): void {
    // Nothing was observed.
  }
  disconnect(): void {
    // Nothing to tear down.
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

describe('Home country sections', () => {
  beforeAll(() => {
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    geo = new GeoStub();
    listings = new ListingsStub();
    popularCities = new PopularCitiesStub();
    popularCities.files = { DE: DE_CITIES };
  });

  it('shows placeholders, and asks for nothing, while the country is unknown', async () => {
    const el = await settle(render());

    expect(
      el.querySelector('app-home-cities .hl-cities')?.getAttribute('aria-busy'),
    ).toBe('true');
    expect(el.querySelector('.hl-region-sec')?.getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(el.querySelectorAll('.hl-regs button')).toHaveLength(0);
    expect(el.querySelector('.hl-popular')).toBeNull();
    expect(listings.asked).toHaveLength(0);
    expect(popularCities.asked).toHaveLength(0);
  });

  it('shows Pakistan’s hand-picked cities with photographs, linked to their pages', async () => {
    inCountry('PK', PAKISTAN);
    const el = await settle(render());

    expect(listings.asked).toEqual([
      { countryCode: 'PK', pageSize: COUNTRY_HOSTEL_LIMIT },
    ]);
    // The registry is the list; GeoNames is never asked for Pakistan.
    expect(popularCities.asked).toHaveLength(0);

    expect(globeNames(el)).toEqual(PAKISTAN_NAMES);
    expect(el.querySelectorAll('.hl-orbs img')).toHaveLength(
      PAKISTAN_NAMES.length,
    );
    expect(el.querySelector('.hl-ball-face')).toBeNull();
    // The section carries the locale prefix itself (LocaleLink), hence `/en`.
    expect(globeLinks(el)[0]).toBe('/en/hostels/karachi');
    // Hand-picked, not GeoNames, so there is nothing to credit.
    expect(el.querySelector('.hl-cities-credit')).toBeNull();

    // The regions still come from the hostels.
    const regions = Array.from(el.querySelectorAll('.hl-regs button b')).map(
      (b) => b.textContent,
    );
    expect(regions).toEqual(['Punjab', 'Sindh']);
    expect(el.querySelector('.hl-regs button span')?.textContent).toBe(
      'Lahore · Gujranwala',
    );
  });

  it('shows Pakistan’s cities even with no stays there yet', async () => {
    inCountry('PK', []);
    const el = await settle(render());

    expect(globeNames(el)).toEqual(PAKISTAN_NAMES);
    expect(el.querySelector('.hl-region-empty')).not.toBeNull();
  });

  it('offers the top of the same list as Popular shortcuts', async () => {
    inCountry('PK', PAKISTAN);
    const el = await settle(render());

    const popular = popularLinks(el);
    expect(popular.map((a) => a.textContent)).toEqual(
      PAKISTAN_NAMES.slice(0, 4),
    );
    expect(popular.map((a) => a.getAttribute('href'))).toEqual([
      '/hostels/karachi',
      '/hostels/lahore',
      '/hostels/islamabad',
      '/hostels/rawalpindi',
    ]);
  });

  it('shows another country’s most populous cities as lettered globes', async () => {
    inCountry('DE', GERMANY);
    const fixture = render();
    const el = await settle(fixture);

    expect(popularCities.asked).toEqual(['DE']);
    expect(globeNames(el)).toEqual(DE_CITIES.map((c) => c.name));
    expect(el.querySelectorAll('.hl-orbs img')).toHaveLength(0);
    const letters = Array.from(el.querySelectorAll('.hl-ball-face')).map((f) =>
      f.textContent?.trim(),
    );
    expect(letters).toEqual(['B', 'H', 'M', 'K', 'F']);
    // No landing page outside Pakistan: search opens on the city, centred on it.
    expect(globeLinks(el)[0]).toBe(
      '/en/search?city=Berlin&lat=52.5244&lng=13.4105',
    );

    // The subtitle names the visitor's country, in the language being read.
    const cities = fixture.debugElement.query(By.directive(HomeCities))
      .componentInstance as HomeCities;
    expect(cities.countryName()).toBe('Germany');

    const credit = el.querySelector('.hl-cities-credit');
    expect(credit?.querySelector('a')?.getAttribute('href')).toBe(
      'https://www.geonames.org/',
    );

    const popular = popularLinks(el);
    expect(popular.map((a) => a.textContent)).toEqual([
      'Berlin',
      'Hamburg',
      'Munich',
      'Köln',
    ]);
    expect(popular[3].getAttribute('href')).toBe(
      '/search?city=K%C3%B6ln&lat=50.9333&lng=6.95',
    );

    // The region list is still the listing-based one.
    const regions = Array.from(el.querySelectorAll('.hl-regs button b')).map(
      (b) => b.textContent,
    );
    expect(regions).toEqual(['Berlin', 'Bayern']);
  });

  it('shows a country’s cities when it has no stays at all', async () => {
    inCountry('DE', []);
    const el = await settle(render());

    expect(globeNames(el)).toHaveLength(DE_CITIES.length);
    expect(popularLinks(el)).toHaveLength(4);
    expect(el.querySelector('.hl-region-empty')?.textContent).toContain(
      'home.noStaysInCountryYet',
    );
    // The map is still drawn for their country.
    expect(el.querySelector('.hl-map')).not.toBeNull();
  });

  it('drops the cities section and Popular when the country has no city file', async () => {
    inCountry('FR', []);
    const el = await settle(render());

    expect(popularCities.asked).toEqual(['FR']);
    expect(el.querySelector('app-home-cities')).toBeNull();
    expect(el.querySelector('.hl-popular')).toBeNull();
  });

  it('keeps the placeholders up while the cities are still loading', async () => {
    popularCities.held = new Subject<GeoCity[]>();
    inCountry('DE', GERMANY);
    const fixture = render();
    let el = await settle(fixture);

    expect(
      el.querySelector('app-home-cities .hl-cities')?.getAttribute('aria-busy'),
    ).toBe('true');
    expect(el.querySelector('.hl-cities-credit')).toBeNull();

    popularCities.held.next(DE_CITIES);
    el = await settle(fixture);

    expect(globeNames(el)).toHaveLength(DE_CITIES.length);
  });

  // An outage is not an empty country; telling a visitor theirs has no stays would be a lie.
  it('does not claim the country is empty when the hostels could not be fetched', async () => {
    inCountry('PK', PAKISTAN);
    listings.fail = true;
    const el = await settle(render());

    expect(el.querySelector('.hl-region-empty')).toBeNull();
    // The cities never depended on the hostels.
    expect(globeNames(el)).toEqual(PAKISTAN_NAMES);
    expect(popularLinks(el)).toHaveLength(4);
  });

  it('falls back to Pakistan when nobody could say where the visitor is', async () => {
    geo.countrySettled.set(true);
    listings.hostels = PAKISTAN;
    const el = await settle(render());

    expect(listings.asked[0].countryCode).toBe('PK');
    expect(globeNames(el)).toEqual(PAKISTAN_NAMES);
  });

  it('follows the country once the lookup lands', async () => {
    listings.hostels = GERMANY;
    const fixture = render();
    await settle(fixture);
    expect(listings.asked).toHaveLength(0);

    geo.countryCode.set('DE');
    geo.countrySettled.set(true);
    const el = await settle(fixture);

    expect(listings.asked[0].countryCode).toBe('DE');
    expect(popularCities.asked).toEqual(['DE']);
    expect(el.querySelectorAll('.hl-regs button')).toHaveLength(2);
    expect(globeNames(el)).toHaveLength(DE_CITIES.length);
  });
});
