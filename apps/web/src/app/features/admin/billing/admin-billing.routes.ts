import { Route } from '@angular/router';
import { AdminHostelBilling } from './hostel/admin-hostel-billing';
import { AdminBillingInvoices } from './invoices/admin-billing-invoices';
import { AdminBillingPayments } from './payments/admin-billing-payments';
import { AdminPlans } from './plans/admin-plans';
import { AdminVerification } from './verification/admin-verification';

/**
 * The admin billing pages, mounted under `/admin/billing` behind the `admin` role.
 *
 * The verification queue is the section's front page, even when it is empty.
 */
export const ADMIN_BILLING_ROUTES: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'verification' },
  {
    path: 'verification',
    component: AdminVerification,
    title: 'adminBilling.titles.verification',
  },
  {
    path: 'payments',
    component: AdminBillingPayments,
    title: 'adminBilling.titles.payments',
  },
  {
    path: 'invoices',
    component: AdminBillingInvoices,
    title: 'adminBilling.titles.invoices',
  },
  {
    path: 'plans',
    component: AdminPlans,
    title: 'adminBilling.titles.plans',
  },
  {
    path: 'hostels/:hostelId',
    component: AdminHostelBilling,
    title: 'adminBilling.titles.hostel',
  },
];
