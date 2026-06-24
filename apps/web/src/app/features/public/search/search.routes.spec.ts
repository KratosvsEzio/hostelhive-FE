import { SEARCH_ROUTES } from './search.routes';

describe('feature-search routes', () => {
  it('defaults to the split search view and redirects the legacy map path', () => {
    expect(SEARCH_ROUTES.map((r) => r.path)).toEqual(['', 'map']);
    expect(SEARCH_ROUTES[0].component).toBeDefined();
    expect(SEARCH_ROUTES[1].redirectTo).toBe('');
  });
});
