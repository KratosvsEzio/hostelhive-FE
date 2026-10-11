import { Route } from '@angular/router';
import { BillingInvoiceDetail } from './billing-invoice-detail';
import { BillingInvoices } from './billing-invoices';
import { BillingPage } from './billing-page';
import { PaymentStep } from './payment-step';

/**
 * The hostel's billing pages: the billing screen itself, the invoice history and one invoice's
 * detail, and the payment step for one invoice.
 * Anything not listed — including the old plan, checkout and payment-history URLs — falls
 * through to the app's catch-all.
 *
 * No permission guard: the paywall card links every host here, and a guard would turn that
 * link into `/forbidden` for staff who lack it. Both pages render a refused request inline.
 */
export const SUBSCRIPTION_ROUTES: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    component: BillingPage,
    title: 'Billing — HostelHive',
  },
  {
    path: 'pay/:invoiceId',
    component: PaymentStep,
    title: 'Pay invoice — HostelHive',
  },
  {
    path: 'invoices',
    component: BillingInvoices,
    title: 'Billing history — HostelHive',
  },
  {
    path: 'invoices/:invoiceId',
    component: BillingInvoiceDetail,
    title: 'Invoice — HostelHive',
  },
];
