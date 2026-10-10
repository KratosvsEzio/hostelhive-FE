import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import {
  ComponentFixture,
  DeferBlockBehavior,
  TestBed,
} from '@angular/core/testing';
import { RouterLink, provideRouter } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import { Listing, ListingQuery, Paginated } from '@hostelhive/data-access';
import { Container, Skeleton } from '@hostelhive/ui';
import { GeoPreference } from '@core/geo/geo-preference';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { Seo } from '@core/seo';
import { ListingsApi } from '@services';
import { Home } from './home';
import { HomeCities } from './home-cities/home-cities';
import { COUNTRY_HOSTEL_LIMIT } from './home-country';

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

const PAKISTAN: Partial<Listing>[] = [
  { city: 'Lahore', state: 'Punjab', lat: 31.5, lng: 74.3 },
  { city: 'Lahore', state: 'Punjab', lat: 31.6, lng: 74.4 },
  { city: 'Karachi', state: 'Sindh', lat: 24.8, lng: 67 },
  // No photograph for this one, so it is counted but never drawn as a globe.
  { city: 'Gujranwala', state: 'Punjab', lat: 32.1, lng: 74.2 },
];

const GERMANY: Partial<Listing>[] = [
  { city: 'Berlin', state: 'Berlin', lat: 52.5, lng: 13.4 },
  { city: 'Berlin', state: 'Berlin', lat: 52.6, lng: 13.3 },
  { city: 'München', state: 'Bayern', lat: 48.1, lng: 11.6 },
];

let geo: GeoStub;
let listings: ListingsStub;

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
  });

  it('shows Pakistan’s cities, regions and busiest cities', async () => {
    geo.countryCode.set('PK');
    geo.countrySettled.set(true);
    listings.hostels = PAKISTAN;
    const el = await settle(render());

    expect(listings.asked).toEqual([
      { countryCode: 'PK', pageSize: COUNTRY_HOSTEL_LIMIT },
    ]);

    // Globes only for cities with hostels *and* a photograph, busiest first.
    const globes = Array.from(el.querySelectorAll('.hl-orbs b')).map((b) =>
      b.textContent?.trim(),
    );
    expect(globes).toEqual(['Lahore', 'Karachi']);

    const regions = Array.from(el.querySelectorAll('.hl-regs button b')).map(
      (b) => b.textContent,
    );
    expect(regions).toEqual(['Punjab', 'Sindh']);
    expect(el.querySelector('.hl-regs button span')?.textContent).toBe(
      'Lahore · Gujranwala',
    );

    // A city with a landing page keeps linking there; one without opens search on it. The two
    // one-hostel cities tie, so they fall in name order.
    const popular = popularLinks(el).map((a) => a.getAttribute('href'));
    expect(popular[0]).toBe('/hostels/lahore');
    expect(popular[1]).toBe('/search?city=Gujranwala&lat=32.1&lng=74.2');
    expect(popular[2]).toBe('/hostels/karachi');
  });

  it('hides the city globes for any other country but lists its regions', async () => {
    geo.countryCode.set('DE');
    geo.countrySettled.set(true);
    listings.hostels = GERMANY;
    const el = await settle(render());

    expect(el.querySelector('app-home-cities')).toBeNull();
    const regions = Array.from(el.querySelectorAll('.hl-regs button b')).map(
      (b) => b.textContent,
    );
    expect(regions).toEqual(['Berlin', 'Bayern']);

    const popular = popularLinks(el);
    expect(popular.map((a) => a.textContent)).toEqual(['Berlin', 'München']);
    expect(popular[0].getAttribute('href')).toMatch(
      /^\/search\?city=Berlin&lat=52\.55&lng=13\.35/,
    );
  });

  it('says the country has no stays yet and drops Popular when it has none', async () => {
    geo.countryCode.set('FR');
    geo.countrySettled.set(true);
    listings.hostels = [];
    const el = await settle(render());

    expect(el.querySelector('.hl-region-empty')?.textContent).toContain(
      'home.noStaysInCountryYet',
    );
    expect(el.querySelectorAll('.hl-regs button')).toHaveLength(0);
    expect(el.querySelector('.hl-popular')).toBeNull();
    expect(el.querySelector('app-home-cities')).toBeNull();
    // The map is still drawn for their country.
    expect(el.querySelector('.hl-map')).not.toBeNull();
  });

  // An outage is not an empty country; telling a visitor theirs has no stays would be a lie.
  it('does not claim the country is empty when the hostels could not be fetched', async () => {
    geo.countryCode.set('PK');
    geo.countrySettled.set(true);
    listings.fail = true;
    const el = await settle(render());

    expect(el.querySelector('.hl-region-empty')).toBeNull();
    expect(el.querySelector('.hl-popular')).toBeNull();
    expect(el.querySelector('app-home-cities')).toBeNull();
  });

  it('falls back to Pakistan when nobody could say where the visitor is', async () => {
    geo.countrySettled.set(true);
    listings.hostels = PAKISTAN;
    const el = await settle(render());

    expect(listings.asked[0].countryCode).toBe('PK');
    expect(el.querySelector('app-home-cities')).not.toBeNull();
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
    expect(el.querySelectorAll('.hl-regs button')).toHaveLength(2);
  });
});
