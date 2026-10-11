import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideDataAccess } from '@core/provide-data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { SearchBar } from './search-bar';

@Component({ template: '' })
class Blank {}

/** Shared by both describes — the bar needs a router tree, data access and i18n to build. */
async function setupBar(): Promise<SearchBar> {
  await TestBed.configureTestingModule({
    imports: [SearchBar],
    providers: [
      provideRouter([
        { path: 'search/:location', component: Blank },
        { path: '**', component: Blank },
      ]),
      provideDataAccess(),
      provideI18nTesting(),
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(SearchBar);
  fixture.detectChanges();
  return fixture.componentInstance;
}

/**
 * The bar walks the router tree to find the `:location` slug, because it lives above the
 * outlet and its own route never carries one.
 */
describe('SearchBar', () => {
  async function setup(): Promise<SearchBar> {
    await TestBed.configureTestingModule({
      imports: [SearchBar],
      providers: [
        provideRouter([
          { path: 'search/:location', component: Blank },
          { path: '**', component: Blank },
        ]),
        provideDataAccess(),
        provideI18nTesting(),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SearchBar);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

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
    expect(commands).toEqual(['/search', 'lahore']);
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
