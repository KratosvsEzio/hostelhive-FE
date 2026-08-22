import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideDataAccess } from '@core/provide-data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { SearchBar } from './search-bar';

@Component({ template: '' })
class Blank {}

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
