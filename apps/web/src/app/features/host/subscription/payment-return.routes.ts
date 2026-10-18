import { CanMatchFn, Routes } from '@angular/router';
import { BILLING_RETURN_MODE, BillingReturn } from './billing-return';
import { PaymentCancelled } from './payment-cancelled';
import { PaymentSuccess } from './payment-success';
import { returnParam } from './safepay-checkout';

/**
 * Matches a return from saving a card or starting a subscription: `?card=` or `?subscription=`
 * with no invoice. Anything else, a bare link included, stays with the invoice pages.
 */
export const cardOrSubscriptionReturn: CanMatchFn = (
  _route,
  _segments,
  snapshot,
) => {
  const params = snapshot?.queryParamMap;
  if (!params || returnParam(params, 'invoice')) return false;
  return params.has('card') || params.has('subscription');
};

/**
 * The pages Safepay sends a payer back to. Their addresses are set in the backend's
 * environment, so these paths are a contract with it rather than a choice made here.
 */
export const PAYMENT_RETURN_ROUTES: Routes = [
  {
    path: 'success',
    canMatch: [cardOrSubscriptionReturn],
    component: BillingReturn,
    providers: [{ provide: BILLING_RETURN_MODE, useValue: 'success' }],
    title: 'common.payment',
  },
  { path: 'success', component: PaymentSuccess, title: 'common.payment' },
  {
    path: 'cancel',
    canMatch: [cardOrSubscriptionReturn],
    component: BillingReturn,
    providers: [{ provide: BILLING_RETURN_MODE, useValue: 'cancel' }],
    title: 'common.payment',
  },
  {
    path: 'cancel',
    component: PaymentCancelled,
    title: 'common.payment',
  },
];
