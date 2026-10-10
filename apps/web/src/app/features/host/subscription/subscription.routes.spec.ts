import { SUBSCRIPTION_ROUTES } from './subscription.routes';
import { SubscriptionPlaceholder } from './subscription-placeholder';

describe('feature-subscription routes', () => {
  it('serves exactly one page, the billing placeholder', () => {
    expect(SUBSCRIPTION_ROUTES).toHaveLength(1);
    expect(SUBSCRIPTION_ROUTES[0]).toMatchObject({
      path: '',
      pathMatch: 'full',
      component: SubscriptionPlaceholder,
      title: 'Billing — HostelHive',
    });
  });

  // The old plan, checkout and payment-history URLs must match nothing here and fall to the catch-all.
  it('no longer serves the removed billing pages', () => {
    const paths = SUBSCRIPTION_ROUTES.map((r) => r.path);
    for (const removed of ['payments', 'current', 'checkout/:productId']) {
      expect(paths).not.toContain(removed);
    }
  });

  // A permission guard would turn the paywall's link into /forbidden for staff without it.
  it('is not permission-guarded', () => {
    expect(SUBSCRIPTION_ROUTES[0].canActivate).toBeUndefined();
  });
});
