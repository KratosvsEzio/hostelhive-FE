import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Component, PLATFORM_ID, Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { provideDataAccess } from '@core/provide-data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { keepLocale } from '@core/i18n/keep-locale';
import { SearchBar } from './search-bar';

@Component({ template: '' })
class Blank {}

/** Configures the module the bar needs — a router tree, data access and i18n — without building it. */
async function configureBar(extra: Provider[] = []): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [SearchBar],
    providers: [
      provideRouter([
        { path: 'search/:location', component: Blank },
        { path: '**', component: Blank },
      ]),
      provideDataAccess(),
      provideI18nTesting(),
      ...extra,
    ],
  }).compileComponents();
}

function createBar(): ComponentFixture<SearchBar> {
  const fixture = TestBed.createComponent(SearchBar);
  fixture.detectChanges();
  return fixture;
}

/** Shared by every describe — configures the module and builds one bar. */
async function setupBar(extra: Provider[] = []): Promise<SearchBar> {
  await configureBar(extra);
  return createBar().componentInstance;
}

/**
 * The bar walks the router tree to find the `:location` slug, because it lives above the
 * outlet and its own route never carries one.
 */
describe('SearchBar', () => {
  const setup = (): Promise<SearchBar> => setupBar();

  /**
   * The regression this exists for.
   *
   * On the server the walk runs during the first `queryParamMap` emission, before the router
   * has finished building the tree: a route exists but has no snapshot. Reaching into one
   * threw `Cannot read properties of undefined (reading 'paramMap')` on every SSR render of
   * every page carrying the bar — which is every public page.
   */
  it('survives a router tree that is not built yet', async () => {
    const bar = await setup();
    const router = TestBed.inject(Router);
    const walk = (bar as unknown as { routedLocationSlug(): string }).routedLocationSlug.bind(
      bar,
    );

    // A root with no snapshot, exactly as the server sees mid-navigation.
    const original = router.routerState;
    Object.defineProperty(router, 'routerState', {
      value: { root: { snapshot: undefined, firstChild: null } },
      configurable: true,
    });
    expect(() => walk()).not.toThrow();
    expect(walk()).toBe('');

    // And no router state at all, which is the same class of failure one step earlier.
    Object.defineProperty(router, 'routerState', { value: undefined, configurable: true });
    expect(() => walk()).not.toThrow();

    Object.defineProperty(router, 'routerState', { value: original, configurable: true });
  });

  it('reads the slug from a routed search URL', async () => {
    const bar = await setup();
    const router = TestBed.inject(Router);
    const walk = (bar as unknown as { routedLocationSlug(): string }).routedLocationSlug.bind(
      bar,
    );

    await router.navigateByUrl('/search/lahore');
    expect(walk()).toBe('lahore');
  });

  it('finds no slug on a route that has none', async () => {
    const bar = await setup();
    const router = TestBed.inject(Router);
    const walk = (bar as unknown as { routedLocationSlug(): string }).routedLocationSlug.bind(
      bar,
    );

    await router.navigateByUrl('/hostels/lahore');
    expect(walk()).toBe('');
  });
});

/**
 * What the bar reads from the URL and writes back on a search.
 *
 * It re-submits whatever it holds, so anything read raw from the query string comes back out
 * of the next search — a bad `?gender=` for good.
 */
describe('SearchBar reading the URL', () => {
  type Internals = {
    accommodation(): string;
    search(): void;
  };

  async function onUrl(url: string) {
    const bar = (await setupBar()) as unknown as Internals;
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    return { bar, navigate };
  }

  function written(navigate: { mock: { calls: unknown[][] } }): Record<string, unknown> {
    const extras = navigate.mock.calls[0][1] as { queryParams: Record<string, unknown> };
    return extras.queryParams;
  }

  it.each(['/search?gender=bogus', '/search?gender='])(
    'shows no accommodation and writes no gender for %s',
    async (url) => {
      const { bar, navigate } = await onUrl(url);
      expect(bar.accommodation()).toBe('');

      bar.search();

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(written(navigate)['gender']).toBeNull();
    },
  );

  it('drops a price sort that a discarded gender can no longer justify', async () => {
    const { bar, navigate } = await onUrl('/search?gender=bogus&sort=price-asc');

    bar.search();

    expect(written(navigate)['sort']).toBeNull();
  });

  it('keeps a valid gender, shows it and writes it along with its price sort', async () => {
    const { bar, navigate } = await onUrl('/search?gender=girls&sort=price-asc');
    expect(bar.accommodation()).toBe('girls');

    bar.search();

    const query = written(navigate);
    expect(query['gender']).toBe('girls');
    expect(query).not.toHaveProperty('sort');
  });

  // A search page the bar builds reads it for `search_performed` (Trello #157).
  it.each([
    ['/search/lahore?place=Lahore', 'place'],
    ['/search?minPrice=10000', 'filter'],
  ])('tells the search page it builds from %s that it was a %s search', async (url, trigger) => {
    const { bar, navigate } = await onUrl(url);

    bar.search();

    const extras = navigate.mock.calls[0][1] as { state?: Record<string, unknown> };
    expect(extras.state).toEqual({ searchTrigger: trigger });
  });

  it('clears a worldwide marker left by the previous page', async () => {
    const { bar, navigate } = await onUrl('/search?everywhere=1');

    bar.search();

    const query = written(navigate);
    expect(query).toHaveProperty('everywhere', null);
  });

  // A header search is a new search: the map box of the page being left must not ride along
  // into a search page that is built fresh and would restore it over the new place.
  it('clears all four viewport keys left by the page being searched from', async () => {
    const { bar, navigate } = await onUrl(
      '/search/lahore?place=Lahore&lat=31.5&lng=74.3&zoom=11&ne_lat=31.6&ne_lng=74.5&sw_lat=31.4&sw_lng=74.1',
    );

    bar.search();

    const query = written(navigate);
    for (const key of ['ne_lat', 'ne_lng', 'sw_lat', 'sw_lng']) {
      expect(query).toHaveProperty(key, null);
    }
  });

  it('navigates to the place’s own search route with a merge and the retired and worldwide keys cleared', async () => {
    const { bar, navigate } = await onUrl(
      '/search/lahore?place=Lahore&lat=31.5&lng=74.3&zoom=11&capacity=2&everywhere=1',
    );

    bar.search();

    const [commands, extras] = navigate.mock.calls[0] as [
      string[],
      { queryParams: Record<string, unknown>; queryParamsHandling: string },
    ];
    // In the active language already: `keepLocale`'s redirect would drop the trigger's state.
    expect(commands).toEqual(['/en/search', 'lahore']);
    expect(extras.queryParamsHandling).toBe('merge');
    expect(extras.queryParams).toMatchObject({
      capacity: null,
      sharing: null,
      frequency: null,
      everywhere: null,
    });
  });
});

/**
 * The collapsed Budget chip.
 *
 * It used to divide by 1000 and print whatever came out, so a 14,762 bound rendered as
 * "14.762k" in a chip only a few characters wide. Two decimals is a ceiling, not a width —
 * a round bound must not gain ".00".
 */
describe('SearchBar budget label', () => {
  type Label = { key: string; params?: Record<string, string> };
  type Internals = {
    budgetLow: { set(v: number): void };
    budgetHigh: { set(v: number): void };
    budgetLabel(): Label;
  };

  async function label(low: number, high: number): Promise<Label> {
    const bar = (await setupBar()) as unknown as Internals;
    bar.budgetLow.set(low);
    bar.budgetHigh.set(high);
    return bar.budgetLabel();
  }

  it('caps a range at two decimals', async () => {
    const l = await label(14762, 26908);
    expect(l.params?.['low']).toBe('14.76k');
    expect(l.params?.['high']).toBe('26.91k');
  });

  it('leaves a round thousand without decimals', async () => {
    const l = await label(20000, 30000);
    expect(l.params?.['low']).toBe('20k');
    expect(l.params?.['high']).toBe('30k');
  });

  it('drops a trailing zero rather than padding to two places', async () => {
    const l = await label(14700, 26500);
    expect(l.params?.['low']).toBe('14.7k');
    expect(l.params?.['high']).toBe('26.5k');
  });

  it('caps sub-thousand amounts too', async () => {
    const l = await label(1, 999.456);
    expect(l.params?.['high']).toBe('999.46');
  });
});

/**
 * A visitor's unsubmitted edits against a URL that keeps changing under them.
 *
 * The map mirrors its viewport into the same query string as it settles and after every drag,
 * each time as a navigation. A real router drives these, because the bug lives in what the
 * bar does with successive emissions — a single navigation followed by a read cannot show it.
 */
/**
 * The trigger the bar hands the search page has to arrive with the navigation that builds it.
 *
 * Under the app's real routing, an unprefixed path is redirected by `keepLocale`, and Angular
 * starts that redirect as a new navigation without the old one's `state`. The bar used to
 * navigate to `/search/<slug>`, so every header search from bare /search reported itself as an
 * arrival (found by the e2e `search-trigger-and-map-area-heading.spec.ts`).
 */
describe('SearchBar under the locale-prefixed routes', () => {
  type Internals = {
    onSelected(r: { label: string; lat: number; lng: number; zoom?: number }): void;
    search(): void;
  };

  it('lands on the place search in one navigation that still carries the trigger', async () => {
    const pages = [
      { path: 'search', component: Blank },
      { path: 'search/:location', component: Blank },
    ];
    await TestBed.configureTestingModule({
      imports: [SearchBar],
      providers: [
        provideRouter([
          { path: 'en', children: pages },
          { path: '', canActivateChild: [keepLocale], children: pages },
        ]),
        provideDataAccess(),
        provideI18nTesting(),
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/en/search');
    const fixture = createBar();
    await fixture.whenStable();
    const bar = fixture.componentInstance as unknown as Internals;

    bar.onSelected({ label: 'Karachi', lat: 24.8607, lng: 67.0011, zoom: 10 });
    bar.search();
    await fixture.whenStable();

    expect(router.url).toMatch(/^\/en\/search\/karachi\?/);
    expect(router.lastSuccessfulNavigation()?.extras.state).toEqual({ searchTrigger: 'place' });
  });
});

describe('SearchBar edits against URL writes', () => {
  type Internals = {
    place(): string;
    accommodation(): string;
    budgetLow: { (): number; set(v: number): void };
    budgetHigh: { (): number; set(v: number): void };
    onText(text: string): void;
    onSelected(r: {
      label: string;
      lat: number;
      lng: number;
      zoom?: number;
    }): void;
    pickAccommodation(v: string): void;
    search(): void;
  };

  const LAHORE_SEARCH = '/search/lahore?place=Lahore&lat=31.5204&lng=74.3587&zoom=11';
  const KARACHI = { label: 'Karachi, Sindh, Pakistan', lat: 24.8607, lng: 67.0011, zoom: 10 };
  const VIEWPORT = { ne_lat: 31.6, ne_lng: 74.5, sw_lat: 31.4, sw_lng: 74.1 };

  async function mount(url: string, extra: Provider[] = []) {
    await configureBar(extra);
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    const fixture = createBar();
    await fixture.whenStable();
    return { fixture, router, bar: fixture.componentInstance as unknown as Internals };
  }

  /** The call the map makes to mirror its viewport: a merge, replacing the history entry. */
  async function viewportWrite(
    fixture: ComponentFixture<SearchBar>,
    router: Router,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await router.navigate([], {
      queryParams: { ...VIEWPORT, ...extra },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    await fixture.whenStable();
  }

  async function mergeInto(
    fixture: ComponentFixture<SearchBar>,
    router: Router,
    queryParams: Record<string, unknown>,
  ): Promise<void> {
    await router.navigate([], { queryParams, queryParamsHandling: 'merge' });
    await fixture.whenStable();
  }

  /** Submits the bar. Spied only now, so the navigations that moved the URL ran for real. */
  function searched(
    bar: Internals,
    router: Router,
  ): { commands: string[]; query: Record<string, unknown> } {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    bar.search();
    const [commands, extras] = navigate.mock.calls[0] as [
      string[],
      { queryParams: Record<string, unknown> },
    ];
    return { commands, query: extras.queryParams };
  }

  it('keeps a picked place when the map writes its viewport', async () => {
    const { fixture, router, bar } = await mount(LAHORE_SEARCH);
    bar.onSelected(KARACHI);

    await viewportWrite(fixture, router);

    expect(bar.place()).toBe(KARACHI.label);
    const { commands, query } = searched(bar, router);
    expect(commands[0]).toBe('/en/search');
    expect(commands[1]).toMatch(/^karachi/);
    expect(query).toMatchObject({ lat: KARACHI.lat, lng: KARACHI.lng, zoom: KARACHI.zoom });
  });

  it('keeps a picked place when the viewport write also clears the worldwide marker', async () => {
    const { fixture, router, bar } = await mount(LAHORE_SEARCH);
    bar.onSelected(KARACHI);

    await viewportWrite(fixture, router, { everywhere: null });

    expect(bar.place()).toBe(KARACHI.label);
    const { query } = searched(bar, router);
    expect(query).toMatchObject({ lat: KARACHI.lat, lng: KARACHI.lng });
  });

  it('keeps typed text, and no coordinates, when the map writes its viewport', async () => {
    const { fixture, router, bar } = await mount(LAHORE_SEARCH);
    bar.onText('Kara');

    await viewportWrite(fixture, router);

    expect(bar.place()).toBe('Kara');
    const { query } = searched(bar, router);
    expect(query).toMatchObject({ city: 'Kara', lat: null });
  });

  it('keeps an unsubmitted budget when the map writes its viewport', async () => {
    const { fixture, router, bar } = await mount(LAHORE_SEARCH);
    bar.budgetLow.set(5000);
    bar.budgetHigh.set(9000);

    await viewportWrite(fixture, router);

    expect(bar.budgetLow()).toBe(5000);
    const { query } = searched(bar, router);
    expect(query).toMatchObject({ minPrice: 5000, maxPrice: 9000 });
  });

  it('keeps an unsubmitted accommodation type when the map writes its viewport', async () => {
    const { fixture, router, bar } = await mount(LAHORE_SEARCH);
    bar.pickAccommodation('girls');

    await viewportWrite(fixture, router);

    expect(bar.accommodation()).toBe('girls');
    const { query } = searched(bar, router);
    expect(query['gender']).toBe('girls');
  });

  it('shows a place the visitor is navigated to over one they had picked', async () => {
    const { fixture, router, bar } = await mount(LAHORE_SEARCH);
    bar.onSelected(KARACHI);

    await router.navigateByUrl('/search/islamabad?place=Islamabad&lat=33.7&lng=73.05&zoom=12');
    await fixture.whenStable();

    expect(bar.place()).toBe('Islamabad');
    const { query } = searched(bar, router);
    expect(query).toMatchObject({ place: 'Islamabad', lat: 33.7, lng: 73.05, zoom: 12 });
  });

  // Every key the Where field presents must count as a change, or a real new search could be
  // swallowed as if it were a viewport write.
  it.each([
    { key: 'place', value: 'Multan', place: 'Multan', lat: 31.5, lng: 74.3, zoom: 11 },
    { key: 'city', value: 'Quetta', place: 'Lahore', lat: 31.5, lng: 74.3, zoom: 11 },
    { key: 'lat', value: '30.1', place: 'Lahore', lat: 30.1, lng: 74.3, zoom: 11 },
    { key: 'lng', value: '70.2', place: 'Lahore', lat: 31.5, lng: 70.2, zoom: 11 },
    { key: 'zoom', value: '9', place: 'Lahore', lat: 31.5, lng: 74.3, zoom: 9 },
  ])('resets a picked place when only $key changes in the URL', async (c) => {
    const { fixture, router, bar } = await mount(
      '/search?place=Lahore&city=Lahore&lat=31.5&lng=74.3&zoom=11',
    );
    bar.onSelected(KARACHI);

    await mergeInto(fixture, router, { [c.key]: c.value });

    expect(bar.place()).toBe(c.place);
    const { query } = searched(bar, router);
    expect(query).toMatchObject({ lat: c.lat, lng: c.lng, zoom: c.zoom });
  });

  it('shows the budget from the URL once the budget in the URL changes', async () => {
    const { fixture, router, bar } = await mount('/search');
    bar.budgetLow.set(3000);
    bar.budgetHigh.set(6000);

    await router.navigateByUrl('/search?minPrice=7000&maxPrice=8000');
    await fixture.whenStable();

    expect(bar.budgetLow()).toBe(7000);
    expect(bar.budgetHigh()).toBe(8000);
  });

  it('shows the accommodation type from the URL once the type in the URL changes', async () => {
    const { fixture, router, bar } = await mount('/search');
    bar.pickAccommodation('boys');

    await router.navigateByUrl('/search?gender=girls');
    await fixture.whenStable();

    expect(bar.accommodation()).toBe('girls');
  });

  it('keeps a picked place when only the budget in the URL changes', async () => {
    const { fixture, router, bar } = await mount(LAHORE_SEARCH);
    bar.onSelected(KARACHI);

    await mergeInto(fixture, router, { minPrice: 8000 });

    expect(bar.place()).toBe(KARACHI.label);
    expect(bar.budgetLow()).toBe(8000);
  });

  it('keeps a picked place when history steps back to an entry with the same place', async () => {
    const { fixture, router, bar } = await mount('/search', [provideLocationMocks()]);
    router.initialNavigation();
    await router.navigateByUrl('/search?place=Lahore&lat=31.5&lng=74.3&zoom=11');
    await router.navigateByUrl(
      '/search?place=Lahore&lat=31.5&lng=74.3&zoom=11&ne_lat=31.6&ne_lng=74.5&sw_lat=31.4&sw_lng=74.1',
    );
    await fixture.whenStable();
    bar.onSelected(KARACHI);

    const ended = firstValueFrom(router.events.pipe(filter((e) => e instanceof NavigationEnd)));
    TestBed.inject(Location).back();
    await ended;
    await fixture.whenStable();

    expect(router.url).not.toContain('ne_lat');
    expect(bar.place()).toBe(KARACHI.label);
  });

  it('keeps a picked place when the language prefix of the same search changes', async () => {
    const query = '?place=Lahore&lat=31.5204&lng=74.3587&zoom=11';
    const { fixture, router, bar } = await mount(`/en/search${query}`);
    bar.onSelected(KARACHI);

    await router.navigateByUrl(`/ur/search${query}`);
    await fixture.whenStable();

    expect(bar.place()).toBe(KARACHI.label);
  });

  it('fills the place from a slug that only the final navigation can read', async () => {
    await configureBar();
    const fixture = createBar();
    const bar = fixture.componentInstance as unknown as Internals;
    expect(bar.place()).toBe('');

    await TestBed.inject(Router).navigateByUrl('/search/lahore');
    await fixture.whenStable();

    expect(bar.place()).toBe('Lahore');
  });

  it('fills the place from a slug that is already routed when the bar is built', async () => {
    await configureBar();
    await TestBed.inject(Router).navigateByUrl('/search/lahore');
    const fixture = createBar();
    await fixture.whenStable();

    expect((fixture.componentInstance as unknown as Internals).place()).toBe('Lahore');
  });

  it('empties the place when a slug search becomes a worldwide one', async () => {
    const { fixture, router, bar } = await mount('/search/lahore');
    expect(bar.place()).toBe('Lahore');

    await router.navigateByUrl('/search?everywhere=1');
    await fixture.whenStable();

    expect(bar.place()).toBe('');
    const { query } = searched(bar, router);
    expect(query).toMatchObject({ place: null, lat: null });
  });

  it('empties a picked place when the search is widened in place', async () => {
    const { fixture, router, bar } = await mount('/search?place=Lahore&lat=31.5&lng=74.3');
    bar.onSelected(KARACHI);

    await router.navigate([], {
      queryParams: {
        place: null,
        city: null,
        lat: null,
        lng: null,
        zoom: null,
        everywhere: 1,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    await fixture.whenStable();

    expect(bar.place()).toBe('');
  });

  it.each(['browser', 'server'])(
    'fills every field from the URL it is built on, on the %s',
    async (platform) => {
      await configureBar([{ provide: PLATFORM_ID, useValue: platform }]);
      await TestBed.inject(Router).navigateByUrl(
        '/search?place=Lahore&lat=31.5&lng=74.3&zoom=11&minPrice=5000&maxPrice=9000&gender=girls',
      );
      const fixture = createBar();
      await fixture.whenStable();
      const bar = fixture.componentInstance as unknown as Internals;

      expect(bar.place()).toBe('Lahore');
      const router = TestBed.inject(Router);
      expect(searched(bar, router).query).toMatchObject({
        place: 'Lahore',
        lat: 31.5,
        lng: 74.3,
        zoom: 11,
      });
      expect(bar.budgetLow()).toBe(5000);
      expect(bar.budgetHigh()).toBe(9000);
      expect(bar.accommodation()).toBe('girls');
    },
  );

  it('follows the sort in the URL when deciding whether a price sort survives', async () => {
    const { fixture, router, bar } = await mount('/search?sort=recommended');

    await mergeInto(fixture, router, { sort: 'price-asc' });

    const { query } = searched(bar, router);
    expect(query['sort']).toBeNull();
  });

  it('scrubs a bad gender and keeps it scrubbed across a viewport write', async () => {
    const { fixture, router, bar } = await mount('/search?gender=bogus');

    await viewportWrite(fixture, router);

    expect(bar.accommodation()).toBe('');
    const { query } = searched(bar, router);
    expect(query['gender']).toBeNull();
  });

  it('keeps one bar’s pick from reaching another bar built on the same URL', async () => {
    const { fixture, router, bar } = await mount('/search?place=Lahore&lat=31.5&lng=74.3&zoom=11');
    const other = createBar();
    await other.whenStable();
    const otherBar = other.componentInstance as unknown as Internals;
    bar.onSelected(KARACHI);

    await viewportWrite(fixture, router);

    expect(bar.place()).toBe(KARACHI.label);
    expect(otherBar.place()).toBe('Lahore');
  });
});
