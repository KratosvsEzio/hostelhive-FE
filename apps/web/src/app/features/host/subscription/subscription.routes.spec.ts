import { SUBSCRIPTION_ROUTES } from './subscription.routes';
import { BillingPage } from './billing-page';
import { PayPlaceholder } from './pay-placeholder';

describe('feature-subscription routes', () => {
  it('serves the billing page at the root', () => {
    expect(SUBSCRIPTION_ROUTES.find((r) => r.path === '')).toMatchObject({
      path: '',
      pathMatch: 'full',
      component: BillingPage,
      title: 'Billing — HostelHive',
    });
  });

  it('serves the payment step for one invoice', () => {
    expect(SUBSCRIPTION_ROUTES.find((r) => r.path === 'pay/:invoiceId')).toMatchObject({
      component: PayPlaceholder,
    });
  });

  it('serves nothing else', () => {
    expect(SUBSCRIPTION_ROUTES.map((r) => r.path)).toEqual(['', 'pay/:invoiceId']);
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
    for (const route of SUBSCRIPTION_ROUTES) {
      expect(route.canActivate).toBeUndefined();
      expect(route.canMatch).toBeUndefined();
    }
  });
});
