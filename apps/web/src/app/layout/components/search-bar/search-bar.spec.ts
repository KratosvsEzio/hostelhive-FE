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
