import { Location } from '@angular/common';
import {
  Component,
  NO_ERRORS_SCHEMA,
  PLATFORM_ID,
  WritableSignal,
  inject,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  NavigationEnd,
  NavigationSkipped,
  Router,
  UrlSegment,
  provideRouter,
} from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { filter, firstValueFrom, of } from 'rxjs';
import { Listing, Paginated } from '@hostelhive/data-access';
import { GeolocationService, PlaceResult, SharedMap } from '@hostelhive/maps';
import { SessionStore } from '@core/auth';
import { CountryBounds } from '@core/geo/country-bounds';
import { GoogleAnalyticsService } from '@core/google-analytics/google-analytics.service';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { MobileApp } from '@core/mobile-app';
import { Seo } from '@core/seo';
import { DEFAULT_SOCIAL_IMAGE, placeSocialImage } from '@core/social-image';
import { CurrencyNamePipe } from '@app/shared/currency/currency-name.pipe';
import { ListingsApi, OffersApi } from '@services';
import { FavoritesStore } from '@util/favorites-store';
import { isMapKeyboardMove, SearchMap } from './search-map';

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
  ready(): boolean;
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
  minPrice?: number;
  maxPrice?: number;
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
  /** The amenity catalogue `OffersApi` answers with; none (an empty catalogue) by default. */
  amenitySlugs?: string[];
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
      {
        provide: OffersApi,
        useValue: {
          categories: () =>
            of(config.amenitySlugs ? [{ offers: config.amenitySlugs.map((slug) => ({ slug })) }] : []),
        },
      },
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
          listen: (event: string, handler: (e: unknown) => void) =>
            mapListeners.set(event, handler),
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

/** The handlers the page registered on the shared map, by Leaflet event name. */
const mapListeners = new Map<string, (e: unknown) => void>();

function cleanupSearchMap(): void {
  mapListeners.clear();
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
const BOYS_SEED = { ...LAHORE, gender: 'boys' };
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

/** A camera that reports one fixed viewport, standing in for Leaflet. */
const cameraAt = (b: { north: number; south: number; east: number; west: number }) => ({
  getBounds: () => ({
    getNorth: () => b.north,
    getSouth: () => b.south,
    getEast: () => b.east,
    getWest: () => b.west,
  }),
});

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

/**
 * Leaving the page while a search is still being debounced.
 *
 * Every pan restarts the 600ms results debounce. A visitor who pans and then, inside that
 * window, searches somewhere else or opens a listing has left the box behind: the page is
 * destroyed, and nothing is left to show that box's results.
 */
describe('SearchMap leaving with a search pending', () => {
  afterEach(cleanupSearchMap);

  it('does not send the pending search for the viewport being left', async () => {
    const list = listSpy();
    const { fixture, map } = await mountSearch('/en/search/lahore', {
      platform: 'browser',
      list,
    });
    await firstSearch(list);
    const searches = list.mock.calls.length;

    // A pan: the camera settles on a new box, which the page queues as its next search.
    map.map = cameraAt({ north: 31.6, south: 31.2, east: 74.8, west: 74.4 });
    map.captureMapBounds();
    fixture.detectChanges();
    // The page goes before the debounce is up.
    fixture.destroy();
    await new Promise<void>((r) => setTimeout(r, 1500));

    expect(list).toHaveBeenCalledTimes(searches);
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

// Trello #176 and #184: a hand-made or stale link with a value the search cannot use.
describe('SearchMap bad filter values in a link', () => {
  afterEach(cleanupSearchMap);

  const BAD_FILTERS =
    'roomType=bogus&propertyType=bogus&minPrice=abc&maxPrice=-5&amenities=wifi,bogus';

  it('searches as if the bad values were absent', async () => {
    const list = listSpy();
    configureSearchMap({ platform: 'browser', list, amenitySlugs: ['wifi', 'kitchen'] });
    await mount(`/en/search?everywhere=1&${BAD_FILTERS}`);
    await firstSearch(list);

    const q = lastQuery(list);
    expect(q.roomType).toBe('shared');
    expect(q.propertyType).toBeUndefined();
    expect(q.minPrice).toBeUndefined();
    expect(q.maxPrice).toBeUndefined();
    expect(q.amenities).toEqual(['wifi']);
  });

  it('keeps valid values as they are', async () => {
    const list = listSpy();
    configureSearchMap({ platform: 'browser', list, amenitySlugs: ['wifi', 'kitchen'] });
    await mount(
      '/en/search?everywhere=1&roomType=private&propertyType=house&minPrice=5000&maxPrice=20000&amenities=wifi,kitchen',
    );
    await firstSearch(list);

    expect(lastQuery(list)).toMatchObject({
      roomType: 'private',
      propertyType: 'house',
      minPrice: 5000,
      maxPrice: 20000,
      amenities: ['wifi', 'kitchen'],
    });
  });

  // The header bar reads the budget raw, so a bad one would come back through it; nothing
  // reads the room or property type or the amenities raw, so those stay, read as absent.
  it('takes only the bad budget out of the address', async () => {
    const { navigate } = await mountWatched(`/en/search?everywhere=1&${BAD_FILTERS}`, {
      amenitySlugs: ['wifi'],
    });
    await vi.waitFor(() => expect(urlQuery()).not.toHaveProperty('minPrice'));

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigationAt(navigate, 0).extras).toMatchObject({
      queryParams: { minPrice: null, maxPrice: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    expect(urlQuery()).toEqual({
      everywhere: '1',
      roomType: 'bogus',
      propertyType: 'bogus',
      amenities: 'wifi,bogus',
    });
  });

  it('takes garbage coordinates and zoom out of the address and searches without them', async () => {
    const list = listSpy();
    await mountWatched('/en/search?lat=abc&lng=74.3&zoom=x&minPrice=5000', { list });
    await firstSearch(list);
    await vi.waitFor(() => expect(urlQuery()).toEqual({ minPrice: '5000' }));

    expect(lastQuery(list).near).toBeUndefined();
  });

  it('leaves the amenities alone while there is no catalogue to check them against', async () => {
    const list = listSpy();
    const { navigate } = await mountWatched('/en/search?everywhere=1&amenities=bogus', { list });
    await firstSearch(list);

    expect(navigate).not.toHaveBeenCalled();
    expect(lastQuery(list).amenities).toEqual(['bogus']);
  });

  it('does not carry a bad budget into a new search', async () => {
    const { map, navigate } = await mountSearch('/en/search?minPrice=abc&maxPrice=-1');

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras.queryParams).toMatchObject({
      minPrice: null,
      maxPrice: null,
    });
  });

  it.each([
    ['an explicit shared room type', 'roomType=shared', undefined],
    ['a private room type', 'roomType=private', true],
  ])('indexes a curated place with %s accordingly', async (_name, filter, noindex) => {
    const seo = seoSpy();
    configureSearchMap({ platform: 'server', localeReady: true, seo });
    await mount(`/en/search/lahore?${filter}`, null, true);

    expect(lastApply(seo)['noindex']).toBe(noindex);
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

/**
 * Every fresh search is reported as `search_performed`, with what the seeker did to run it
 * (Trello #157), so GA can count searches without the pans.
 */
describe('SearchMap search_performed trigger', () => {
  afterEach(cleanupSearchMap);

  /** Mounts a routed browser search page with `track` spied before it exists. */
  async function mountTracked(url: string) {
    configureSearchMap({ platform: 'browser' });
    const track = vi.spyOn(TestBed.inject(GoogleAnalyticsService), 'track');
    const mounted = await mount(url, null, true);
    return { ...mounted, track };
  }

  /** The `trigger` of each `search_performed` sent so far, in order. */
  const triggers = (track: ReturnType<typeof vi.spyOn>) =>
    (track.mock.calls as [string, Record<string, unknown>][])
      .filter(([name]) => name === 'search_performed')
      .map(([, params]) => params['trigger']);

  /** Waits for the `n`th report and returns every trigger so far. */
  async function reported(track: ReturnType<typeof vi.spyOn>, n: number) {
    await vi.waitFor(() => expect(triggers(track).length).toBeGreaterThanOrEqual(n), {
      timeout: 3000,
    });
    return triggers(track);
  }

  it('reports the first search on a page as the arrival', async () => {
    const { track } = await mountTracked('/en/search/lahore');

    expect(await reported(track, 1)).toEqual(['arrival']);
  });

  it('reports a settled pan as the map', async () => {
    const { fixture, map, track } = await mountTracked('/en/search/lahore');
    await reported(track, 1);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    map.map = cameraAt({ north: 31.6, south: 31.2, east: 74.8, west: 74.4 });
    map.captureMapBounds();
    fixture.detectChanges();

    expect(await reported(track, 2)).toEqual(['arrival', 'map']);
  });

  it('reports a filter change as a filter', async () => {
    const { track } = await mountTracked('/en/search/lahore');
    await reported(track, 1);

    await TestBed.inject(Router).navigateByUrl('/en/search/lahore?gender=boys');

    expect(await reported(track, 2)).toEqual(['arrival', 'filter']);
  });

  it('reports a new place on the same page as a place', async () => {
    const { track } = await mountTracked('/en/search');
    await reported(track, 1);

    await TestBed.inject(Router).navigateByUrl(
      '/en/search?place=My%20location&lat=24.8607&lng=67.0011',
    );

    expect(await reported(track, 2)).toEqual(['arrival', 'place']);
  });

  it('names a place and the camera settling on it once, as the place', async () => {
    const { fixture, map, track } = await mountTracked('/en/search');
    await reported(track, 1);

    // Both inside one debounce window: the place lands, then the camera settles on it.
    await TestBed.inject(Router).navigateByUrl('/en/search?lat=24.8607&lng=67.0011');
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    map.map = cameraAt({ north: 25, south: 24.7, east: 67.2, west: 66.8 });
    map.captureMapBounds();
    fixture.detectChanges();
    await new Promise<void>((r) => setTimeout(r, 1200));

    expect(triggers(track)).toEqual(['arrival', 'place']);
  });

  it('reports widening a bare search in place as everywhere', async () => {
    const { map, track } = await mountTracked('/en/search?lat=31.5204&lng=74.3587');
    await reported(track, 1);

    map.searchEverywhere();

    expect(await reported(track, 2)).toEqual(['arrival', 'everywhere']);
  });

  it('reports a retry of the same search as a retry', async () => {
    const { map, track } = await mountTracked('/en/search/lahore');
    await reported(track, 1);

    (map as unknown as { retryNow(): void }).retryNow();

    expect(await reported(track, 2)).toEqual(['arrival', 'retry']);
  });

  /** Mounts after a navigation that, while it was current, carried `state`. */
  async function mountAfter(state: Record<string, unknown>) {
    configureSearchMap({ platform: 'browser' });
    const router = TestBed.inject(Router);
    const track = vi.spyOn(TestBed.inject(GoogleAnalyticsService), 'track');
    await router.navigateByUrl('/en/search/karachi');
    // The app builds the page while its navigation is still current; this mount comes after.
    vi.spyOn(router, 'currentNavigation').mockReturnValue({
      extras: { state },
    } as unknown as ReturnType<Router['currentNavigation']>);
    await mount(undefined, null, true);
    return track;
  }

  it('takes the first trigger from the navigation that built the page', async () => {
    const track = await mountAfter({ searchTrigger: 'place' });

    expect(await reported(track, 1)).toEqual(['place']);
  });

  it('ignores a navigation state that is not a trigger', async () => {
    const track = await mountAfter({ searchTrigger: 'bogus' });

    expect(await reported(track, 1)).toEqual(['arrival']);
  });

  it('tells the page a place pick builds that it was a place', async () => {
    const { map, navigate } = await mountSearch('/en/search');

    map.onPlaceSelected(KARACHI);

    expect(firstNavigation(navigate).extras['state']).toEqual({ searchTrigger: 'place' });
  });

  it('tells the page Search everywhere builds from a place path that it was everywhere', async () => {
    const { map, navigate } = await mountSearch('/en/search/lahore', { platform: 'browser' });

    map.searchEverywhere();

    expect(firstNavigation(navigate).extras['state']).toEqual({ searchTrigger: 'everywhere' });
  });
});

/**
 * Bare `/search` names no place, so the heading reads the country the map opened on, or
 * Pakistan. Once the visitor has chosen the area, neither describes it (Trello #161).
 */
describe('SearchMap heading over an area the visitor chose', () => {
  afterEach(cleanupSearchMap);

  const VIEWPORT = 'ne_lat=53.5&ne_lng=7.2&sw_lat=50.8&sw_lng=3.4';

  const heading = (fixture: ComponentFixture<SearchMap>) =>
    (fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent?.trim();

  async function pannedOn(url: string) {
    configureSearchMap();
    const { fixture, map } = await mount(url, null, true);
    map.leftHomeCountry();
    fixture.detectChanges();
    return heading(fixture);
  }

  it('reads Pakistan on a bare search the visitor has not moved', async () => {
    configureSearchMap();
    const { fixture } = await mount('/en/search', null, true);

    expect(heading(fixture)).toBe('Pakistan');
  });

  it('reads This map area once the visitor pans a bare search', async () => {
    expect(await pannedOn('/en/search')).toBe('searchUi.mapArea');
  });

  it('reads This map area on a bare search link carrying a viewport', async () => {
    configureSearchMap();
    const { fixture } = await mount(`/en/search?${VIEWPORT}`, null, true);

    expect(heading(fixture)).toBe('searchUi.mapArea');
  });

  it('keeps naming a place the query names with no known position after a pan', async () => {
    expect(await pannedOn('/en/search?place=Lahore')).toBe('Lahore');
  });

  it('keeps naming the place path after a pan with no settled view, which counts as framed', async () => {
    expect(await pannedOn('/en/search/lahore')).toBe('Lahore');
  });

  it('titles a bare search link carrying a viewport for the map area, not a country', async () => {
    const seo = seoSpy();
    configureSearchMap({ platform: 'server', localeReady: true, seo });
    await mount(`/en/search?${VIEWPORT}`, null, true);
    const applied = lastApply(seo);

    expect(applied['title']).toBe('seo.mapAreaTitle');
    expect(applied['description']).toBe('seo.mapAreaDescription');
    expect(applied['noindex']).toBe(true);
  });
});

/** The text of the page heading. */
const h1Text = (fixture: ComponentFixture<SearchMap>) =>
  (fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent?.trim();

/** `url` with more query keys joined on, whether or not it already has a query. */
const withQuery = (url: string, ...keys: string[]): string =>
  `${url}${url.includes('?') ? '&' : '?'}${keys.join('&')}`;

/** What the page last asked `key` to be translated with. */
const lastParams = (translate: ReturnType<typeof vi.spyOn>, key: string) =>
  (translate.mock.calls as [string, Record<string, unknown>?][])
    .filter(([name]) => name === key)
    .at(-1)?.[1];

/** A pasted place path and a place the visitor picked: neither carries a viewport. */
const PRISTINE = '/en/search/lahore';
const PICKED = '/en/search?place=Lahore&lat=31.5204&lng=74.3587&zoom=11';

/** Viewports as the four corner keys: one nowhere near Lahore, one around it. */
const FAR = 'ne_lat=20&ne_lng=100&sw_lat=10&sw_lng=90';
const FRAMING = 'ne_lat=31.75&ne_lng=74.70&sw_lat=31.30&sw_lng=74.00';

/** The camera settled on the viewport around Lahore, and on one far to the east of it. */
const LAHORE_CAM = cameraAt({ north: 31.75, south: 31.3, east: 74.7, west: 74.0 });
const FAR_EAST_CAM = cameraAt({ north: 32, south: 31, east: 97.5, west: 96.5 });

/** A place search that is a page of its own: indexable, canonical to the landing page. */
function expectPlacePageHead(applied: Record<string, unknown>, slug: string): void {
  expect(applied['title']).toBe('seo.searchTitle');
  expect(applied['path']).toBe(`/hostels/${slug}`);
  expect(applied['noindex']).toBeUndefined();
  expect(applied['image']).toBe(placeSocialImage(slug));
}

/** A view of the place: out of the index, with no canonical, and the place's own picture. */
function expectPlaceViewHead(applied: Record<string, unknown>, slug: string): void {
  expect(applied['title']).toBe('seo.searchTitle');
  expect(applied['noindex']).toBe(true);
  expect(applied).not.toHaveProperty('path');
  expect(applied['image']).toBe(placeSocialImage(slug));
}

/** A view the map has taken off the place: titled as the map area, and out of the index. */
function expectMapAreaHead(applied: Record<string, unknown>): void {
  expect(applied['title']).toBe('seo.mapAreaTitle');
  expect(applied['description']).toBe('seo.mapAreaDescription');
  expect(applied['noindex']).toBe(true);
  expect(applied).not.toHaveProperty('path');
  expect(applied['image']).toBe(DEFAULT_SOCIAL_IMAGE);
}

/**
 * A search link that arrives carrying a viewport is a view of the map, not a place page: it
 * stays out of the index with no canonical, and its heading follows whether the map still
 * frames the place. A server render is the arrival itself, so it is where that is read.
 */
describe('SearchMap head and heading on a place search link carrying a viewport', () => {
  afterEach(cleanupSearchMap);

  /** A server render of `url`: the head it asked for, the heading it drew and its translations. */
  async function render(url: string) {
    const seo = seoSpy();
    configureSearchMap({ platform: 'server', localeReady: true, seo });
    // The test i18n returns the bare key, so the place can only be seen in what it was asked.
    const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');
    const { fixture } = await mount(url, null, true);
    return { applied: lastApply(seo), heading: h1Text(fixture), translate };
  }

  /** A search that names a place with no page of its own to canonicalise to. */
  function expectNamedFacetHead(
    applied: Record<string, unknown>,
    translate: ReturnType<typeof vi.spyOn>,
    place: string,
  ): void {
    expect(applied['title']).toBe('seo.searchTitle');
    expect(applied['description']).toBe('seo.searchDescription');
    expect(applied['noindex']).toBe(true);
    expect(applied).not.toHaveProperty('path');
    expect(applied['image']).toBe(DEFAULT_SOCIAL_IMAGE);
    expect(lastParams(translate, 'seo.searchTitle')).toEqual({ place });
    expect(lastParams(translate, 'seo.searchDescription')).toEqual({ place });
  }

  it('names the place but keeps a link that frames it out of the index, with no canonical', async () => {
    const { applied, heading, translate } = await render(withQuery(PRISTINE, FRAMING));

    expect(heading).toBe('Lahore');
    expectPlaceViewHead(applied, 'lahore');
    expect(applied['description']).toBe('seo.searchPlaceDescription');
    expect(lastParams(translate, 'seo.searchTitle')).toEqual({ place: 'Lahore' });
    expect(lastParams(translate, 'seo.searchPlaceDescription')).toEqual({ place: 'Lahore' });
  });

  it.each([
    ['a place path', withQuery(PRISTINE, FAR)],
    ['a picked place', withQuery(PICKED, FAR)],
  ])('titles %s with a viewport far from the place as the map area', async (_name, url) => {
    const { applied, heading } = await render(url);

    expect(heading).toBe('searchUi.mapArea');
    expectMapAreaHead(applied);
  });

  it.each([
    ['a corner missing', 'ne_lat=31.75&ne_lng=74.70&sw_lat=31.30'],
    ['a corner that is not a number', 'ne_lat=31.75&ne_lng=74.70&sw_lat=31.30&sw_lng=abc'],
    ['no area', 'ne_lat=31.5&ne_lng=74.4&sw_lat=31.5&sw_lng=74.4'],
  ])('reads a viewport with %s as none', async (_name, viewport) => {
    const { applied, heading } = await render(withQuery(PRISTINE, viewport));

    expect(heading).toBe('Lahore');
    expectPlacePageHead(applied, 'lahore');
  });

  it('titles a filtered link far from the place as the map area', async () => {
    const { applied, heading } = await render(withQuery(PRISTINE, 'gender=girls', FAR));

    expect(heading).toBe('searchUi.mapArea');
    expectMapAreaHead(applied);
  });

  it('names the place on a filtered link that frames it, out of the index with the default picture', async () => {
    const { applied, heading, translate } = await render(
      withQuery(PRISTINE, 'gender=girls', FRAMING),
    );

    expect(heading).toBe('Lahore');
    expectNamedFacetHead(applied, translate, 'Lahore');
  });

  it('keeps naming a place with no known centre whatever viewport the link carries', async () => {
    const { applied, heading, translate } = await render(withQuery('/en/search/dha-phase-5', FAR));

    expect(heading).toBe('Dha Phase 5');
    expectNamedFacetHead(applied, translate, 'Dha Phase 5');
  });

  it('titles a link whose picked place is far from its viewport as the map area, not the path slug', async () => {
    const karachi = 'place=Karachi&lat=24.8607&lng=67.0011&zoom=11';
    const { applied, heading } = await render(withQuery(PRISTINE, karachi, FRAMING));

    expect(heading).toBe('searchUi.mapArea');
    expectMapAreaHead(applied);
  });

  it('reads Everywhere on a worldwide link whatever viewport it carries', async () => {
    const { applied, heading } = await render(withQuery('/en/search', 'everywhere=1', FAR));

    expect(heading).toBe('searchUi.everywhere');
    expect(applied['title']).toBe('seo.worldwideTitle');
    expect(applied['noindex']).toBe(true);
    expect(applied).not.toHaveProperty('path');
  });

  it('leaves the head to a landing page whatever viewport its link carries', async () => {
    const seo = seoSpy();
    configureSearchMap({ platform: 'server', localeReady: true, seo });

    await mount(withQuery('/en/hostels/lahore', FAR), CITY_SEED);

    expect(seo.apply).not.toHaveBeenCalled();
  });
});

/**
 * The verdict belongs to the link the page arrived by. The map writes its own viewport into
 * the address once its camera moves after load (fitting the results, a resize, the visitor),
 * and that must not turn a place page into a view, while the heading and head still follow
 * where the map is.
 */
describe('SearchMap place search head as the map moves', () => {
  afterEach(cleanupSearchMap);

  async function openInBrowser(url: string) {
    const seo = seoSpy();
    const mounted = await mountWatched(url, { localeReady: true, seo });
    return { ...mounted, seo };
  }

  /** Lets change detection run the effects and the router finish what it was doing. */
  async function flushPage(fixture: ComponentFixture<SearchMap>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Runs `act`, waits for the navigation it starts to end (or be skipped), then flushes. */
  async function settleAfter(fixture: ComponentFixture<SearchMap>, act: () => unknown) {
    const ended = firstValueFrom(
      TestBed.inject(Router).events.pipe(
        filter((e) => e instanceof NavigationEnd || e instanceof NavigationSkipped),
      ),
    );
    await Promise.all([ended, act()]);
    await flushPage(fixture);
  }

  it.each([
    ['a place path', PRISTINE],
    ['a picked place', PICKED],
  ])('keeps %s indexable after the map writes its own viewport', async (_name, url) => {
    const { fixture, map, seo } = await openInBrowser(url);
    map.map = LAHORE_CAM;

    await settleAfter(fixture, () => map.captureMapBounds());

    // The write has landed, so a verdict read from the live address would now see a viewport.
    expect(urlQuery()).toHaveProperty('ne_lat', '31.75');
    expect(h1Text(fixture)).toBe('Lahore');
    expectPlacePageHead(lastApply(seo), 'lahore');
  });

  it('reads the map area and leaves the index when the map settles away from the place', async () => {
    const { fixture, map, seo } = await openInBrowser(PRISTINE);
    expect(h1Text(fixture)).toBe('Lahore');
    expectPlacePageHead(lastApply(seo), 'lahore');
    map.map = FAR_EAST_CAM;

    await settleAfter(fixture, () => map.captureMapBounds());

    expect(urlQuery()).toHaveProperty('ne_lat', '32');
    expect(h1Text(fixture)).toBe('searchUi.mapArea');
    expectMapAreaHead(lastApply(seo));
  });

  it('returns to the place, its canonical and the index when the map settles back on it', async () => {
    const { fixture, map, seo } = await openInBrowser(PRISTINE);
    map.map = FAR_EAST_CAM;
    await settleAfter(fixture, () => map.captureMapBounds());
    expect(urlQuery()).toHaveProperty('ne_lat', '32');
    expect(h1Text(fixture)).toBe('searchUi.mapArea');
    map.map = LAHORE_CAM;

    await settleAfter(fixture, () => map.captureMapBounds());

    expect(urlQuery()).toHaveProperty('ne_lat', '31.75');
    expect(h1Text(fixture)).toBe('Lahore');
    expectPlacePageHead(lastApply(seo), 'lahore');
  });

  it('leaves the index when a pushed navigation brings a viewport that frames the place', async () => {
    const { fixture, seo } = await openInBrowser(PRISTINE);
    const router = TestBed.inject(Router);
    expectPlacePageHead(lastApply(seo), 'lahore');

    await settleAfter(fixture, () => router.navigateByUrl(withQuery(PRISTINE, FRAMING)));

    expect(router.url).toContain('ne_lat=31.75');
    expect(h1Text(fixture)).toBe('Lahore');
    expectPlaceViewHead(lastApply(seo), 'lahore');
  });

  it('returns to the index when a pushed navigation drops the viewport', async () => {
    const { fixture, seo } = await openInBrowser(withQuery(PRISTINE, FRAMING));
    const router = TestBed.inject(Router);
    expectPlaceViewHead(lastApply(seo), 'lahore');

    await settleAfter(fixture, () => router.navigateByUrl(PRISTINE));

    expect(router.url).not.toContain('ne_lat');
    expect(h1Text(fixture)).toBe('Lahore');
    expectPlacePageHead(lastApply(seo), 'lahore');
  });

  it('treats Back onto an entry the map wrote its viewport to as an arrival with a viewport', async () => {
    const { fixture, map, seo } = await openInBrowser(PRISTINE);
    const router = TestBed.inject(Router);
    // A test module is never bootstrapped, so the router is not listening for Back until told to.
    router.setUpLocationChangeListener();
    map.map = LAHORE_CAM;
    await settleAfter(fixture, () => map.captureMapBounds());
    expect(urlQuery()).toHaveProperty('ne_lat', '31.75');
    expectPlacePageHead(lastApply(seo), 'lahore');
    await settleAfter(fixture, () => router.navigateByUrl('/en/search/karachi'));
    expect(router.url).not.toContain('ne_lat');

    await settleAfter(fixture, () => TestBed.inject(Location).back());

    expect(router.url).toContain('/en/search/lahore');
    expect(router.url).toContain('ne_lat=31.75');
    expect(h1Text(fixture)).toBe('Lahore');
    expectPlaceViewHead(lastApply(seo), 'lahore');
  });

  it('keeps a link carrying a viewport out of the index when the map recentres and drops it', async () => {
    const { fixture, map, seo } = await openInBrowser(withQuery(PRISTINE, FRAMING));
    expectPlaceViewHead(lastApply(seo), 'lahore');
    map.map = { setView: vi.fn() };

    await settleAfter(fixture, () => map.recenterTo({ lat: 31.5204, lng: 74.3587 }));

    // The address no longer carries the viewport the link arrived with.
    expect(urlQuery()).not.toHaveProperty('ne_lat');
    expect(h1Text(fixture)).toBe('Lahore');
    expectPlaceViewHead(lastApply(seo), 'lahore');
  });

  it('names a newly searched place and canonicalises it after the map was away from the last', async () => {
    const { fixture, map, seo } = await openInBrowser(PRISTINE);
    const router = TestBed.inject(Router);
    map.map = FAR_EAST_CAM;
    await settleAfter(fixture, () => map.captureMapBounds());
    expect(h1Text(fixture)).toBe('searchUi.mapArea');
    await settleAfter(fixture, () => router.navigateByUrl('/en/search/karachi'));
    map.map = { setView: vi.fn() };

    await settleAfter(fixture, () => map.recenterTo({ lat: KARACHI.lat, lng: KARACHI.lng }));

    expect(h1Text(fixture)).toBe('Karachi');
    expectPlacePageHead(lastApply(seo), 'karachi');
  });

  it('keeps the place field on the searched place while the heading reads the map area', async () => {
    const { fixture, map } = await openInBrowser(PRISTINE);
    const placeField = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement & { value: string }>(
        'hh-place-search',
      );
    expect(placeField()?.value).toBe('Lahore');
    map.map = FAR_EAST_CAM;

    await settleAfter(fixture, () => map.captureMapBounds());

    expect(h1Text(fixture)).toBe('searchUi.mapArea');
    expect(placeField()?.value).toBe('Lahore');
  });

  it('reads the map area once a place with no zoom is off screen after the map settles', async () => {
    const { fixture, map, seo } = await openInBrowser(
      '/en/search?place=My%20location&lat=31.5204&lng=74.3587',
    );
    expect(h1Text(fixture)).toBe('My location');
    // The fit to the results lands east of the place, so its point is no longer on screen.
    map.map = cameraAt({ north: 31.56, south: 31.5, east: 74.5, west: 74.4 });

    await settleAfter(fixture, () => map.captureMapBounds());

    expect(urlQuery()).toHaveProperty('ne_lat', '31.56');
    expect(h1Text(fixture)).toBe('searchUi.mapArea');
    expectMapAreaHead(lastApply(seo));
  });

  it('judges a navigation as an arrival when the router last recorded a different one', async () => {
    const { fixture, map, seo } = await openInBrowser(PRISTINE);
    const router = TestBed.inject(Router);
    // A same-path replace of this page, which would read as a refinement if it were this one's.
    const stale = {
      id: -1,
      trigger: 'imperative',
      extras: { replaceUrl: true },
      previousNavigation: { finalUrl: router.parseUrl(PRISTINE) },
    };
    // The spy's getter overload rejects function-typed keys, so view the signal as a plain value.
    const recorded = router as unknown as { lastSuccessfulNavigation: object };
    vi.spyOn(recorded, 'lastSuccessfulNavigation', 'get').mockReturnValue(() => stale);
    map.map = LAHORE_CAM;

    await settleAfter(fixture, () => map.captureMapBounds());

    expect(urlQuery()).toHaveProperty('ne_lat', '31.75');
    expect(h1Text(fixture)).toBe('Lahore');
    expectPlaceViewHead(lastApply(seo), 'lahore');
  });
});

/** The box a camera reports. */
type CameraBox = Parameters<typeof cameraAt>[0];

const FAR_BOX: CameraBox = { north: 20, south: 10, east: 100, west: 90 };
const FRAMING_BOX: CameraBox = { north: 31.75, south: 31.3, east: 74.7, west: 74 };
/** A box inside Lahore that none of the links in these specs carries. */
const PANNED: CameraBox = { north: 31.6, south: 31.4, east: 74.5, west: 74.2 };
const NEAR_LAHORE = { lat: 31.5204, lng: 74.3587 };

const NO_HOSTELS: Paginated<Listing> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const CITY_PAGE = '/en/hostels/lahore';
const GIRLS_PAGE = '/en/hostels/lahore/girls';
const CAMPUS_PAGE = '/en/hostels/lahore/punjab-university';

type LandingPage = [
  name: string,
  url: string,
  seed: Record<string, string>,
  centre: { lat: number; lng: number },
  type: string,
];

/** The three kinds of landing page, each with the place and type it searches. */
const LANDING_PAGES: LandingPage[] = [
  ['a city page', CITY_PAGE, CITY_SEED, NEAR_LAHORE, 'all'],
  ['the girls page', GIRLS_PAGE, GIRLS_SEED, NEAR_LAHORE, 'girls'],
  ['a campus page', CAMPUS_PAGE, CAMPUS_SEED, { lat: 31.4979, lng: 74.3035 }, 'all'],
];

/** What the shared map hands back from `acquire`: a camera and Leaflet, both recording. */
function fakeLeaflet() {
  const marker = {
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    getElement: vi.fn(() => undefined),
    setIcon: vi.fn(),
    setZIndexOffset: vi.fn(),
  };
  const camera = { fitBounds: vi.fn(), setView: vi.fn(), invalidateSize: vi.fn() };
  const leaflet = {
    // The corners come back as they went in, so a call reads as the box it framed.
    latLngBounds: vi.fn((...corners: unknown[]) => corners),
    divIcon: vi.fn((options: unknown) => options),
    marker: vi.fn(() => marker),
  };
  const acquire = vi.fn().mockResolvedValue({ map: camera, leaflet });
  return { acquire, camera, leaflet };
}

/** Builds the map as its first reveal does, and waits until the page counts it as up. */
async function openMap(
  fixture: ComponentFixture<SearchMap>,
  map: SearchMapInternals,
): Promise<void> {
  await map.ensureMap();
  await vi.waitFor(
    () => {
      fixture.detectChanges();
      expect(map.ready()).toBe(true);
    },
    { timeout: 3000 },
  );
}

/** The camera settles on `box`; resolves with the first request the page makes after it. */
async function settleOn(
  fixture: ComponentFixture<SearchMap>,
  map: SearchMapInternals,
  list: ReturnType<typeof vi.fn>,
  box: CameraBox,
): Promise<ListQuery> {
  const before = list.mock.calls.length;
  map.map = cameraAt(box);
  map.captureMapBounds();
  await vi.waitFor(
    () => {
      fixture.detectChanges();
      expect(list.mock.calls.length).toBeGreaterThan(before);
    },
    { timeout: 3000 },
  );
  return queryAt(list, before);
}

/** The `trigger` of each `search_performed` sent so far, in order. */
const searchTriggers = (track: ReturnType<typeof vi.spyOn>) =>
  (track.mock.calls as [string, Record<string, unknown>][])
    .filter(([name]) => name === 'search_performed')
    .map(([, params]) => params['trigger']);

/**
 * A landing page's path is its place, so a viewport in its link is ignored: the camera opens
 * on the place and the list searches near it, in the server render and in the browser alike.
 */
describe('SearchMap on a landing page link carrying a viewport', () => {
  afterEach(cleanupSearchMap);

  it.each([
    ['a far viewport', FAR],
    ['a viewport framing the place', FRAMING],
  ])('searches near the place on a server render of a link with %s', async (_name, viewport) => {
    const list = listSpy();
    configureSearchMap({ list });
    await mount(withQuery(CITY_PAGE, viewport), CITY_SEED);
    await firstSearch(list);

    expect(queryAt(list, 0).near).toEqual(NEAR_LAHORE);
    expect(queryAt(list, 0).bounds).toBeUndefined();
  });

  it.each(LANDING_PAGES)(
    'searches near the place, not the far viewport, on %s in the browser',
    async (_name, url, seed, centre, type) => {
      const list = listSpy();
      await mountWatched(withQuery(url, FAR), { seed, list });
      await firstSearch(list);

      const first = queryAt(list, 0);
      expect(first.near).toEqual(centre);
      expect(first.bounds).toBeUndefined();
      expect(first.accommodationType).toBe(type);
    },
  );

  it.each([
    ['a corner missing', 'ne_lat=31.75&ne_lng=74.70&sw_lat=31.30'],
    ['a corner that is not a number', 'ne_lat=31.75&ne_lng=74.70&sw_lat=31.30&sw_lng=abc'],
    ['no area', 'ne_lat=31.5&ne_lng=74.4&sw_lat=31.5&sw_lng=74.4'],
  ])('reads a viewport with %s as none and leaves the address alone', async (_name, viewport) => {
    const list = listSpy();
    const url = withQuery(CITY_PAGE, viewport);
    const { navigate } = await mountWatched(url, { seed: CITY_SEED, list });
    await firstSearch(list);

    expect(queryAt(list, 0).near).toEqual(NEAR_LAHORE);
    expect(queryAt(list, 0).bounds).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe(url);
  });

  it('opens the camera on the place without fitting the viewport or framing the visitor country', async () => {
    const list = vi.fn(() => of(NO_HOSTELS)) as ReturnType<typeof vi.fn>;
    const forVisitor = vi.fn().mockResolvedValue(HOME);
    const { acquire, camera } = fakeLeaflet();
    const { fixture, map } = await mountWatched(withQuery(CITY_PAGE, FAR), {
      seed: CITY_SEED,
      list,
      acquire,
      forVisitor,
    });

    await openMap(fixture, map);
    await firstSearch(list);
    fixture.detectChanges();

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire.mock.calls[0][1]).toEqual({ center: [31.5204, 74.3587], zoom: 11 });
    expect(camera.fitBounds).not.toHaveBeenCalled();
    expect(forVisitor).not.toHaveBeenCalled();
  });

  it('centres the camera on the place once the results arrive, without fitting the viewport', async () => {
    const list = listSpy();
    const { acquire, camera, leaflet } = fakeLeaflet();
    const { fixture, map } = await mountWatched(withQuery(CITY_PAGE, FAR), {
      seed: CITY_SEED,
      list,
      acquire,
    });

    await openMap(fixture, map);
    // The pins are drawn once the results are in, and the camera follows them.
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(leaflet.marker).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    expect(camera.setView).toHaveBeenCalledTimes(1);
    expect(camera.setView).toHaveBeenCalledWith([31.5204, 74.3587], 11);
    expect(camera.fitBounds).not.toHaveBeenCalled();
  });

  it('drops the viewport the page was searching when it becomes a landing page', async () => {
    const list = listSpy();
    const { fixture } = await mountWatched(withQuery('/en/hostels/nowhere', FAR), {
      list,
      routed: false,
    });
    await firstSearch(list);
    expect(queryAt(list, 0).bounds).toEqual(FAR_BOX);
    const before = list.mock.calls.length;

    fixture.componentRef.setInput('seed', CITY_SEED);
    fixture.detectChanges();
    await vi.waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before), {
      timeout: 3000,
    });

    expect(lastQuery(list).near).toEqual(NEAR_LAHORE);
    expect(lastQuery(list).bounds).toBeUndefined();
  });
});

/**
 * Moving the map on a landing page still searches the box on screen, but only in memory: the
 * address never gains a viewport, and the one its link arrived with is left as it was.
 */
describe('SearchMap on a landing page as its map moves', () => {
  afterEach(cleanupSearchMap);

  it.each(LANDING_PAGES)(
    'searches the box on screen and keeps the address clean on %s',
    async (_name, url, seed, _centre, type) => {
      const list = listSpy();
      const { fixture, map, navigate } = await mountWatched(url, { seed, list });
      await firstSearch(list);

      const next = await settleOn(fixture, map, list, PANNED);

      expect(next.bounds).toEqual(PANNED);
      expect(next.near).toBeUndefined();
      expect(next.accommodationType).toBe(type);
      expect(navigate).not.toHaveBeenCalled();
      expect(urlQuery()).toEqual({});
    },
  );

  it('searches the box on screen and keeps the viewport its link arrived with', async () => {
    const list = listSpy();
    const { fixture, map, navigate } = await mountWatched(withQuery(CITY_PAGE, FAR), {
      seed: CITY_SEED,
      list,
    });
    await firstSearch(list);

    const next = await settleOn(fixture, map, list, PANNED);

    expect(next.bounds).toEqual(PANNED);
    expect(next.near).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
    expect(urlQuery()).toEqual({
      ne_lat: '20',
      ne_lng: '100',
      sw_lat: '10',
      sw_lng: '90',
    });
  });

  it('keeps the box on screen when the page is reused for another type', async () => {
    const list = listSpy();
    const { fixture, map } = await mountWatched(GIRLS_PAGE, {
      seed: GIRLS_SEED,
      list,
      land: false,
    });
    await firstSearch(list);
    const panned = await settleOn(fixture, map, list, PANNED);
    expect(panned.accommodationType).toBe('girls');
    expect(panned.bounds).toEqual(PANNED);
    const before = list.mock.calls.length;

    fixture.componentRef.setInput('seed', BOYS_SEED);
    fixture.detectChanges();
    await vi.waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before), {
      timeout: 3000,
    });

    const reused = queryAt(list, before);
    expect(reused.accommodationType).toBe('boys');
    expect(reused.bounds).toEqual(PANNED);
    expect(reused.near).toBeUndefined();
  });

  it('reports a settled pan as the map', async () => {
    configureSearchMap({ platform: 'browser' });
    const track = vi.spyOn(TestBed.inject(GoogleAnalyticsService), 'track');
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { fixture, map } = await mount(CITY_PAGE, CITY_SEED);
    await vi.waitFor(() => expect(searchTriggers(track)).toEqual(['arrival']), {
      timeout: 3000,
    });

    map.map = cameraAt(PANNED);
    map.captureMapBounds();
    fixture.detectChanges();

    await vi.waitFor(() => expect(searchTriggers(track)).toEqual(['arrival', 'map']), {
      timeout: 3000,
    });
  });

  it('searches the box on screen over a worldwide key and leaves the key in the address', async () => {
    const list = listSpy();
    const { fixture, map, navigate } = await mountWatched(withQuery(CITY_PAGE, 'everywhere=1'), {
      seed: CITY_SEED,
      list,
    });
    await firstSearch(list);
    expect(queryAt(list, 0).near).toEqual(NEAR_LAHORE);

    const next = await settleOn(fixture, map, list, PANNED);

    expect(next.bounds).toEqual(PANNED);
    expect(next.near).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
    expect(urlQuery()).toEqual({ everywhere: '1' });
  });
});

/**
 * A search page does the opposite of a landing page: its address is its view, so the box the
 * map settles on is written to it, rounded, and restored from it on the way back in.
 */
describe('SearchMap search page viewport write', () => {
  afterEach(cleanupSearchMap);

  it('searches once for a box the page then writes to the address rounded', async () => {
    const list = listSpy();
    const { fixture, map } = await mountWatched('/en/search/lahore', { list });
    await firstSearch(list);
    const before = list.mock.calls.length;

    map.map = cameraAt({
      north: 31.6000004,
      south: 31.4000004,
      east: 74.5000004,
      west: 74.2000004,
    });
    map.captureMapBounds();
    // The write has landed, so a box read back from the address would now differ from the camera's.
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(urlQuery()).toHaveProperty('ne_lat', '31.6');
      },
      { timeout: 3000 },
    );
    // Wait out more than twice the 600ms results debounce, which each search restarts.
    await new Promise<void>((r) => setTimeout(r, 1500));

    expect(list).toHaveBeenCalledTimes(before + 1);
    expect(lastQuery(list).bounds).toEqual({
      north: 31.6000004,
      south: 31.4000004,
      east: 74.5000004,
      west: 74.2000004,
    });
  });

  it('keeps the country heading of a bare search once the page has written its viewport', async () => {
    const { fixture, map } = await mountWatched('/en/search');
    expect(h1Text(fixture)).toBe('Pakistan');

    map.map = cameraAt(PANNED);
    map.captureMapBounds();
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(urlQuery()).toHaveProperty('ne_lat', '31.6');
      },
      { timeout: 3000 },
    );
    fixture.detectChanges();

    expect(h1Text(fixture)).toBe('Pakistan');
  });

  it('restores the viewport in a link by searching it and fitting the camera to it', async () => {
    const list = listSpy();
    const { acquire, camera, leaflet } = fakeLeaflet();
    const { fixture, map } = await mountWatched(withQuery('/en/search/lahore', FRAMING), {
      list,
      acquire,
    });

    await openMap(fixture, map);
    // With the pins drawn, a refit onto the results would already have happened.
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(leaflet.marker).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    expect(queryAt(list, 0).bounds).toEqual(FRAMING_BOX);
    expect(camera.fitBounds).toHaveBeenCalledTimes(1);
    expect(leaflet.latLngBounds).toHaveBeenCalledWith([31.3, 74], [31.75, 74.7]);
    expect(camera.fitBounds).toHaveBeenCalledWith([
      [31.3, 74],
      [31.75, 74.7],
    ]);
  });
});

describe('isMapKeyboardMove', () => {
  const key = (keyCode: number, mods: Partial<KeyboardEvent> = {}) =>
    ({ keyCode, altKey: false, ctrlKey: false, metaKey: false, ...mods }) as KeyboardEvent;

  it.each([
    ['left', 37],
    ['up', 38],
    ['right', 39],
    ['down', 40],
    ['plus', 187],
    ['numpad plus', 107],
    ['minus', 189],
    ['numpad minus', 109],
  ])('counts the %s key, which Leaflet moves the camera for', (_name, code) => {
    expect(isMapKeyboardMove(key(code))).toBe(true);
  });

  it('ignores keys Leaflet does not move the camera for', () => {
    expect(isMapKeyboardMove(key(13))).toBe(false); // Enter
    expect(isMapKeyboardMove(key(9))).toBe(false); // Tab
    expect(isMapKeyboardMove(key(65))).toBe(false); // A
  });

  it.each([['altKey'], ['ctrlKey'], ['metaKey']])(
    'ignores an arrow under %s, which Leaflet leaves to the browser',
    (mod) => {
      expect(isMapKeyboardMove(key(37, { [mod]: true }))).toBe(false);
    },
  );

  it('ignores an event with no key', () => {
    expect(isMapKeyboardMove(undefined)).toBe(false);
  });
});

/**
 * A focused map pans on the arrow keys, which raise no `dragstart`. The keypress has to
 * count as the visitor's own move, as a drag does, or the next results refit the camera and
 * undo the pan (Trello #212).
 */
describe('SearchMap keyboard pan', () => {
  afterEach(cleanupSearchMap);

  const OTHER_PAGE: Paginated<Listing> = { ...ONE_PAGE, items: [{ ...ROSE, id: 'h2' }] };

  /** Opens the map on a place search; resolves once the first results have drawn their pins. */
  async function openOnPlace() {
    const list = vi.fn().mockReturnValueOnce(of(ONE_PAGE)).mockReturnValue(of(OTHER_PAGE));
    const { acquire, camera, leaflet } = fakeLeaflet();
    Object.assign(camera, cameraAt(PANNED));
    const { fixture, map } = await mountWatched('/en/search/lahore', { list, acquire });
    await openMap(fixture, map);
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(leaflet.marker).toHaveBeenCalledTimes(1);
      },
      { timeout: 3000 },
    );
    const fits = () => camera.fitBounds.mock.calls.length + camera.setView.mock.calls.length;
    return { fixture, map, list, leaflet, fits };
  }

  /** The camera settles somewhere new and the differing results draw their pins. */
  async function nextResults(opened: Awaited<ReturnType<typeof openOnPlace>>) {
    const { fixture, map, list, leaflet } = opened;
    const before = list.mock.calls.length;
    map.captureMapBounds();
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(list.mock.calls.length).toBeGreaterThan(before);
        expect(leaflet.marker).toHaveBeenCalledTimes(2);
      },
      { timeout: 3000 },
    );
  }

  const arrowKey = { originalEvent: { keyCode: 37, altKey: false, ctrlKey: false, metaKey: false } };

  it('refits the camera to new results while the visitor has not moved the map', async () => {
    const opened = await openOnPlace();
    const fitted = opened.fits();

    await nextResults(opened);

    expect(opened.fits()).toBe(fitted + 1);
  });

  it('keeps the camera where an arrow-key pan left it when the results change', async () => {
    const opened = await openOnPlace();
    const fitted = opened.fits();

    mapListeners.get('keydown')?.(arrowKey);
    await nextResults(opened);

    expect(opened.fits()).toBe(fitted);
  });

  it('still refits after a key Leaflet does not move the camera for', async () => {
    const opened = await openOnPlace();
    const fitted = opened.fits();

    mapListeners.get('keydown')?.({ originalEvent: { ...arrowKey.originalEvent, keyCode: 13 } });
    await nextResults(opened);

    expect(opened.fits()).toBe(fitted + 1);
  });

  it('reads This map area after an arrow-key pan of a bare search', async () => {
    const { acquire } = fakeLeaflet();
    const forVisitor = vi.fn().mockResolvedValue(HOME);
    const { fixture, map } = await mountWatched('/en/search', { acquire, forVisitor });
    await openMap(fixture, map);
    expect(h1Text(fixture)).toBe('Pakistan');

    mapListeners.get('keydown')?.(arrowKey);
    fixture.detectChanges();

    expect(h1Text(fixture)).toBe('searchUi.mapArea');
  });
});

/**
 * A landing page's place is its path (Trello #204). A hand-made link that also names another
 * place in its query (`place`, `city`, `lat`, `lng`, `zoom`) still searches the landing's place;
 * the query can only refine it, as `?gender=` does.
 */
describe('SearchMap on a landing page link naming another place', () => {
  afterEach(cleanupSearchMap);

  const KARACHI_KEYS = 'place=Karachi&city=Karachi&lat=24.8607&lng=67.0011&zoom=12';

  it('searches near the landing place, not the query one, on a server render', async () => {
    const list = listSpy();
    configureSearchMap({ list });
    await mount(withQuery(CITY_PAGE, KARACHI_KEYS), CITY_SEED);
    await firstSearch(list);

    expect(queryAt(list, 0).near).toEqual(NEAR_LAHORE);
  });

  it.each(LANDING_PAGES)(
    'searches near the landing place, not the query one, on %s in the browser',
    async (_name, url, seed, centre, type) => {
      const list = listSpy();
      await mountWatched(withQuery(url, KARACHI_KEYS), { seed, list });
      await firstSearch(list);

      const first = queryAt(list, 0);
      expect(first.near).toEqual(centre);
      expect(first.accommodationType).toBe(type);
    },
  );

  it('still takes the gender from the query on a city page', async () => {
    const list = listSpy();
    await mountWatched(withQuery(CITY_PAGE, KARACHI_KEYS, 'gender=girls'), { seed: CITY_SEED, list });
    await firstSearch(list);

    expect(queryAt(list, 0).near).toEqual(NEAR_LAHORE);
    expect(queryAt(list, 0).accommodationType).toBe('girls');
  });
});
