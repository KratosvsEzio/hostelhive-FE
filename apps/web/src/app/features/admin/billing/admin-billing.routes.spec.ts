import { ADMIN_BILLING_ROUTES } from './admin-billing.routes';
import { AdminHostelBilling } from './hostel/admin-hostel-billing';
import { AdminBillingInvoices } from './invoices/admin-billing-invoices';
import { AdminBillingPayments } from './payments/admin-billing-payments';
import { AdminPlans } from './plans/admin-plans';
import { AdminVerification } from './verification/admin-verification';

describe('admin billing routes', () => {
  it('opens the verification queue by default', () => {
    expect(ADMIN_BILLING_ROUTES[0]).toEqual({
      path: '',
      pathMatch: 'full',
      redirectTo: 'verification',
    });
  });

  it.each([
    ['verification', AdminVerification, 'adminBilling.titles.verification'],
    ['payments', AdminBillingPayments, 'adminBilling.titles.payments'],
    ['invoices', AdminBillingInvoices, 'adminBilling.titles.invoices'],
    ['plans', AdminPlans, 'adminBilling.titles.plans'],
    ['hostels/:hostelId', AdminHostelBilling, 'adminBilling.titles.hostel'],
  ])('serves %s with its own title', (path, component, title) => {
    expect(ADMIN_BILLING_ROUTES.find((r) => r.path === path)).toMatchObject({ component, title });
  });

  it('serves nothing else', () => {
    expect(ADMIN_BILLING_ROUTES.map((r) => r.path)).toEqual([
      '',
      'verification',
      'payments',
      'invoices',
      'plans',
      'hostels/:hostelId',
    ]);
  });

  // The parent route carries the one role guard; a second one here could only disagree with it.
  it('adds no guard of its own', () => {
    for (const route of ADMIN_BILLING_ROUTES) {
      expect(route.canActivate).toBeUndefined();
      expect(route.canMatch).toBeUndefined();
    }
  });
});
