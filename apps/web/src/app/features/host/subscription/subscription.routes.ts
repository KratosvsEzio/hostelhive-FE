import { Route } from '@angular/router';
import { Subscription } from './subscription/subscription';
import { CurrentSubscription } from './current-subscription/current-subscription';
import { SubscriptionCheckout } from './subscription-checkout/subscription-checkout';

export const SUBSCRIPTION_ROUTES: Route[] = [
  { path: '', component: Subscription, title: 'Plans & billing — HostelHive' },
  {
    path: 'current',
    component: CurrentSubscription,
    title: 'Current subscription — HostelHive',
  },
  {
    path: 'checkout/:productId',
    component: SubscriptionCheckout,
    title: 'Checkout — HostelHive',
  },
];
