import { LISTING_ROUTES } from './listing.routes';

describe('feature-listing routes', () => {
  it('exposes the slug detail route', () => {
    expect(LISTING_ROUTES.some((r) => r.path === ':slug')).toBe(true);
  });
});
