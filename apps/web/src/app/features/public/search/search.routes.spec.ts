import { SEARCH_ROUTES } from './search.routes';

describe('feature-search routes', () => {
  it('defaults to the split search view and redirects the legacy map path', () => {
    expect(SEARCH_ROUTES.map((r) => r.path)).toEqual(['', 'map', ':location']);
    expect(SEARCH_ROUTES[0].component).toBeDefined();
    expect(SEARCH_ROUTES[1].redirectTo).toBe('');
  });

  it('serves a readable location URL with the same component', () => {
    const location = SEARCH_ROUTES.find((r) => r.path === ':location');
    expect(location?.component).toBe(SEARCH_ROUTES[0].component);
  });

  // The router matches in order, so a literal segment declared after ':location' would
  // never be reached — /search/map would load the search page for a place called "map"
  // instead of redirecting.
  it('declares the literal map redirect before the location wildcard', () => {
    const paths = SEARCH_ROUTES.map((r) => r.path);
    expect(paths.indexOf('map')).toBeLessThan(paths.indexOf(':location'));
  });
});
