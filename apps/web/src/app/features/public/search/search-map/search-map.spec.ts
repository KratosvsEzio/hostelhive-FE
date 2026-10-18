import {
  Component,
  NO_ERRORS_SCHEMA,
  PLATFORM_ID,
  WritableSignal,
  inject,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, UrlSegment, provideRouter } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { of } from 'rxjs';
import { Listing, Paginated } from '@hostelhive/data-access';
import { GeolocationService, PlaceResult, SharedMap } from '@hostelhive/maps';
import { SessionStore } from '@core/auth';
import { CountryBounds } from '@core/geo/country-bounds';
import { GoogleAnalyticsService } from '@core/google-analytics/google-analytics.service';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { MobileApp } from '@core/mobile-app';
import { Seo } from '@core/seo';
import { CurrencyNamePipe } from '@app/shared/currency/currency-name.pipe';
import { ListingsApi, OffersApi } from '@services';
import { FavoritesStore } from '@util/favorites-store';
import { SearchMap } from './search-map';

const SEARCH_URL = '/search/lahore?gender=girls';

const ROSE = {
  id: 'h1',
  slug: 'rose-hostel',
  name: 'Rose Hostel',
  area: 'Gulberg',
  city: 'Lahore',
  accommodationType: 'girls',
  verified: true,
  sharing: [],
  amenities: [],
  priceFrom: 20000,
  currency: 'PKR',
  images: [],
  lat: 31.5,
  lng: 74.3,
} as unknown as Listing;

const ONE_PAGE: Paginated<Listing> = {
  items: [ROSE],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

/** The component's members are `protected`; the spec reaches them through this shape. */
interface SearchMapInternals {
  narrow: WritableSignal<boolean>;
  selected: WritableSignal<string | null>;
  unbounded: WritableSignal<boolean>;
  map: unknown;
  listings(): Listing[];
  onPlaceSelected(r: PlaceResult): void;
  searchEverywhere(): void;
  locateMe(): Promise<void>;
  ensureMap(): Promise<void>;
  locating(): boolean;
  syncBoundsToUrl(b: { north: number; south: number; east: number; west: number }): void;
  leftHomeCountry(): void;
  captureMapBounds(): void;
  recenterTo(c: { lat: number; lng: number }): void;
}

/** The slice of the listings request these specs look at. */
interface ListQuery {
  near?: { lat: number; lng: number };
  bounds?: unknown;
  amenities?: string[];
  sort?: string;
  accommodationType?: string;
  roomType?: string;
  propertyType?: string;
}

/** A page for the router to land on; the search component under test is mounted directly. */
@Component({ template: '' })
class BlankPage {}

/** Resolves every URL, so real navigations (`:locale/hostels/**`, `:locale/search[/:slug]`) settle. */
const anyUrl = (segments: UrlSegment[]) => ({ consumed: segments });

interface SearchMapConfig {
  /** Server keeps Leaflet, the infinite-scroll observer and the store load out. */
  platform?: 'server' | 'browser';
  locale?: string;
  localeReady?: boolean;
  list?: ReturnType<typeof vi.fn>;
  geolocation?: { getCurrent: () => Promise<{ lat: number; lng: number }> };
  forVisitor?: ReturnType<typeof vi.fn>;
  acquire?: ReturnType<typeof vi.fn>;
  seo?: { apply: ReturnType<typeof vi.fn>; setJsonLd: ReturnType<typeof vi.fn> };
  favorites?: object;
}

const guestFavorites = {
  toggle: vi.fn(),
  isFavorite: () => false,
  items: signal<Listing[]>([]),
};

/** Registers the component's collaborators; the page's own markup is all that renders. */
function configureSearchMap(config: SearchMapConfig = {}): void {
  // jsdom has no matchMedia; a non-matching desktop query is a phone-width viewport.
  (window as unknown as Record<string, unknown>)['matchMedia'] = () => ({
    matches: false,
  });

  TestBed.configureTestingModule({
    imports: [SearchMap],
    providers: [
      provideRouter([
        { path: ':locale/search/:location', component: BlankPage },
        { matcher: anyUrl, component: BlankPage },
      ]),
      provideI18nTesting(),
      { provide: PLATFORM_ID, useValue: config.platform ?? 'server' },
      { provide: FavoritesStore, useValue: config.favorites ?? guestFavorites },
      {
        provide: ListingsApi,
        useValue: { list: config.list ?? (() => of<Paginated<Listing>>(ONE_PAGE)) },
      },
      { provide: OffersApi, useValue: { categories: () => of([]) } },
      {
        provide: CountryBounds,
        useValue: { forVisitor: config.forVisitor ?? (() => Promise.resolve(null)) },
      },
      // Never settles, so the map is never built.
      {
        provide: SharedMap,
        useValue: {
          acquire: config.acquire ?? (() => new Promise(() => undefined)),
          release: () => undefined,
          listen: () => undefined,
        },
      },
      {
        provide: GeolocationService,
        useValue: config.geolocation ?? { getCurrent: () => new Promise(() => undefined) },
      },
      { provide: MobileApp, useValue: { isMobile: signal(false) } },
      { provide: GoogleAnalyticsService, useValue: { track: () => undefined } },
      {
        provide: Seo,
        useValue: config.seo ?? { apply: () => undefined, setJsonLd: () => undefined },
      },
      {
        provide: LocaleStore,
        useValue: {
          ready: signal(config.localeReady ?? false),
          active: signal(config.locale ?? 'en'),
        },
      },
    ],
  });
  // Filters, cards, place search and the currency picker are inert elements.
  TestBed.overrideComponent(SearchMap, {
    set: {
      imports: [TranslocoPipe, CurrencyNamePipe],
      schemas: [NO_ERRORS_SCHEMA],
      // Per instance, so a routed mount can hand the component its own route.
      providers: [
        {
          provide: ActivatedRoute,
          useFactory: () => routedRoute ?? inject(Router).routerState.root,
        },
      ],
    },
  });
}

/** The route a routed mount gives the component; null leaves it on the root route. */
let routedRoute: ActivatedRoute | null = null;

function cleanupSearchMap(): void {
  vi.useRealTimers();
  routedRoute = null;
  TestBed.inject(SessionStore).clear();
  delete (window as unknown as Record<string, unknown>)['matchMedia'];
  vi.restoreAllMocks();
}

/**
 * Creates the component, optionally after really navigating to `url` (so the component's
 * route carries that query), and with `seed` set the way a landing page sets it.
 */
async function mount(
  url?: string,
  seed?: Record<string, string> | null,
  routed = false,
): Promise<{ fixture: ComponentFixture<SearchMap>; map: SearchMapInternals }> {
  const router = TestBed.inject(Router);
  if (url) await router.navigateByUrl(url);
  // A routed page gets the route that matched it, and with it the `:location` param. Without
  // this the component sees the root route, which carries the query but no path params.
  routedRoute = routed ? router.routerState.root.firstChild : null;
  const fixture = TestBed.createComponent(SearchMap);
  if (seed) fixture.componentRef.setInput('seed', seed);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, map: fixture.componentInstance as unknown as SearchMapInternals };
}

/** A listings stub that records each request and answers with one page. */
const listSpy = (): ReturnType<typeof vi.fn> =>
  vi.fn(() => of<Paginated<Listing>>(ONE_PAGE)) as ReturnType<typeof vi.fn>;

const queryAt = (list: ReturnType<typeof vi.fn>, i: number): ListQuery =>
  list.mock.calls[i][0] as ListQuery;

const lastQuery = (list: ReturnType<typeof vi.fn>): ListQuery =>
  queryAt(list, list.mock.calls.length - 1);

/** The results pipeline is debounced, so wait for the search to land. */
const firstSearch = (list: ReturnType<typeof vi.fn>) =>
  vi.waitFor(() => expect(list).toHaveBeenCalled(), { timeout: 3000 });


describe('SearchMap docked card heart', () => {
  let fixture: ComponentFixture<SearchMap>;

  beforeEach(() => {
    guestFavorites.toggle.mockReset();
    configureSearchMap();
  });

  afterEach(cleanupSearchMap);

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('sends a guest to the Log in tab with a way back, without saving anything', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'url', 'get').mockReturnValue(SEARCH_URL);

    const mounted = await mount();
    fixture = mounted.fixture;
    const map = mounted.map;
    await vi.waitFor(() => expect(map.listings().map((l) => l.id)).toEqual(['h1']), {
      timeout: 3000,
    });
    // A pin cannot be tapped without Leaflet, so the selection is made the way a tap makes it.
    map.narrow.set(true);
    map.selected.set('h1');
    await settle();

    const dock = (fixture.nativeElement as HTMLElement).querySelector('.hh-mapcard-dock');
    const heart = dock?.querySelector<HTMLButtonElement>(
      'button[aria-label="Save to favourites"]',
    );
    expect(heart).toBeTruthy();

    heart?.click();
    await settle();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/auth'], {
      queryParams: { mode: 'login', returnUrl: SEARCH_URL },
    });
    expect(guestFavorites.toggle).not.toHaveBeenCalled();
    expect(map.selected()).toBe('h1');
  });
});

const LAHORE = { place: 'Lahore', lat: '31.5204', lng: '74.3587', zoom: '11' };
const CITY_SEED = LAHORE;
const GIRLS_SEED = { ...LAHORE, gender: 'girls' };
const CAMPUS_SEED = { place: 'Punjab University', lat: '31.4979', lng: '74.3035', zoom: '13' };

/** What the country table answers for a visitor, in the shape `CountryBounds.forVisitor` returns. */
const HOME = { code: 'PK', box: { north: 37, south: 23, east: 77, west: 60 } };

const KARACHI: PlaceResult = {
  label: 'Karachi, Sindh, Pakistan',
  lat: 24.8607,
  lng: 67.0011,
  zoom: 10,
};

/** What leaving a landing page always clears, whatever the new geography then says. */
const LEFT_BEHIND = {
  ne_lat: null,
  ne_lng: null,
  sw_lat: null,
  sw_lng: null,
  place: null,
  city: null,
  lat: null,
  lng: null,
  zoom: null,
  capacity: null,
  sharing: null,
  frequency: null,
  everywhere: null,
};

/** The `i`th `router.navigate` call, split into its commands and its extras. */
function navigationAt(navigate: ReturnType<typeof vi.spyOn>, i: number) {
  const [commands, extras] = navigate.mock.calls[i] as [
    unknown[],
    Record<string, unknown> & { queryParams: Record<string, unknown> },
  ];
  return { commands, extras };
}

/** The first `router.navigate` call, split into its commands and its extras. */
function firstNavigation(navigate: ReturnType<typeof vi.spyOn>) {
  return navigationAt(navigate, 0);
}

/**
 * A routed search mount, so the `:location` slug is visible, with `navigate` spied and
 * stopped from going anywhere.
 */
async function mountSearch(url: string, config: SearchMapConfig = {}) {
  configureSearchMap(config);
  const mounted = await mount(url, null, true);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  return { ...mounted, navigate };
}

interface WatchedMount {
  /** A landing page's seed; null mounts a search page. */
  seed?: Record<string, string> | null;
  /** Mount on the matched route, so the `:location` slug is visible. */
  routed?: boolean;
  /** False stops `navigate` from going anywhere, so what it was asked to do never lands. */
  land?: boolean;
}

/**
 * Mounts on a browser with `navigate` spied before the component exists, so the navigation a
 * page makes of its own accord is seen. It really navigates unless `land` is false. Pass
 * `platform: 'server'` to see that a server render makes none.
 */
async function mountWatched(
  url: string,
  options: WatchedMount & SearchMapConfig = {},
) {
  const { seed = null, routed = !seed, land = true, ...config } = options;
  configureSearchMap({ platform: 'browser', ...config });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
  if (!land) navigate.mockResolvedValue(true);
  const mounted = await mount(url, seed, routed);
  return { ...mounted, navigate };
}

/** Call `i` is the clean-up of a discarded sort: a replace of this page nulling only `sort`. */
function expectSortStripAt(navigate: ReturnType<typeof vi.spyOn>, i: number): void {
  const { commands, extras } = navigationAt(navigate, i);
  const { relativeTo, ...rest } = extras;
  expect(commands).toEqual([]);
  // The route the component was given, which is the root route for an unrouted mount.
  expect(relativeTo).toBe(routedRoute ?? TestBed.inject(Router).routerState.root);
  expect(rest).toEqual({
    queryParams: { sort: null },
    queryParamsHandling: 'merge',
    replaceUrl: true,
  });
}

/** The query string the router is on now. */
const urlQuery = () => {
  const router = TestBed.inject(Router);
  return router.parseUrl(router.url).queryParams;
};

/** A Seo stand-in that records each `apply`. */
const seoSpy = () => ({ apply: vi.fn(), setJsonLd: vi.fn() });

/** The head the page last asked for. */
const lastApply = (seo: ReturnType<typeof seoSpy>) =>
  seo.apply.mock.lastCall?.[0] as Record<string, unknown>;

describe('SearchMap place pick on a search page', () => {
  afterEach(cleanupSearchMap);

  const LAHORE_SEARCH = '/en/search/lahore';
  const KARACHI_QUERY = {
    place: 'Karachi, Sindh, Pakistan',
    lat: 24.8607,
    lng: 67.0011,
    zoom: 10,
  };

  it('starts a new search for the picked place in one push, dropping the old place, viewport and retired filters', async () => {
    const { map, navigate } = await mountSearch(
      `${LAHORE_SEARCH}?place=Lahore&city=Lahore&lat=31.5204&lng=74.3587&zoom=11` +
        '&ne_lat=31.6&ne_lng=74.5&sw_lat=31.4&sw_lng=74.2&capacity=2&everywhere=1',
    );

    map.onPlaceSelected(KARACHI);

    expect(navigate).toHaveBeenCalledTimes(1);
    const { commands, extras } = firstNavigation(navigate);
    expect(commands).toEqual(['/en/search', 'karachi-sindh-pakistan']);
    expect(extras).not.toHaveProperty('relativeTo');
    expect(extras).not.toHaveProperty('replaceUrl');
    expect(extras['queryParamsHandling']).toBe('merge');
    expect(extras.queryParams).toEqual({ ...LEFT_BEHIND, gender: null, ...KARACHI_QUERY });
  });

  it('lands on the picked place keeping only the visitor filters', async () => {
    configureSearchMap();
    const viewport = 'ne_lat=31.6&ne_lng=74.5&sw_lat=31.4&sw_lng=74.2';
    const { map } = await mount(`${LAHORE_SEARCH}?minPrice=5000&${viewport}`);
    const router = TestBed.inject(Router);

    map.onPlaceSelected(KARACHI);
    await vi.waitFor(() => expect(router.url).toContain('/en/search/karachi-sindh-pakistan'));

    expect(router.parseUrl(router.url).queryParams).toEqual({
      minPrice: '5000',
      place: 'Karachi, Sindh, Pakistan',
      lat: '24.8607',
      lng: '67.0011',
      zoom: '10',
    });
  });

  it('writes the picked place to a bare worldwide search under its own slug', async () => {
    const { map, navigate } = await mountSearch(
      '/en/search?everywhere=1&ne_lat=31.6&ne_lng=74.5&sw_lat=31.4&sw_lng=74.2',
    );

    map.onPlaceSelected(KARACHI);

    const { commands, extras } = firstNavigation(navigate);
    expect(commands).toEqual(['/en/search', 'karachi-sindh-pakistan']);
    expect(extras.queryParams).toEqual({ ...LEFT_BEHIND, gender: null, ...KARACHI_QUERY });
  });

  it('routes a label with no Latin letters to the bare search, keeping the label as the place', async () => {
    const { map, navigate } = await mountSearch(LAHORE_SEARCH);

    map.onPlaceSelected({ label: 'کراچی', lat: 24.8607, lng: 67.0011, zoom: 10 });

    const { commands, extras } = firstNavigation(navigate);
    expect(commands).toEqual(['/en/search']);
    expect(extras.queryParams).toMatchObject({ place: 'کراچی', lat: 24.8607, lng: 67.0011 });
  });

  it('prefixes the search route with the active locale', async () => {
    const { map, navigate } = await mountSearch('/ur/search/lahore', { locale: 'ur' });

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).commands).toEqual(['/ur/search', 'karachi-sindh-pakistan']);
  });

  it('scrubs an invalid gender rather than carrying it', async () => {
    const { map, navigate } = await mountSearch('/en/search?gender=bogus');

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams['gender']).toBeNull();
  });

  it('carries a valid gender to the new place', async () => {
    const { map, navigate } = await mountSearch('/en/search?gender=girls');

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams['gender']).toBe('girls');
  });

  it('drops a price sort when no type is in force', async () => {
    const { map, navigate } = await mountSearch('/en/search?sort=price-asc');

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams).toHaveProperty('sort', null);
  });

  it('keeps a price sort when a type is in force', async () => {
    const { map, navigate } = await mountSearch('/en/search?gender=girls&sort=price-asc');

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams).not.toHaveProperty('sort');
  });

  it('leaves a non-price sort alone when no type is in force', async () => {
    const { map, navigate } = await mountSearch('/en/search?sort=newest');

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams).not.toHaveProperty('sort');
  });
});

describe('SearchMap Near me on a search page', () => {
  afterEach(cleanupSearchMap);

  const located = { getCurrent: () => Promise.resolve({ lat: 24.9, lng: 67.1 }) };

  it('starts a new search around the visitor on the bare search, keeping the type', async () => {
    const { map, navigate } = await mountSearch(
      '/en/search/lahore?gender=girls&ne_lat=31.6&ne_lng=74.5&sw_lat=31.4&sw_lng=74.2',
      { geolocation: located },
    );

    await map.locateMe();

    expect(navigate).toHaveBeenCalledTimes(1);
    const { commands, extras } = firstNavigation(navigate);
    expect(commands).toEqual(['/en/search']);
    expect(extras).not.toHaveProperty('relativeTo');
    expect(extras).not.toHaveProperty('replaceUrl');
    expect(extras.queryParams).toEqual({
      ...LEFT_BEHIND,
      gender: 'girls',
      place: 'My location',
      lat: 24.9,
      lng: 67.1,
    });
  });

  it('stays put and stops locating when the position is refused', async () => {
    const { map, navigate } = await mountSearch('/en/search/lahore', {
      geolocation: { getCurrent: () => Promise.reject(new Error('denied')) },
    });

    await map.locateMe();

    expect(navigate).not.toHaveBeenCalled();
    expect(map.locating()).toBe(false);
  });

  it('is locating while the lookup is pending and ignores a second tap', async () => {
    let resolve!: (v: { lat: number; lng: number }) => void;
    const getCurrent = vi.fn(
      () => new Promise<{ lat: number; lng: number }>((r) => (resolve = r)),
    );
    const { map, navigate } = await mountSearch('/en/search/lahore', {
      geolocation: { getCurrent },
    });

    const first = map.locateMe();
    expect(map.locating()).toBe(true);
    await map.locateMe();
    expect(getCurrent).toHaveBeenCalledTimes(1);

    resolve({ lat: 24.9, lng: 67.1 });
    await first;

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(map.locating()).toBe(false);
  });
});

describe('SearchMap search page head', () => {
  afterEach(cleanupSearchMap);

  const head = async (url: string, locale?: string) => {
    const seo = seoSpy();
    configureSearchMap({ platform: 'server', localeReady: true, seo, locale });
    await mount(url, null, true);
    return lastApply(seo);
  };

  it('keeps a search for another place out of the index and off the old place canonical', async () => {
    const place = encodeURIComponent('Karachi, Sindh, Pakistan');
    const seo = seoSpy();
    configureSearchMap({ platform: 'server', localeReady: true, seo });
    // The test i18n returns the bare key, so the place can only be seen in the params.
    const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');
    await mount(
      `/en/search/lahore?place=${place}&lat=24.8607&lng=67.0011&zoom=10`,
      null,
      true,
    );
    const applied = lastApply(seo);

    expect(applied['noindex']).toBe(true);
    expect(applied).not.toHaveProperty('path');
    expect(applied['title']).toBe('seo.searchTitle');
    const titleCall = translate.mock.calls.filter((c) => c[0] === 'seo.searchTitle').at(-1);
    expect(titleCall?.[1]).toEqual({ place: 'Karachi, Sindh, Pakistan' });
  });

  it('canonicalises a pasted slug with no query to its landing page', async () => {
    const applied = await head('/en/search/lahore');

    expect(applied['path']).toBe('/hostels/lahore');
    expect(applied['noindex']).toBeUndefined();
  });

  it('follows the place in the query over the path slug', async () => {
    const applied = await head('/en/search/foo?place=Lahore');

    expect(applied['path']).toBe('/hostels/lahore');
    expect(applied['noindex']).toBeUndefined();
  });

  it('falls back to the path slug when the place has no Latin letters', async () => {
    const applied = await head(`/en/search/lahore?place=${encodeURIComponent('لاہور')}`);

    expect(applied['path']).toBe('/hostels/lahore');
  });
});

describe('SearchMap on a landing page', () => {
  const GIRLS_URL = '/en/hostels/lahore/girls';
  const CITY_URL = '/en/hostels/lahore';

  afterEach(cleanupSearchMap);

  /** Mounts on `url` with `seed`, then spies `navigate` without letting it go anywhere. */
  async function mountLanding(
    url: string,
    seed: Record<string, string>,
    config: SearchMapConfig = {},
  ) {
    configureSearchMap(config);
    const mounted = await mount(url, seed);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    return { ...mounted, navigate };
  }

  it('leaves for the picked place in one push, carrying the page gender and clearing the old viewport', async () => {
    const { map, navigate } = await mountLanding(GIRLS_URL, GIRLS_SEED);

    map.onPlaceSelected(KARACHI);

    expect(navigate).toHaveBeenCalledTimes(1);
    const { commands, extras } = firstNavigation(navigate);
    expect(commands).toEqual(['/en/search', 'karachi-sindh-pakistan']);
    expect(extras).not.toHaveProperty('relativeTo');
    expect(extras).not.toHaveProperty('replaceUrl');
    expect(extras['queryParamsHandling']).toBe('merge');
    expect(extras.queryParams).toEqual({
      ...LEFT_BEHIND,
      gender: 'girls',
      place: 'Karachi, Sindh, Pakistan',
      lat: 24.8607,
      lng: 67.0011,
      zoom: 10,
    });
  });

  it('nulls the zoom when the picked place carries none', async () => {
    const { map, navigate } = await mountLanding(GIRLS_URL, GIRLS_SEED);

    map.onPlaceSelected({ label: 'Karachi, Sindh, Pakistan', lat: 24.8607, lng: 67.0011 });

    expect(firstNavigation(navigate).extras.queryParams['zoom']).toBeNull();
  });

  it('lands on the picked place keeping the visitor filters and dropping the old viewport and place', async () => {
    configureSearchMap();
    const viewport = 'ne_lat=31.6&ne_lng=74.5&sw_lat=31.4&sw_lng=74.2';
    const { map } = await mount(`${GIRLS_URL}?minPrice=5000&${viewport}`, GIRLS_SEED);
    const router = TestBed.inject(Router);

    map.onPlaceSelected(KARACHI);
    await vi.waitFor(() => expect(router.url).toContain('/en/search/karachi-sindh-pakistan'));

    const tree = router.parseUrl(router.url);
    expect(tree.queryParams).toEqual({
      minPrice: '5000',
      gender: 'girls',
      place: 'Karachi, Sindh, Pakistan',
      lat: '24.8607',
      lng: '67.0011',
      zoom: '10',
    });
  });

  it('prefixes the search route with the active locale', async () => {
    const { map, navigate } = await mountLanding('/ur/hostels/lahore/girls', GIRLS_SEED, {
      locale: 'ur',
    });

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).commands).toEqual(['/ur/search', 'karachi-sindh-pakistan']);
  });

  it('writes no gender when a city page has none in force', async () => {
    const { map, navigate } = await mountLanding(CITY_URL, CITY_SEED);

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams['gender']).toBeNull();
  });

  it('carries a valid gender override in place of the page gender', async () => {
    const { map, navigate } = await mountLanding(`${GIRLS_URL}?gender=boys`, GIRLS_SEED);

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams['gender']).toBe('boys');
  });

  it('scrubs an invalid gender from a city page rather than carrying it', async () => {
    const { map, navigate } = await mountLanding(`${CITY_URL}?gender=bogus`, CITY_SEED);

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams['gender']).toBeNull();
  });

  it('drops a price sort when no type is in force', async () => {
    const { map, navigate } = await mountLanding(`${CITY_URL}?sort=price-asc`, CITY_SEED);

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams).toHaveProperty('sort', null);
  });

  it('keeps a price sort when the page fixes a type', async () => {
    const { map, navigate } = await mountLanding(`${GIRLS_URL}?sort=price-asc`, GIRLS_SEED);

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams).not.toHaveProperty('sort');
  });

  it('keeps a non-price sort when no type is in force', async () => {
    const { map, navigate } = await mountLanding(`${CITY_URL}?sort=newest`, CITY_SEED);

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams).not.toHaveProperty('sort');
  });

  it('sends Near me from a gender page to a search around the visitor', async () => {
    const { map, navigate } = await mountLanding(GIRLS_URL, GIRLS_SEED, {
      geolocation: { getCurrent: () => Promise.resolve({ lat: 24.9, lng: 67.1 }) },
    });

    await map.locateMe();

    expect(navigate).toHaveBeenCalledTimes(1);
    const { commands, extras } = firstNavigation(navigate);
    expect(commands).toEqual(['/en/search']);
    expect(extras).not.toHaveProperty('relativeTo');
    expect(extras).not.toHaveProperty('replaceUrl');
    expect(extras.queryParams).toEqual({
      ...LEFT_BEHIND,
      gender: 'girls',
      place: 'My location',
      lat: 24.9,
      lng: 67.1,
    });
  });

  it('sends Search everywhere from a campus page to a worldwide search without searching again', async () => {
    const list = listSpy();
    const { map, navigate } = await mountLanding(
      '/en/hostels/lahore/punjab-university',
      CAMPUS_SEED,
      { platform: 'browser', list },
    );
    await firstSearch(list);
    const searches = list.mock.calls.length;

    map.searchEverywhere();
    // Fake timers never fire the results debounce under this harness (the pipeline is fed by
    // effects the fake clock does not drive), so wait out more than twice the 600ms debounce.
    // The stable assertions are the single navigation and `unbounded()` staying false: a local
    // widening would flip it, and the wait only confirms no search follows.
    await new Promise<void>((r) => setTimeout(r, 1500));

    expect(navigate).toHaveBeenCalledTimes(1);
    const { commands, extras } = firstNavigation(navigate);
    expect(commands).toEqual(['/en/search']);
    expect(extras).not.toHaveProperty('relativeTo');
    expect(extras).not.toHaveProperty('replaceUrl');
    expect(extras.queryParams).toEqual({ ...LEFT_BEHIND, gender: null, everywhere: 1 });
    expect(map.unbounded()).toBe(false);
    expect(list).toHaveBeenCalledTimes(searches);
  });

  it('does not carry retired filters to the search', async () => {
    const { map, navigate } = await mountLanding(
      `${CITY_URL}?capacity=2&sharing=double&frequency=monthly`,
      CITY_SEED,
    );

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams).toMatchObject({
      capacity: null,
      sharing: null,
      frequency: null,
    });
  });
});

/**
 * The amenity filter.
 *
 * The URL carries amenity slugs, and the search filters by slug (`f[offers.slug][]`), so they
 * go to the query unchanged. There is no id lookup any more: it used to coerce the obfuscated
 * offer ids with `+o.id` (NaN), and the index cannot match an exact-case id anyway.
 */
describe('SearchMap amenity filter', () => {
  afterEach(cleanupSearchMap);

  it('passes the amenity slugs from the URL straight to the search', async () => {
    const list = listSpy();
    configureSearchMap({ platform: 'browser', list });
    await mount('/en/search?everywhere=1&amenities=ceiling-fan,heater');
    await firstSearch(list);

    expect(lastQuery(list).amenities).toEqual(['ceiling-fan', 'heater']);
  });
});

describe('SearchMap worldwide search', () => {
  afterEach(cleanupSearchMap);

  it('ends a worldwide search with a place pick, whatever the page', async () => {
    const { map, navigate } = await mountSearch('/en/search?everywhere=1');

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams).toHaveProperty('everywhere', null);
  });

  it('widens a bare search in place and the next request carries no place or box', async () => {
    const list = listSpy();
    configureSearchMap({ platform: 'browser', list });
    const { map } = await mount('/en/search?lat=31.5204&lng=74.3587', null, true);
    const route = TestBed.inject(Router).routerState.root.firstChild;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    await firstSearch(list);
    expect(queryAt(list, 0).near).toEqual({ lat: 31.5204, lng: 74.3587 });

    map.searchEverywhere();

    expect(navigate).toHaveBeenCalledTimes(1);
    const { commands, extras } = firstNavigation(navigate);
    expect(commands).toEqual([]);
    expect(extras['relativeTo']).toBe(route);
    expect(extras['replaceUrl']).toBe(true);
    expect(extras['queryParamsHandling']).toBe('merge');
    expect(extras.queryParams).toEqual({
      ne_lat: null,
      ne_lng: null,
      sw_lat: null,
      sw_lng: null,
      lat: null,
      lng: null,
      place: null,
      city: null,
      everywhere: 1,
    });
    await vi.waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1), { timeout: 3000 });
    expect(lastQuery(list).near).toBeUndefined();
    expect(lastQuery(list).bounds).toBeUndefined();
  });

  it('opens a worldwide link without framing the visitor country', async () => {
    const list = listSpy();
    // A real answer, so framing the country would put a box on the first request.
    const forVisitor = vi.fn().mockResolvedValue(HOME);
    const acquire = vi.fn(() => new Promise(() => undefined));
    configureSearchMap({ platform: 'browser', list, forVisitor, acquire });
    const { map } = await mount('/en/search?everywhere=1');

    void map.ensureMap();
    await firstSearch(list);

    expect(acquire).toHaveBeenCalled();
    expect(forVisitor).not.toHaveBeenCalled();
    expect(queryAt(list, 0).near).toBeUndefined();
    expect(queryAt(list, 0).bounds).toBeUndefined();
  });

  it('still frames the visitor country on a bare search', async () => {
    const forVisitor = vi.fn().mockResolvedValue(HOME);
    configureSearchMap({ platform: 'browser', forVisitor });
    const { map } = await mount('/en/search');

    void map.ensureMap();

    await vi.waitFor(() => expect(forVisitor).toHaveBeenCalledTimes(1));
  });

  it('searches near the coordinates when the link names a place as well', async () => {
    const list = listSpy();
    configureSearchMap({ platform: 'browser', list });
    const { map } = await mount('/en/search?everywhere=1&lat=31.5204&lng=74.3587');

    await firstSearch(list);

    expect(map.unbounded()).toBe(false);
    expect(queryAt(list, 0).near).toEqual({ lat: 31.5204, lng: 74.3587 });
  });

  it('ignores the worldwide key on a landing page', async () => {
    configureSearchMap();
    const { map } = await mount('/en/hostels/lahore?everywhere=1', CITY_SEED);

    expect(map.unbounded()).toBe(false);
  });

  it('writes the worldwide key with the viewport while the search is worldwide', async () => {
    configureSearchMap({ platform: 'browser' });
    const { map } = await mount('/en/search?everywhere=1');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    map.syncBoundsToUrl({ north: 31.6, south: 31.4, east: 74.5, west: 74.2 });

    expect(navigate).toHaveBeenCalledTimes(1);
    const { commands, extras } = firstNavigation(navigate);
    expect(commands).toEqual([]);
    expect(extras['replaceUrl']).toBe(true);
    expect(extras['queryParamsHandling']).toBe('merge');
    expect(extras.queryParams).toEqual({
      ne_lat: 31.6,
      ne_lng: 74.5,
      sw_lat: 31.4,
      sw_lng: 74.2,
      everywhere: 1,
    });
  });

  it('clears the worldwide key once the visitor pans away', async () => {
    configureSearchMap({ platform: 'browser' });
    const { map } = await mount('/en/search?everywhere=1');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    map.leftHomeCountry();
    map.syncBoundsToUrl({ north: 31.6, south: 31.4, east: 74.5, west: 74.2 });

    expect(map.unbounded()).toBe(false);
    expect(firstNavigation(navigate).extras.queryParams['everywhere']).toBeNull();
  });

  it('ends the worldwide search when the camera recentres on a new place', async () => {
    const list = listSpy();
    configureSearchMap({ platform: 'browser', list });
    const { map } = await mount('/en/search/lahore?everywhere=1', null, true);
    const router = TestBed.inject(Router);
    await firstSearch(list);
    expect(map.unbounded()).toBe(true);

    // A slug-to-slug pick stays on the same route config, so a live instance survives it and
    // receives the recentre; a pick across configs would destroy and rebuild the component.
    map.onPlaceSelected(KARACHI);
    await vi.waitFor(() => expect(router.url).toContain('/en/search/karachi-sindh-pakistan'));
    expect(router.url).toContain('lat=24.8607');
    expect(router.url).not.toContain('everywhere');
    const setView = vi.fn();
    const viewport = { north: 25.0, south: 24.7, east: 67.2, west: 66.8 };
    map.map = {
      setView,
      getBounds: () => ({
        getNorth: () => viewport.north,
        getSouth: () => viewport.south,
        getEast: () => viewport.east,
        getWest: () => viewport.west,
      }),
    };
    map.recenterTo({ lat: KARACHI.lat, lng: KARACHI.lng });
    expect(map.unbounded()).toBe(false);
    expect(setView).toHaveBeenCalledWith([24.8607, 67.0011], 15);

    // The camera settling is what writes the viewport, and it only drops the worldwide key
    // and filters by the box if the search really stopped being worldwide.
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    map.captureMapBounds();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(firstNavigation(navigate).extras.queryParams).toEqual({
      ne_lat: 25,
      ne_lng: 67.2,
      sw_lat: 24.7,
      sw_lng: 66.8,
      everywhere: null,
    });
    await vi.waitFor(() => expect(lastQuery(list).bounds).toEqual(viewport), { timeout: 3000 });
    expect(lastQuery(list).near).toBeUndefined();
  });

  it('sends Search everywhere from a place path to a worldwide bare search without searching again', async () => {
    const list = listSpy();
    const { map, navigate } = await mountSearch('/en/search/lahore', {
      platform: 'browser',
      list,
    });
    await firstSearch(list);
    expect(queryAt(list, 0).near).toBeDefined();
    const searches = list.mock.calls.length;

    map.searchEverywhere();
    // Wait out more than twice the 600ms results debounce to confirm no search follows.
    await new Promise<void>((r) => setTimeout(r, 1500));

    expect(navigate).toHaveBeenCalledTimes(1);
    const { commands, extras } = firstNavigation(navigate);
    expect(commands).toEqual(['/en/search']);
    expect(extras).not.toHaveProperty('relativeTo');
    expect(extras).not.toHaveProperty('replaceUrl');
    expect(extras['queryParamsHandling']).toBe('merge');
    expect(extras.queryParams).toEqual({ ...LEFT_BEHIND, gender: null, everywhere: 1 });
    expect(map.unbounded()).toBe(false);
    expect(list).toHaveBeenCalledTimes(searches);
  });

  it('clears the place, zoom, viewport and retired keys when widening from a place path', async () => {
    const { map, navigate } = await mountSearch(
      '/en/search/lahore?place=Lahore&lat=31.5204&lng=74.3587&zoom=11&capacity=2',
      { platform: 'browser' },
    );

    map.searchEverywhere();

    const { commands, extras } = firstNavigation(navigate);
    expect(commands).toEqual(['/en/search']);
    expect(extras.queryParams).toEqual({ ...LEFT_BEHIND, gender: null, everywhere: 1 });
    for (const key of ['place', 'city', 'lat', 'lng', 'zoom', 'ne_lat', 'sw_lng', 'capacity']) {
      expect(extras.queryParams[key]).toBeNull();
    }
  });

  it('keeps the visitor filters when widening from a place path', async () => {
    const { map, navigate } = await mountSearch(
      '/en/search/lahore?minPrice=5000&maxPrice=9000&gender=girls&amenities=heater',
      { platform: 'browser' },
    );

    map.searchEverywhere();

    const { commands, extras } = firstNavigation(navigate);
    expect(commands).toEqual(['/en/search']);
    expect(extras['queryParamsHandling']).toBe('merge');
    expect(extras.queryParams).toEqual({ ...LEFT_BEHIND, gender: 'girls', everywhere: 1 });
    for (const key of ['minPrice', 'maxPrice', 'amenities']) {
      expect(extras.queryParams).not.toHaveProperty(key);
    }
  });

  it.each([
    ['keeps a price sort when a type is in force', '?gender=girls&sort=price-asc', { gender: 'girls' }],
  ])('%s when widening from a place path', async (_name, query, expected) => {
    const { map, navigate } = await mountSearch(`/en/search/lahore${query}`, {
      platform: 'browser',
    });

    map.searchEverywhere();

    const { extras } = firstNavigation(navigate);
    expect(extras.queryParams).toEqual({ ...LEFT_BEHIND, ...expected, everywhere: 1 });
    if (!('sort' in expected)) expect(extras.queryParams).not.toHaveProperty('sort');
  });

  // The page's own clean-up of the sort never lands here, as when it loses a race.
  it('drops a price sort when no type is in force when widening from a place path', async () => {
    const { map, navigate } = await mountWatched('/en/search/lahore?sort=price-asc', {
      land: false,
    });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expectSortStripAt(navigate, 0);

    map.searchEverywhere();

    expect(navigate).toHaveBeenCalledTimes(2);
    const { commands, extras } = navigationAt(navigate, 1);
    expect(commands).toEqual(['/en/search']);
    expect(extras).not.toHaveProperty('relativeTo');
    expect(extras).not.toHaveProperty('replaceUrl');
    expect(extras.queryParams).toEqual({
      ...LEFT_BEHIND,
      gender: null,
      sort: null,
      everywhere: 1,
    });
  });

  it('does not navigate when widening from a place path on the server', async () => {
    const { map, navigate } = await mountSearch('/en/search/lahore');

    map.searchEverywhere();

    expect(navigate).not.toHaveBeenCalled();
    expect(map.unbounded()).toBe(false);
  });

  it('titles a server-rendered worldwide link as a worldwide search and keeps it out of the index', async () => {
    const seo = { apply: vi.fn(), setJsonLd: vi.fn() };
    configureSearchMap({ platform: 'server', localeReady: true, seo });
    await mount('/en/search?everywhere=1');

    expect(seo.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        title: TestBed.inject(TranslocoService).translate<string>('seo.worldwideTitle'),
        noindex: true,
      }),
    );
  });
});

/** A URL to open, and the landing page seed it opens with, if any. */
type Arrival = [name: string, url: string, seed: Record<string, string> | null];

/** An `Arrival` that is left alone, with the sort it asks for. */
type Unchanged = [name: string, url: string, seed: Record<string, string> | null, sort: string];

/**
 * A sort in the URL that the type in force does not offer: a shared link, a bookmark or an
 * address typed by hand. The request reads it as absent, and the browser takes it out of the
 * address bar; a sort the type does offer is sent and left where it is.
 */
describe('SearchMap on a URL carrying a sort the type does not offer', () => {
  const GIRLS_URL = '/en/hostels/lahore/girls';
  const CITY_URL = '/en/hostels/lahore';
  const CAMPUS_URL = '/en/hostels/lahore/punjab-university';

  /** Price sorts that no type in force can justify. */
  const STALE: Arrival[] = [
    ['a bare search', '/en/search?sort=price-asc', null],
    ['a place search', '/en/search/lahore?sort=price-asc', null],
    ['a city page', `${CITY_URL}?sort=price-asc`, CITY_SEED],
    ['a campus page', `${CAMPUS_URL}?sort=price-desc`, CAMPUS_SEED],
    ['an unknown type', '/en/search?gender=bogus&sort=price-asc', null],
  ];

  /** Price sorts that a type in force justifies. */
  const KEPT: Arrival[] = [
    ['a type in the query', '/en/search?gender=girls&sort=price-asc', null],
    ['the girls page', `${GIRLS_URL}?sort=price-asc`, GIRLS_SEED],
    [
      'the girls page with an unknown type',
      `${GIRLS_URL}?gender=bogus&sort=price-asc`,
      GIRLS_SEED,
    ],
  ];

  /** Every URL the page leaves as it found it, and the sort it asks for. */
  const UNTOUCHED: Unchanged[] = [
    ['a recommended sort', '/en/search?sort=recommended', null, 'recommended'],
    ['a newest sort', '/en/search?sort=newest', null, 'newest'],
    ['an oldest sort', '/en/search?sort=oldest', null, 'oldest'],
    ...KEPT.map(
      ([name, url, seed]): Unchanged => [`a price sort on ${name}`, url, seed, 'price-asc'],
    ),
  ];

  afterEach(cleanupSearchMap);

  it.each(STALE)('requests Recommended over any type for %s', async (_name, url, seed) => {
    const list = listSpy();
    configureSearchMap({ list });
    await mount(url, seed, !seed);
    await firstSearch(list);

    expect(queryAt(list, 0).sort).toBe('recommended');
    expect(queryAt(list, 0).accommodationType).toBe('all');
  });

  it.each(KEPT)('requests the price sort over the type for %s', async (_name, url, seed) => {
    const list = listSpy();
    configureSearchMap({ list });
    await mount(url, seed, !seed);
    await firstSearch(list);

    expect(queryAt(list, 0).sort).toBe('price-asc');
    expect(queryAt(list, 0).accommodationType).toBe('girls');
  });

  it.each(STALE)('replaces the address without the sort for %s', async (_name, url, seed) => {
    const { navigate } = await mountWatched(url, { seed });
    await vi.waitFor(() => expect(urlQuery()).not.toHaveProperty('sort'));

    expect(navigate).toHaveBeenCalledTimes(1);
    expectSortStripAt(navigate, 0);
  });

  it('keeps the path and every other param when it takes the sort out', async () => {
    const viewport = 'ne_lat=31.6&ne_lng=74.5&sw_lat=31.4&sw_lng=74.2';
    await mountWatched(
      `/en/search/lahore?everywhere=1&gender=bogus&sort=price-asc&minPrice=5000&${viewport}`,
    );
    await vi.waitFor(() => expect(urlQuery()).not.toHaveProperty('sort'));

    expect(TestBed.inject(Router).url.split('?')[0]).toBe('/en/search/lahore');
    expect(urlQuery()).toEqual({
      everywhere: '1',
      gender: 'bogus',
      minPrice: '5000',
      ne_lat: '31.6',
      ne_lng: '74.5',
      sw_lat: '31.4',
      sw_lng: '74.2',
    });
  });

  it('cleans the address once and searches once, with no loop between them', async () => {
    const list = listSpy();
    const { navigate } = await mountWatched('/en/search/lahore?sort=price-asc', { list });
    await firstSearch(list);
    // Wait out more than twice the 600ms results debounce to confirm no second search follows.
    await new Promise<void>((r) => setTimeout(r, 1500));

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(queryAt(list, 0).sort).toBe('recommended');
    expect(urlQuery()).not.toHaveProperty('sort');
  });

  it.each(UNTOUCHED)('leaves the address alone for %s', async (_name, url, seed, sort) => {
    const list = listSpy();
    const { navigate } = await mountWatched(url, { seed, list });
    await firstSearch(list);

    expect(navigate).not.toHaveBeenCalled();
    expect(urlQuery()['sort']).toBe(sort);
    expect(queryAt(list, 0).sort).toBe(sort);
  });

  it('leaves the address alone on the server, which only reads the sort as absent', async () => {
    const list = listSpy();
    const { navigate } = await mountWatched('/en/search/lahore?sort=price-asc', {
      platform: 'server',
      list,
    });
    await firstSearch(list);

    expect(navigate).not.toHaveBeenCalled();
    expect(urlQuery()['sort']).toBe('price-asc');
    expect(queryAt(list, 0).sort).toBe('recommended');
  });

  it('cleans a stale entry the visitor navigates into once the page is up', async () => {
    const { fixture, navigate } = await mountWatched('/en/search/lahore');
    const router = TestBed.inject(Router);
    expect(navigate).not.toHaveBeenCalled();

    // What Back or Forward does to a page that is already showing.
    await router.navigateByUrl('/en/search/lahore?sort=price-asc');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(router.url).toBe('/en/search/lahore');
    });

    expect(navigate).toHaveBeenCalledTimes(1);
    expectSortStripAt(navigate, 0);
  });

  it('cleans the address again while a discarded sort stays in it, and stops once it is gone', async () => {
    // The clean-up never lands, so the sort is still in the URL when the URL changes again.
    const { fixture, navigate } = await mountWatched(
      '/en/search/lahore?sort=price-asc',
      { land: false },
    );
    const router = TestBed.inject(Router);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expectSortStripAt(navigate, 0);

    // `navigateByUrl` does not go through the stubbed `navigate`, so it really lands.
    await router.navigateByUrl('/en/search/lahore?sort=price-asc&minPrice=5000');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(navigate).toHaveBeenCalledTimes(2);
    });
    expectSortStripAt(navigate, 1);

    await router.navigateByUrl('/en/search/lahore?minPrice=5000');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(urlQuery()).toEqual({ minPrice: '5000' });
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['an empty sort', '/en/search?sort='],
    ['an unknown sort', '/en/search?sort=bogus'],
  ])('clears %s from the URL when a new search starts', async (_name, url) => {
    const { map, navigate } = await mountSearch(url);

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams).toHaveProperty('sort', null);
  });
});

/**
 * A `roomType` or `propertyType` outside the vocabulary: a shared link, a bookmark or an
 * address typed by hand. The request reads it as absent, which for a room type is the shared
 * default, so the list is not narrowed to a term no hostel carries. The address is left as
 * written, because nothing else reads these two keys raw and so nothing can bring them back.
 */
describe('SearchMap on a URL carrying a room or property type the search does not know', () => {
  const PLACE = '/en/search/lahore';
  const CITY_URL = '/en/hostels/lahore';
  const GIRLS_URL = '/en/hostels/lahore/girls';
  /** One unknown value for each key. */
  const BOGUS = 'roomType=bogus&propertyType=villa';

  afterEach(cleanupSearchMap);

  /** The first listings request a server-rendered page makes on `url`. */
  async function firstRequest(
    url: string,
    seed: Record<string, string> | null = null,
  ): Promise<ListQuery> {
    const list = listSpy();
    configureSearchMap({ list });
    await mount(url, seed, !seed);
    await firstSearch(list);
    return queryAt(list, 0);
  }

  /** The head a server-rendered search page asks for. */
  async function head(url: string) {
    const seo = seoSpy();
    configureSearchMap({ platform: 'server', localeReady: true, seo });
    await mount(url, null, true);
    return lastApply(seo);
  }

  /** What the page's first search reports to analytics, with `track` spied before it mounts. */
  async function searchReported(url: string): Promise<Record<string, unknown>> {
    configureSearchMap();
    const track: ReturnType<typeof vi.spyOn> = vi.spyOn(
      TestBed.inject(GoogleAnalyticsService),
      'track',
    );
    await mount(url, null, true);
    const [, params] = await vi.waitFor(
      () => {
        const call = (track.mock.calls as [string, Record<string, unknown>][]).find(
          ([name]) => name === 'search_performed',
        );
        if (!call) throw new Error('the search has not been reported yet');
        return call;
      },
      { timeout: 3000 },
    );
    return params;
  }

  it.each(['bogus', 'deluxe', 'Private', 'private-room'])(
    'requests a shared room for the unknown room type %s',
    async (roomType) => {
      const request = await firstRequest(`${PLACE}?roomType=${roomType}`);

      expect(request.roomType).toBe('shared');
    },
  );

  it.each(['bogus', 'villa', 'Apartment'])(
    'requests no property type for the unknown property type %s',
    async (propertyType) => {
      const request = await firstRequest(`${PLACE}?propertyType=${propertyType}`);

      expect(request.propertyType).toBeUndefined();
    },
  );

  it('requests a private room for the backend spelling of one', async () => {
    const request = await firstRequest(`${PLACE}?roomType=private_room`);

    expect(request.roomType).toBe('private');
  });

  const KNOWN: [key: 'roomType' | 'propertyType', value: string][] = [
    ['roomType', 'private'],
    ['roomType', 'shared'],
    ['propertyType', 'apartment'],
    ['propertyType', 'room'],
    ['propertyType', 'building'],
    ['propertyType', 'house'],
  ];

  it.each(KNOWN)('sends the known %s %s as it was given', async (key, value) => {
    const request = await firstRequest(`${PLACE}?${key}=${value}`);

    expect(request[key]).toBe(value);
  });

  type Opening = [name: string, url: string, seed: Record<string, string> | null, type: string];

  /** Where the unknown pair is opened, and the accommodation type that page then searches. */
  const OPENED: Opening[] = [
    ['a bare search', `/en/search?${BOGUS}`, null, 'all'],
    ['a place search', `${PLACE}?${BOGUS}`, null, 'all'],
    ['a worldwide search', `/en/search?everywhere=1&${BOGUS}`, null, 'all'],
    ['a city page', `${CITY_URL}?${BOGUS}`, CITY_SEED, 'all'],
    ['the girls page', `${GIRLS_URL}?${BOGUS}`, GIRLS_SEED, 'girls'],
  ];

  it.each(OPENED)(
    'requests a shared room and no property type for %s, keeping its type',
    async (_name, url, seed, type) => {
      const request = await firstRequest(url, seed);

      expect(request.roomType).toBe('shared');
      expect(request.propertyType).toBeUndefined();
      expect(request.accommodationType).toBe(type);
    },
  );

  it('corrects only the room type beside a type, a known property type, amenities and a sort', async () => {
    const request = await firstRequest(
      `${PLACE}?gender=girls&roomType=bogus&propertyType=house&amenities=ceiling-fan,heater&sort=price-asc`,
    );

    expect(request).toMatchObject({
      roomType: 'shared',
      propertyType: 'house',
      accommodationType: 'girls',
      amenities: ['ceiling-fan', 'heater'],
      sort: 'price-asc',
    });
  });

  type OpeningWithSort = [
    name: string,
    url: string,
    seed: Record<string, string> | null,
    type: string,
    sort: string,
  ];

  /** The unknown pair beside an unknown gender and a price sort, and what is then requested. */
  const WITH_BAD_COMPANY: OpeningWithSort[] = [
    ['a search page', `${PLACE}?gender=bogus&sort=price-asc&${BOGUS}`, null, 'all', 'recommended'],
    [
      'the girls page',
      `${GIRLS_URL}?gender=bogus&sort=price-asc&${BOGUS}`,
      GIRLS_SEED,
      'girls',
      'price-asc',
    ],
  ];

  it.each(WITH_BAD_COMPANY)(
    'reads the unknown pair as absent beside an unknown gender and a price sort on %s',
    async (_name, url, seed, type, sort) => {
      const request = await firstRequest(url, seed);

      expect(request).toMatchObject({
        roomType: 'shared',
        accommodationType: type,
        sort,
      });
      expect(request.propertyType).toBeUndefined();
    },
  );

  it.each([
    ['an unknown room type', `${PLACE}?roomType=bogus`],
    ['an unknown property type', `${PLACE}?propertyType=bogus`],
    ['an unknown room type and property type', `${PLACE}?${BOGUS}`],
  ])(
    'canonicalises a place search whose only filter is %s to its landing page',
    async (_name, url) => {
      const applied = await head(url);

      expect(applied['path']).toBe('/hostels/lahore');
      expect(applied['noindex']).toBeUndefined();
    },
  );

  it.each([
    ['a private room', `${PLACE}?roomType=private`],
    ['the backend spelling of a private room', `${PLACE}?roomType=private_room`],
    ['a house', `${PLACE}?propertyType=house`],
    ['an unknown room type beside an amenity', `${PLACE}?roomType=bogus&amenities=ceiling-fan`],
    ['an unknown room type with no place', '/en/search?roomType=bogus'],
  ])('keeps a search for %s out of the index', async (_name, url) => {
    const applied = await head(url);

    expect(applied['noindex']).toBe(true);
    expect(applied).not.toHaveProperty('path');
  });

  it('reports no property type to analytics for an unknown one', async () => {
    const reported = await searchReported(`${PLACE}?propertyType=bogus`);

    expect(reported).toHaveProperty('result_count', 1);
    expect(reported['property_type']).toBeUndefined();
  });

  it('reports a known property type to analytics', async () => {
    const reported = await searchReported(`${PLACE}?propertyType=house`);

    expect(reported).toHaveProperty('result_count', 1);
    expect(reported['property_type']).toBe('house');
  });

  it.each([
    ['unknown values only', `${PLACE}?${BOGUS}`],
    ['the backend spelling of a private room', `${PLACE}?roomType=private_room`],
    ['an unknown room type beside a sort the type offers', `${PLACE}?roomType=bogus&sort=newest`],
  ])('leaves the address as it was for %s', async (_name, url) => {
    const list = listSpy();
    const { navigate } = await mountWatched(url, { list });
    await firstSearch(list);

    expect(navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe(url);
  });

  it('takes only the stale sort out of the address, once, and leaves an unknown room type in it', async () => {
    const list = listSpy();
    const { navigate } = await mountWatched(`${PLACE}?roomType=bogus&sort=price-asc`, { list });
    await vi.waitFor(() => expect(urlQuery()).not.toHaveProperty('sort'));
    await firstSearch(list);

    expect(navigate).toHaveBeenCalledTimes(1);
    expectSortStripAt(navigate, 0);
    expect(urlQuery()).toEqual({ roomType: 'bogus' });
    expect(queryAt(list, 0)).toMatchObject({ roomType: 'shared', sort: 'recommended' });
  });
});
