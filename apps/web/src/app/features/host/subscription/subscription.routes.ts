import { Route } from '@angular/router';
import { SubscriptionPlaceholder } from './subscription-placeholder';

/**
 * The hostel's billing pages. One page for now; anything not listed — including the old plan,
 * checkout and payment-history URLs — falls through to the app's catch-all.
 *
 * No permission guard: the paywall card links every host here, and a guard would turn that
 * link into `/forbidden` for staff who lack it.
 */
export const SUBSCRIPTION_ROUTES: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    component: SubscriptionPlaceholder,
    title: 'Billing — HostelHive',
  },
];
