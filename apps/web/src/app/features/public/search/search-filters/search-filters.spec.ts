import { Component, DebugElement, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { ParamMap, Router, NavigationStart, convertToParamMap, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { Dropdown } from '@hostelhive/ui';
import { TranslocoService } from '@jsverse/transloco';
import { OffersApi } from '@services';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import {
  FilterState,
  SearchFilterModal,
} from '@features/public/search/search-filter-modal/search-filter-modal';
import { mergeSearchParams } from '@features/public/search/search-params';
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

// A gender page's seed as its path supplies it: the place, plus the type the path fixes.
const GIRLS_SEED = { place: 'Lahore', lat: '31.5', lng: '74.3', zoom: '11', gender: 'girls' };

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
      const button = modalButtons().find((b) => b.textContent?.trim() === label);
      if (!button) throw new Error(`No modal button reads "${label}"`);
      button.click();
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

/**
 * Loads the filter row at `url` with the filters the search page would hand it: that URL's
 * query merged with the page's `seed` by the real reader, so a correction made there shows.
 */
async function mountFromUrl(
  url: string,
  opts: { seed?: Record<string, string> | null; routes?: GenderRoutes | null } = {},
): Promise<Mounted> {
  const m = await mount({ url, routes: opts.routes });
  const query = convertToParamMap(m.router.parseUrl(url).queryParams);
  m.host.params.set(mergeSearchParams(query, opts.seed ?? null));
  await m.settle();
  return m;
}

/**
 * Puts the two room labels in memory, so the room pill can read as one of them.
 *
 * The filter row labels its options only once a language has strings, and the test loader
 * supplies none, so without this a pill that shows a chosen option reads as blank.
 */
async function loadRoomLabels(m: Mounted): Promise<void> {
  TestBed.inject(TranslocoService).setTranslation(
    { search: { sharedRoom: 'search.sharedRoom', privateRoom: 'search.privateRoom' } },
    TestBed.inject(LocaleStore).active(),
  );
  // The store hears of new strings a tick later.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await m.settle();
}

/**
 * The pressed state of the modal's toggle buttons (type of stay, room type and sort), by label.
 * A label no button carries reads as null.
 */
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

/** The buttons inside the modal section whose heading reads `titleKey`, in document order. */
function sectionButtons(titleKey: string): HTMLButtonElement[] {
  const heading = Array.from(document.querySelectorAll('.hh-modal-root h3')).find(
    (h) => h.textContent?.trim() === titleKey,
  );
  if (!heading) throw new Error(`No modal section titled "${titleKey}"`);
  return Array.from(heading.closest('section')?.querySelectorAll('button') ?? []);
}

/** The labels offered in the modal's Sort section, in order. */
function sortOffered(): string[] {
  return sectionButtons('filters.sortBy').map((b) => b.textContent?.trim() ?? '');
}

/** The aria-pressed value of each Sort button, by label. */
function sortPressed(): Record<string, string | null> {
  return Object.fromEntries(
    sectionButtons('filters.sortBy').map((b) => [
      b.textContent?.trim() ?? '',
      b.getAttribute('aria-pressed'),
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

/** The inline sort dropdown — the second dropdown in the row, after room type. */
function sortDropdown(m: Mounted): DebugElement {
  return m.harness.fixture.debugElement.queryAll(By.directive(Dropdown))[1];
}

/** The inline room type pill — the first dropdown in the row, before sort. */
function roomPill(m: Mounted): DebugElement {
  return m.harness.fixture.debugElement.queryAll(By.directive(Dropdown))[0];
}

/** The property type field inside the open filters modal, which only exists while it is open. */
function modalPropertyType(m: Mounted): DebugElement {
  const modal = m.harness.fixture.debugElement.query(By.directive(SearchFilterModal));
  const field = modal
    .queryAll(By.directive(Dropdown))
    .find((d) => (d.componentInstance as Dropdown).placeholder() === 'filters.anyPropertyType');
  if (!field) throw new Error('The open modal has no property type dropdown');
  return field;
}

/** The sort dropdown's option values. */
function sortValues(m: Mounted): string[] {
  return (sortDropdown(m).componentInstance as Dropdown).options().map((o) => String(o.value));
}

/** The button that opens a dropdown, and carries its tint. */
function triggerOf(dropdown: DebugElement): HTMLElement {
  return dropdown.nativeElement.querySelector('button[aria-haspopup]');
}

/** The aria-selected value of the open sort panel's Recommended entry, which is its clear label. */
function recommendedSelected(): string | null {
  const option = Array.from(
    document.querySelectorAll('[role="listbox"] [role="option"]'),
  ).find((o) => o.textContent?.trim() === 'search.recommended');
  if (!option) throw new Error('No open dropdown panel offers "search.recommended"');
  return option.getAttribute('aria-selected');
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

      expect(pressed(['common.girls', 'searchBar.anyAccommodation'])).toEqual({
        'common.girls': 'true',
        'searchBar.anyAccommodation': 'false',
      });
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
      expect(pressed(['common.girls', 'common.boys'])).toEqual({
        'common.girls': 'true',
        'common.boys': 'false',
      });
    });
  });

  // Filters come through the real merge here, so a sort the reader stops correcting shows up.
  describe('showing a sort carried by the URL', () => {
    it.each(['price-asc', 'price-desc', '', 'bogus'])(
      'shows no badge and no highlight for ?sort=%j when no type is chosen',
      async (sort) => {
        const m = await mountFromUrl(`/en/search/lahore?sort=${sort}`);

        expect(badge(m)).toBeNull();
        expect(filtersButton(m)?.classList.contains('bg-brand-50')).toBe(false);
      },
    );

    it('counts only the other filters beside a price sort no type allows', async () => {
      const m = await mountFromUrl('/en/search/lahore?sort=price-asc&amenities=wifi');

      expect(badge(m)).toBe('1');
      expect(filtersButton(m)?.classList.contains('bg-brand-50')).toBe(true);
    });

    it('leaves the inline sort empty and untinted for a price sort no type allows', async () => {
      const m = await mountFromUrl('/en/search/lahore?sort=price-asc');
      const sort = sortDropdown(m);

      expect((sort.componentInstance as Dropdown).value()).toBeNull();
      expect(triggerOf(sort).classList.contains('bg-brand-50')).toBe(false);
      expect(triggerOf(sort).textContent?.trim()).toBe('common.sort');
      expect(sortValues(m)).toEqual(['newest', 'oldest']);
    });

    // The pill never reads "Recommended", so the open panel is the only place it shows as chosen.
    it('marks Recommended as chosen in the open sort panel for a price sort no type allows', async () => {
      const m = await mountFromUrl('/en/search/lahore?sort=price-asc');
      triggerOf(sortDropdown(m)).click();
      await m.settle();

      expect(recommendedSelected()).toBe('true');
    });

    it('still counts and shows a price sort that the page type allows', async () => {
      const m = await mountFromUrl('/en/hostels/lahore/girls?sort=price-asc', {
        seed: GIRLS_SEED,
        routes: LAHORE_ROUTES,
      });
      const sort = sortDropdown(m);

      expect(badge(m)).toBe('2');
      expect((sort.componentInstance as Dropdown).value()).toBe('price-asc');
      expect(filtersButton(m)?.classList.contains('bg-brand-50')).toBe(true);
      expect(triggerOf(sort).classList.contains('bg-brand-50')).toBe(true);
    });
  });

  // Filters come through the real merge here, so a value the reader stops correcting shows up.
  describe('showing a room or property type carried by the URL', () => {
    it.each(['?roomType=bogus', '?propertyType=bogus', '?roomType=bogus&propertyType=bogus'])(
      'shows no badge and no highlight for an unknown value in %s',
      async (query) => {
        const m = await mountFromUrl(`/en/search/lahore${query}`);

        expect(badge(m)).toBeNull();
        expect(filtersButton(m)?.classList.contains('bg-brand-50')).toBe(false);
      },
    );

    it('counts only the other filters beside an unknown room type and property type', async () => {
      const m = await mountFromUrl(
        '/en/search/lahore?roomType=bogus&propertyType=bogus&amenities=wifi',
      );

      expect(badge(m)).toBe('1');
      expect(filtersButton(m)?.classList.contains('bg-brand-50')).toBe(true);
    });

    it('counts only the page type beside an unknown room type and property type', async () => {
      const m = await mountFromUrl('/en/hostels/lahore/girls?roomType=bogus&propertyType=bogus', {
        seed: GIRLS_SEED,
        routes: LAHORE_ROUTES,
      });

      expect(badge(m)).toBe('1');
    });

    it('shows the room pill on Shared for an unknown room type', async () => {
      const m = await mountFromUrl('/en/search/lahore?roomType=bogus');
      await loadRoomLabels(m);
      const pill = roomPill(m);

      expect((pill.componentInstance as Dropdown).value()).toBe('shared');
      expect(triggerOf(pill).textContent?.trim()).toBe('search.sharedRoom');
    });

    it('opens the modal on Shared for an unknown room type', async () => {
      const m = await mountFromUrl('/en/search/lahore?roomType=bogus');
      await m.openFilters();

      expect(pressed(['search.sharedRoom', 'search.privateRoom'])).toEqual({
        'search.sharedRoom': 'true',
        'search.privateRoom': 'false',
      });
    });

    it('opens the modal on Any property type for an unknown property type', async () => {
      const m = await mountFromUrl('/en/search/lahore?propertyType=bogus');
      await m.openFilters();
      const field = modalPropertyType(m);

      expect((field.componentInstance as Dropdown).value()).toBeNull();
      expect(triggerOf(field).textContent?.trim()).toBe('filters.anyPropertyType');
    });

    // The backend's own slug for a private room, which the filters read as Private.
    it('counts a private_room link as one filter', async () => {
      const m = await mountFromUrl('/en/search/lahore?roomType=private_room');

      expect(badge(m)).toBe('1');
      expect(filtersButton(m)?.classList.contains('bg-brand-50')).toBe(true);
    });

    it('shows the room pill on Private for a private_room link', async () => {
      const m = await mountFromUrl('/en/search/lahore?roomType=private_room');
      await loadRoomLabels(m);
      const pill = roomPill(m);

      expect((pill.componentInstance as Dropdown).value()).toBe('private');
      expect(triggerOf(pill).textContent?.trim()).toBe('search.privateRoom');
    });

    it('opens the modal on Private for a private_room link', async () => {
      const m = await mountFromUrl('/en/search/lahore?roomType=private_room');
      await m.openFilters();

      expect(pressed(['search.sharedRoom', 'search.privateRoom'])).toEqual({
        'search.sharedRoom': 'false',
        'search.privateRoom': 'true',
      });
    });

    it('counts a valid room type and property type as two filters', async () => {
      const m = await mountFromUrl('/en/search/lahore?roomType=private&propertyType=house');

      expect(badge(m)).toBe('2');
      expect(filtersButton(m)?.classList.contains('bg-brand-50')).toBe(true);
    });

    it('opens the modal on a valid room type and property type', async () => {
      const m = await mountFromUrl('/en/search/lahore?roomType=private&propertyType=house');
      await m.openFilters();

      expect(pressed(['search.sharedRoom', 'search.privateRoom'])).toEqual({
        'search.sharedRoom': 'false',
        'search.privateRoom': 'true',
      });
      expect((modalPropertyType(m).componentInstance as Dropdown).value()).toBe('house');
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
      await m.choose('searchBar.anyAccommodation');
      await m.apply();

      expect(m.current()).toEqual({
        path: '/en/hostels/lahore',
        query: { lat: '31.5', amenities: 'wifi' },
      });
      expect(m.navigations()).toBe(1);
    });

    it.each([
      ['common.boys', '/en/hostels/lahore/boys'],
      ['common.coLiving', '/en/hostels/lahore/co-living'],
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
      await m.choose('common.girls');
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
      await m.choose('common.backpacker');
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
      expect(pressed(['common.boys', 'common.girls'])).toEqual({
        'common.boys': 'true',
        'common.girls': 'false',
      });
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

        expect(pressed(['searchBar.anyAccommodation', 'common.girls'])).toEqual({
          'searchBar.anyAccommodation': 'true',
          'common.girls': 'false',
        });
        expect(badge(m)).toBeNull();
      });

      it('goes to the city page when applied unchanged', async () => {
        const m = await open();
        await m.apply();

        expect(m.current()).toEqual({ path: '/en/hostels/lahore', query: {} });
      });

      it('goes to the Boys page when Boys is applied', async () => {
        const m = await open();
        await m.choose('common.boys');
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
      await m.choose('searchBar.anyAccommodation');
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
      await m.choose('searchBar.anyAccommodation');
      await m.apply();

      expect(m.current()).toEqual({ path: '/en/hostels/lahore', query: {} });
    });

    it('drops a price sort on a page with no routes too', async () => {
      const m = await mount({
        url: '/en/search/lahore?gender=girls&sort=price-asc',
        params: { gender: 'girls', sort: 'price-asc' },
      });
      await m.openFilters();
      await m.choose('searchBar.anyAccommodation');
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
      await m.choose('common.boys');
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
      await m.choose('search.privateRoom');
      await m.apply();

      expect(m.current()).toEqual({ path: '/en/search/lahore', query: { roomType: 'private' } });
    });
  });

  // The modal writes back what it was seeded with, so a value the seed kept would be saved again.
  describe('applying over a room or property type carried by the URL', () => {
    // The budget slider cannot be dragged here, so a price already in the URL stands in for it.
    it('writes neither unknown value back when applied unchanged', async () => {
      const m = await mountFromUrl(
        '/en/search/lahore?roomType=bogus&propertyType=bogus&minPrice=5000',
      );
      await m.openFilters();
      await m.apply();

      expect(m.current()).toEqual({ path: '/en/search/lahore', query: { minPrice: '5000' } });
    });

    it('writes only the chosen room type over unknown values', async () => {
      const m = await mountFromUrl('/en/search/lahore?roomType=bogus&propertyType=bogus');
      await m.openFilters();
      await m.choose('search.privateRoom');
      await m.apply();

      expect(m.current()).toEqual({ path: '/en/search/lahore', query: { roomType: 'private' } });
    });

    // The one write that rewrites the backend's slug: the modal is seeded with the filters' word.
    it('rewrites a private_room link to private when applied unchanged', async () => {
      const m = await mountFromUrl('/en/search/lahore?roomType=private_room');
      await m.openFilters();
      await m.apply();

      expect(m.current()).toEqual({ path: '/en/search/lahore', query: { roomType: 'private' } });
    });

    it('keeps a valid room type and property type when applied unchanged', async () => {
      const m = await mountFromUrl('/en/search/lahore?roomType=private&propertyType=house');
      await m.openFilters();
      await m.apply();

      expect(m.current()).toEqual({
        path: '/en/search/lahore',
        query: { roomType: 'private', propertyType: 'house' },
      });
    });
  });

  describe('applying on a page whose path fixes no type', () => {
    it.each(['/en/hostels/lahore', '/en/search/lahore'])(
      'adds then removes the gender in the query on %s',
      async (url) => {
        const m = await mount({ url });
        await m.openFilters();
        await m.choose('common.boys');
        await m.apply();

        expect(m.current()).toEqual({ path: url, query: { gender: 'boys' } });

        // The host would now see the new query; hand it over as the real page does.
        m.host.params.set(convertToParamMap({ gender: 'boys' }));
        m.harness.detectChanges();
        await m.openFilters();
        await m.choose('searchBar.anyAccommodation');
        await m.apply();

        expect(m.current()).toEqual({ path: url, query: {} });
      },
    );
  });

  describe('what the filters modal offers', () => {
    const ALL_SORTS = [
      'search.recommended',
      'search.recentFirst',
      'search.oldestFirst',
      'search.priceHighToLow',
      'search.priceLowToHigh',
    ];
    const NO_PRICE_SORTS = ['search.recommended', 'search.recentFirst', 'search.oldestFirst'];

    /** The modal the filter row owns, so a spec can listen to or drive its output. */
    const modalOf = (m: Mounted) =>
      m.harness.fixture.debugElement.query(By.directive(SearchFilterModal))
        .componentInstance as SearchFilterModal;

    it('offers no price sort while no type is chosen', async () => {
      const m = await mount({ url: '/en/hostels/lahore' });
      await m.openFilters();

      expect(sortOffered()).toEqual(NO_PRICE_SORTS);
    });

    it('offers every sort once a type is chosen, in display order', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls',
        params: { gender: 'girls' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();

      expect(sortOffered()).toEqual(ALL_SORTS);
    });

    it('withdraws the price sorts and selects Recommended when the type changes to Any', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls?sort=price-asc',
        params: { gender: 'girls', sort: 'price-asc' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();
      await m.choose('searchBar.anyAccommodation');

      expect(sortOffered()).toEqual(NO_PRICE_SORTS);
      expect(sortPressed()).toEqual({
        'search.recommended': 'true',
        'search.recentFirst': 'false',
        'search.oldestFirst': 'false',
      });
    });

    it('brings the price sorts back, with the drafted one pressed, when a type is chosen again', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls?sort=price-asc',
        params: { gender: 'girls', sort: 'price-asc' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();
      await m.choose('searchBar.anyAccommodation');
      await m.choose('common.boys');

      expect(sortOffered()).toEqual(ALL_SORTS);
      expect(sortPressed()['search.priceLowToHigh']).toBe('true');
      expect(sortPressed()['search.recommended']).toBe('false');
    });

    // Guards against resetting the draft imperatively when the type changes: the sort must survive.
    it('keeps the drafted price sort through Any and back to a type, all the way to the URL', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls?sort=price-asc',
        params: { gender: 'girls', sort: 'price-asc' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();
      await m.choose('searchBar.anyAccommodation');
      await m.choose('common.boys');
      await m.apply();

      expect(m.current()).toEqual({
        path: '/en/hostels/lahore/boys',
        query: { sort: 'price-asc' },
      });
    });

    it('emits Recommended, not the hidden price sort, when applied on Any', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls?sort=price-asc&amenities=wifi',
        params: { gender: 'girls', sort: 'price-asc', amenities: 'wifi' },
        routes: LAHORE_ROUTES,
      });
      const emitted: FilterState[] = [];
      modalOf(m).applied.subscribe((state) => emitted.push(state));
      await m.openFilters();
      await m.choose('searchBar.anyAccommodation');
      await m.apply();

      expect(emitted).toHaveLength(1);
      expect(emitted[0].accommodationType).toBe('all');
      expect(emitted[0].sort).toBe('recommended');
      expect(emitted[0].amenities).toEqual(['wifi']);
      expect(m.current()).toEqual({ path: '/en/hostels/lahore', query: { amenities: 'wifi' } });
    });

    it('opens a stale price-sort URL with no type on Any and Recommended', async () => {
      const m = await mount({
        url: '/en/search/lahore?sort=price-asc',
        params: { sort: 'price-asc' },
      });
      await m.openFilters();

      expect(sortOffered()).toEqual(NO_PRICE_SORTS);
      expect(sortPressed()['search.recommended']).toBe('true');
      expect(pressed(['searchBar.anyAccommodation'])).toEqual({
        'searchBar.anyAccommodation': 'true',
      });

      await m.apply();
      expect(m.current()).toEqual({ path: '/en/search/lahore', query: {} });
    });

    // Fed through the real merge, the stale sort never reaches the draft for a type to bring back.
    it('keeps Recommended pressed when a type is chosen on a stale price-sort URL', async () => {
      const m = await mountFromUrl('/en/search/lahore?sort=price-asc');
      await m.openFilters();

      expect(sortOffered()).toEqual(NO_PRICE_SORTS);
      expect(sortPressed()['search.recommended']).toBe('true');

      await m.choose('common.girls');

      expect(sortOffered()).toEqual(ALL_SORTS);
      expect(sortPressed()).toEqual({
        'search.recommended': 'true',
        'search.recentFirst': 'false',
        'search.oldestFirst': 'false',
        'search.priceHighToLow': 'false',
        'search.priceLowToHigh': 'false',
      });

      await m.apply();
      expect(m.current()).toEqual({ path: '/en/search/lahore', query: { gender: 'girls' } });
    });

    it('opens a gender page with its price sort pressed and applies it unchanged', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls?sort=price-asc',
        params: { gender: 'girls', sort: 'price-asc' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();

      expect(sortOffered()).toHaveLength(5);
      expect(sortPressed()['search.priceLowToHigh']).toBe('true');

      await m.apply();
      expect(m.current()).toEqual({
        path: '/en/hostels/lahore/girls',
        query: { sort: 'price-asc' },
      });
    });

    it('returns to Any and Recommended with only the free sorts after Clear all', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls?sort=price-asc&amenities=wifi',
        params: { gender: 'girls', sort: 'price-asc', amenities: 'wifi' },
        routes: LAHORE_ROUTES,
      });
      await m.openFilters();
      await m.choose('filters.clearAll');

      expect(pressed(['searchBar.anyAccommodation', 'common.girls'])).toEqual({
        'searchBar.anyAccommodation': 'true',
        'common.girls': 'false',
      });
      expect(sortPressed()['search.recommended']).toBe('true');
      expect(sortOffered()).toHaveLength(3);
    });

    it('renders every type, room and sort label as its translation key', async () => {
      const m = await mount({ url: '/en/search/lahore' });
      await m.openFilters();

      expect(sectionButtons('filters.typeOfStay').map((b) => b.textContent?.trim())).toEqual([
        'searchBar.anyAccommodation',
        'common.boys',
        'common.girls',
        'common.coLiving',
        'common.backpacker',
      ]);
      expect(sectionButtons('common.roomType').map((b) => b.textContent?.trim())).toEqual([
        'search.sharedRoom',
        'search.privateRoom',
      ]);

      const texts = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.hh-modal-root button'),
      ).map((b) => b.textContent?.trim());
      for (const english of ['Any type', 'Shared room', 'Price: low to high']) {
        expect(texts).not.toContain(english);
      }
    });

    it('marks the chosen room type and sort with aria-pressed', async () => {
      const m = await mount({ url: '/en/search/lahore' });
      await m.openFilters();

      expect(pressed(['search.sharedRoom', 'search.privateRoom'])).toEqual({
        'search.sharedRoom': 'true',
        'search.privateRoom': 'false',
      });

      await m.choose('search.privateRoom');
      expect(pressed(['search.sharedRoom', 'search.privateRoom'])).toEqual({
        'search.sharedRoom': 'false',
        'search.privateRoom': 'true',
      });
      expect(sortPressed()).toEqual({
        'search.recommended': 'true',
        'search.recentFirst': 'false',
        'search.oldestFirst': 'false',
      });
    });

    // The modal never emits this pair itself, so it is driven directly to prove the backstop.
    it('still drops a price sort that arrives with Any type', async () => {
      const m = await mount({
        url: '/en/hostels/lahore/girls',
        params: { gender: 'girls' },
        routes: LAHORE_ROUTES,
      });
      modalOf(m).applied.emit({
        accommodationType: 'all',
        propertyType: '',
        minPrice: null,
        maxPrice: null,
        roomType: 'shared',
        amenities: [],
        sort: 'price-asc',
      });
      await m.settle();

      expect(m.current()).toEqual({ path: '/en/hostels/lahore', query: {} });
    });
  });
});
