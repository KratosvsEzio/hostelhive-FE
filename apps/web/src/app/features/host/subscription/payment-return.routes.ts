import { Routes } from '@angular/router';
import { PaymentCancelled } from './payment-cancelled';
import { PaymentSuccess } from './payment-success';

/**
 * The pages Safepay sends a payer back to. Their addresses are set in the backend's
 * environment, so these paths are a contract with it rather than a choice made here.
 */
export const PAYMENT_RETURN_ROUTES: Routes = [
  { path: 'success', component: PaymentSuccess, title: 'Payment — HostelHive' },
  {
    path: 'cancel',
    component: PaymentCancelled,
    title: 'Payment — HostelHive',
  },
];
