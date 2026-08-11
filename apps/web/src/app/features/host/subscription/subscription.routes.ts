import { Route } from '@angular/router';
import { Subscription } from './subscription/subscription';
import { SubscriptionCheckout } from './subscription-checkout/subscription-checkout';

export const SUBSCRIPTION_ROUTES: Route[] = [
  { path: '', component: Subscription, title: 'Plans & billing — HostelHive' },
  { path: 'current', redirectTo: '', pathMatch: 'full' },
  {
    path: 'checkout/:productId',
    component: SubscriptionCheckout,
    title: 'Checkout — HostelHive',
  },
];
