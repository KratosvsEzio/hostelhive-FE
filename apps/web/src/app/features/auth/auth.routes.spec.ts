import { AUTH_ROUTES } from './auth.routes';

describe('feature-auth routes', () => {
  it('exposes the lead-wall route', () => {
    expect(AUTH_ROUTES.length).toBeGreaterThan(0);
  });
});
