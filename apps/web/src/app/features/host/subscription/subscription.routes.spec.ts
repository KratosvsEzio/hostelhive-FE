import { SUBSCRIPTION_ROUTES } from './subscription.routes';

describe('feature-subscription routes', () => {
  it('exposes the subscription route', () => {
    expect(SUBSCRIPTION_ROUTES.length).toBeGreaterThan(0);
  });
});
