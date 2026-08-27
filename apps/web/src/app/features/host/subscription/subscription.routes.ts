import { Route } from '@angular/router';
import { Subscription } from './subscription/subscription';
import { SubscriptionCheckout } from './subscription-checkout/subscription-checkout';
import { PaymentHistory } from './payment-history/payment-history';

export const SUBSCRIPTION_ROUTES: Route[] = [
  { path: '', component: Subscription, title: 'Plans & billing — HostelHive' },
  { path: 'current', redirectTo: '', pathMatch: 'full' },
  {
    path: 'payments',
    component: PaymentHistory,
    title: 'Payment history — HostelHive',
  },
  {
    path: 'checkout/:productId',
    component: SubscriptionCheckout,
    title: 'Checkout — HostelHive',
  },
];
