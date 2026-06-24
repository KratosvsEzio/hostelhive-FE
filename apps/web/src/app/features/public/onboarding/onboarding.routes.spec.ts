import { ONBOARDING_ROUTES } from './onboarding.routes';

describe('feature-onboarding routes', () => {
  it('exposes the wizard route', () => {
    expect(ONBOARDING_ROUTES.length).toBeGreaterThan(0);
  });
});
