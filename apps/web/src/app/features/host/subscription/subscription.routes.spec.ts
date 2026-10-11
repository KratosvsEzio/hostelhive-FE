import { SUBSCRIPTION_ROUTES } from './subscription.routes';
import { BillingInvoiceDetail } from './billing-invoice-detail';
import { BillingInvoices } from './billing-invoices';
import { BillingPage } from './billing-page';
import { PaymentStep } from './payment-step';

describe('feature-subscription routes', () => {
  it('serves the billing page at the root', () => {
    expect(SUBSCRIPTION_ROUTES.find((r) => r.path === '')).toMatchObject({
      path: '',
      pathMatch: 'full',
      component: BillingPage,
      title: 'hostBilling.title',
    });
  });

  it('serves the payment step for one invoice', () => {
    expect(SUBSCRIPTION_ROUTES.find((r) => r.path === 'pay/:invoiceId')).toMatchObject({
      component: PaymentStep,
      title: 'routeTitle.payInvoice',
    });
  });

  it('serves the invoice history', () => {
    expect(SUBSCRIPTION_ROUTES.find((r) => r.path === 'invoices')).toMatchObject({
      component: BillingInvoices,
      title: 'Billing history — HostelHive',
    });
  });

  it('serves the detail of one invoice', () => {
    expect(SUBSCRIPTION_ROUTES.find((r) => r.path === 'invoices/:invoiceId')).toMatchObject({
      component: BillingInvoiceDetail,
      title: 'Invoice — HostelHive',
    });
  });

  it('serves nothing else', () => {
    expect(SUBSCRIPTION_ROUTES.map((r) => r.path)).toEqual([
      '',
      'pay/:invoiceId',
      'invoices',
      'invoices/:invoiceId',
    ]);
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
