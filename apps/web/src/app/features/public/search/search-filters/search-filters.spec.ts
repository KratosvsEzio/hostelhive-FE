import { Component, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { ParamMap, Router, NavigationStart, convertToParamMap, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { Dropdown } from '@hostelhive/ui';
import { OffersApi } from '@services';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { GenderRoutes, SearchFilters } from './search-filters';

/**
 * The routes a gender page under Lahore hands down. Written out here rather than built by the
 * landing feature's helper, so a mistake in that helper cannot make these specs agree with it.
 */
const LAHORE_ROUTES: GenderRoutes = {
  all: { path: '/hostels/lahore', gender: null },
  girls: { path: '/hostels/lahore/girls', gender: null },
  boys: { path: '/hostels/lahore/boys', gender: null },
  coliving: { path: '/hostels/lahore/co-living', gender: null },
  backpacker: { path: '/hostels/lahore', gender: 'backpacker' },
};

/**
 * Stands in for the search page. The filter row never reads the route's query itself: its
 * host hands it the merged filters, and a page with a path-fixed type hands it the routes.
 * Both are signals so a spec can change them after the first render, as the real page does
 * when the URL moves underneath a reused component.
 */
@Component({
  imports: [SearchFilters],
  template: `<hh-search-filters [params]="params()" [genderRoutes]="routes()" />`,
})
class Host {
  readonly params = signal<ParamMap | null>(convertToParamMap({}));
  readonly routes = signal<GenderRoutes | null>(null);
}

interface Mounted {
  harness: RouterTestingHarness;
  host: Host;
  router: Router;
  /** Where the router is now: the path, and the query as a plain object. */
  current(): { path: string; query: Record<string, string> };
  /** Navigations started since the page settled. */
  navigations(): number;
  /** Flush rendering and any pending navigation. */
  settle(): Promise<void>;
  openFilters(): Promise<void>;
  /** A button in the open modal, by its visible label. */
  choose(label: string): Promise<void>;
  apply(): Promise<void>;
}

/**
 * Loads the filter row on a real routed page.
 *
 * `url` is where the router is; `params` is what the host says the effective filters are.
 * They are separate on purpose: on a landing page they differ, because the path supplies
 * filters the query never mentions.
 */
async function mount(opts: {
  url: string;
  params?: Record<string, string>;
  routes?: GenderRoutes | null;
  locale?: string;
}): Promise<Mounted> {
  TestBed.configureTestingModule({
    providers: [
      // One catch-all route, so every URL under test resolves to the same reused component.
      provideRouter([{ path: '**', component: Host }]),
      provideI18nTesting(),
      { provide: OffersApi, useValue: { categories: () => of([]) } },
    ],
  });
  if (opts.locale) TestBed.inject(LocaleStore).apply(opts.locale);

  const harness = await RouterTestingHarness.create();
  const host = await harness.navigateByUrl(opts.url, Host);
  host.params.set(convertToParamMap(opts.params ?? {}));
  host.routes.set(opts.routes ?? null);
  harness.detectChanges();

  const router = TestBed.inject(Router);
  let started = 0;
  router.events.subscribe((e) => {
    if (e instanceof NavigationStart) started++;
  });

  const settle = async () => {
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  // The modal teleports its root to <body>, so it is found on the document, not the fixture.
  const modalButtons = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('.hh-modal-root button'));

  return {
    harness,
    host,
    router,
    current: () => {
      const tree = router.parseUrl(router.url);
      return {
        path: router.url.split('?')[0],
        query: tree.queryParams as Record<string, string>,
      };
    },
    navigations: () => started,
    settle,
    async openFilters() {
      const button = harness.routeNativeElement?.querySelector<HTMLButtonElement>(
        'hh-search-filters button',
      );
      button?.click();
      await settle();
    },
    async choose(label) {
      modalButtons()
        .find((b) => b.textContent?.trim() === label)
        ?.click();
      await settle();
    },
    async apply() {
      // The test loader resolves a key to itself, so the button reads as its translation key.
      modalButtons()
        .find((b) => b.textContent?.trim() === 'filters.showResults')
        ?.click();
      await settle();
    },
  };
}

/** The pressed state of every "Type of stay" button, by label. */
function pressed(labels: string[]): Record<string, string | null> {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.hh-modal-root button[aria-pressed]'),
  );
  return Object.fromEntries(
    labels.map((l) => [
      l,
      buttons.find((b) => b.textContent?.trim() === l)?.getAttribute('aria-pressed') ?? null,
    ]),
  );
}

function badge(m: Mounted): string | null {
  const el = m.harness.routeNativeElement?.querySelector('hh-search-filters .relative > span');
  return el?.textContent?.trim() ?? null;
}

function filtersButton(m: Mounted): HTMLElement | null {
  return m.harness.routeNativeElement?.querySelector('hh-search-filters button') ?? null;
}

/** The sort dropdown's option values — the second dropdown in the row, after room type. */
function sortValues(m: Mounted): string[] {
  const dropdowns = m.harness.fixture.debugElement.queryAll(By.directive(Dropdown));
  return (dropdowns[1].componentInstance as Dropdown).options().map((o) => String(o.value));
}

describe('SearchFilters', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    // The store writes the language onto <html>, which outlives the injector.
    document.documentElement.setAttribute('lang', 'en');
    document.documentElement.setAttribute('dir', 'ltr');
  });

  describe('showing the effective filters', () => {
    // The path supplies the type on a landing page, so the route's own query never names it.
    it('pre-selects the type the host page supplies although the query does not name it', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls',
        params: { gender: 'girls' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();

      expect(pressed(['Girls', 'Any type'])).toEqual({ Girls: 'true', 'Any type': 'false' });
    });

    it('counts the supplied type in the badge and highlights the button', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls',
        params: { gender: 'girls' },
        routes: LAHORE_ROUTES,
      });

      expect(badge(m)).toBe('1');
      expect(filtersButton(m)?.classList.contains('bg-brand-50')).toBe(true);

      m.host.params.set(convertToParamMap({ gender: 'girls', amenities: 'wifi' }));
      m.harness.detectChanges();
      expect(badge(m)).toBe('2');
    });

    it('shows no badge and no highlight when nothing is filtered', async () => {
      const m = await mount({ url: '/en/hostels/lahore' });

      expect(badge(m)).toBeNull();
      expect(filtersButton(m)?.classList.contains('bg-brand-50')).toBe(false);
    });

    it('offers the price sorts only while a type is chosen', async () => {
      const m = await mount({ url: '/en/hostels/lahore' });
      expect(sortValues(m)).toEqual(['newest', 'oldest']);

      m.host.params.set(convertToParamMap({ gender: 'girls' }));
      m.harness.detectChanges();
      expect(sortValues(m)).toEqual(['newest', 'oldest', 'price-desc', 'price-asc']);
    });

    // A second reader of the route would see boys here; the host's merged value is the truth.
    it('follows the host over the route when the two disagree', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls?gender=boys',
        params: { gender: 'girls' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();

      expect(badge(m)).toBe('1');
      expect(pressed(['Girls', 'Boys'])).toEqual({ Girls: 'true', Boys: 'false' });
    });
  });

  describe('applying on a gender page', () => {
    it('goes up to the city page for Any type, keeping the other filters', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls?lat=31.5&amenities=wifi',
        params: { gender: 'girls', lat: '31.5', amenities: 'wifi' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();
      await m.choose('Any type');
      await m.apply();

      expect(m.current()).toEqual({
        path: '/en/hostels/lahore',
        query: { lat: '31.5', amenities: 'wifi' },
      });
      expect(m.navigations()).toBe(1);
    });

    it.each([
      ['Boys', '/en/hostels/lahore/boys'],
      ['Co-living', '/en/hostels/lahore/co-living'],
    ])('moves to the sibling page for %s with no gender in the query', async (label, path) => {
      const m = await mount({
        url: '/en/hostels/lahore/girls?lat=31.5',
        params: { gender: 'girls', lat: '31.5' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();
      await m.choose(label);
      await m.apply();

      expect(m.current()).toEqual({ path, query: { lat: '31.5' } });
    });

    it('moves from another gender page to the Girls page', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/boys?lat=31.5',
        params: { gender: 'boys', lat: '31.5' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();
      await m.choose('Girls');
      await m.apply();

      expect(m.current()).toEqual({ path: '/en/hostels/lahore/girls', query: { lat: '31.5' } });
    });

    // Backpacker has no page of its own, so the type travels in the query on the city page.
    it('goes to the city page with the type in the query for Backpacker', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls',
        params: { gender: 'girls' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();
      await m.choose('Backpacker');
      await m.apply();

      expect(m.current()).toEqual({
        path: '/en/hostels/lahore',
        query: { gender: 'backpacker' },
      });
    });

    // Re-applying the shown type must still clear the override, or the list silently reverts
    // to the page's own type.
    it('clears a stale gender override when the shown type is applied again', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls?gender=boys',
        params: { gender: 'boys' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();
      expect(pressed(['Boys', 'Girls'])).toEqual({ Boys: 'true', Girls: 'false' });
      await m.apply();

      expect(m.current()).toEqual({ path: '/en/hostels/lahore/boys', query: {} });
    });

    it('resets every filter and the type for Clear all, keeping only the viewport', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls?amenities=wifi&sort=price-asc&lat=31.5',
        params: { gender: 'girls', amenities: 'wifi', sort: 'price-asc', lat: '31.5' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();
      await m.choose('filters.clearAll');
      await m.apply();

      expect(m.current()).toEqual({ path: '/en/hostels/lahore', query: { lat: '31.5' } });
    });

    // A value that is not a known type must read as "Any type", not crash or count as a filter.
    // This exercises SearchFilters' own defence-in-depth guard; on the real page the shared reader already resolves a bad gender to the page's type.
    describe.each(['bogus', ''])('with an unrecognised gender %j on a gender page', (gender) => {
      const open = async () => {
        const m = await mount({
          url: '/en/hostels/lahore/girls',
          params: { gender },
          routes: LAHORE_ROUTES,
        });
        await m.openFilters();
        return m;
      };

      it('pre-selects Any type and does not count it', async () => {
        const m = await open();

        expect(pressed(['Any type', 'Girls'])).toEqual({ 'Any type': 'true', Girls: 'false' });
        expect(badge(m)).toBeNull();
      });

      it('goes to the city page when applied unchanged', async () => {
        const m = await open();
        await m.apply();

        expect(m.current()).toEqual({ path: '/en/hostels/lahore', query: {} });
      });

      it('goes to the Boys page when Boys is applied', async () => {
        const m = await open();
        await m.choose('Boys');
        await m.apply();

        expect(m.current()).toEqual({ path: '/en/hostels/lahore/boys', query: {} });
      });
    });

    it('keeps the language prefix without doubling it', async () => {
      const m = await mount({
        url: '/ur/hostels/lahore/girls',
        params: { gender: 'girls' },
        routes: LAHORE_ROUTES,
        locale: 'ur',
      });
      await m.openFilters();
      await m.choose('Any type');
      await m.apply();

      expect(m.current().path).toBe('/ur/hostels/lahore');
    });
  });

  describe('what is written to the query', () => {
    it('drops a price sort when the result is Any type', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls?sort=price-asc',
        params: { gender: 'girls', sort: 'price-asc' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();
      await m.choose('Any type');
      await m.apply();

      expect(m.current()).toEqual({ path: '/en/hostels/lahore', query: {} });
    });

    it('drops a price sort on a page with no routes too', async () => {
      const m = await mount({
        url: '/en/search/lahore?gender=girls&sort=price-asc',
        params: { gender: 'girls', sort: 'price-asc' },
      });
      await m.openFilters();
      await m.choose('Any type');
      await m.apply();

      expect(m.current()).toEqual({ path: '/en/search/lahore', query: {} });
    });

    it('keeps a price sort while a type is chosen', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls?sort=price-asc',
        params: { gender: 'girls', sort: 'price-asc' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();
      await m.choose('Boys');
      await m.apply();

      expect(m.current()).toEqual({
        path: '/en/hostels/lahore/boys',
        query: { sort: 'price-asc' },
      });
    });

    // Absent already means the default room type, so writing it only clutters the URL.
    it('writes the default room type and the default sort as absent', async () => {
      const m = await mount({
        url: '/en/search/lahore?roomType=shared&sort=recommended',
        params: { roomType: 'shared', sort: 'recommended' },
      });
      await m.openFilters();
      await m.apply();

      expect(m.current()).toEqual({ path: '/en/search/lahore', query: {} });
    });

    it('writes a non-default room type', async () => {
      const m = await mount({ url: '/en/search/lahore' });
      await m.openFilters();
      await m.choose('Private room');
      await m.apply();

      expect(m.current()).toEqual({ path: '/en/search/lahore', query: { roomType: 'private' } });
    });
  });

  describe('applying on a page whose path fixes no type', () => {
    it.each(['/en/hostels/lahore', '/en/search/lahore'])(
      'adds then removes the gender in the query on %s',
      async (url) => {
        const m = await mount({ url });
        await m.openFilters();
        await m.choose('Boys');
        await m.apply();

        expect(m.current()).toEqual({ path: url, query: { gender: 'boys' } });

        // The host would now see the new query; hand it over as the real page does.
        m.host.params.set(convertToParamMap({ gender: 'boys' }));
        m.harness.detectChanges();
        await m.openFilters();
        await m.choose('Any type');
        await m.apply();

        expect(m.current()).toEqual({ path: url, query: {} });
      },
    );
  });
});
