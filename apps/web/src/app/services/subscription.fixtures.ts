// Fixture data for the subscription feature — mirrors design-mockups/18-host-subscription.html.
import {
  SubscriptionContract as Contract,
  SubscriptionPayment as Payment,
  SubscriptionPlan,
} from '@hostelhive/data-access';

export const PLANS: SubscriptionPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 1500,
    cycle: 'monthly',
    propertyLimit: 1,
    propertyLimitLabel: '1 property',
    features: ['Core listing', 'Basic analytics'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 4000,
    cycle: 'monthly',
    propertyLimit: 3,
    propertyLimitLabel: 'Up to 3 properties',
    features: ['Everything in Starter', 'Manager / Warden sub-users'],
    recommended: true,
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    price: 12000,
    cycle: 'monthly',
    propertyLimit: 10,
    propertyLimitLabel: 'Up to 10 properties',
    features: [
      'Everything in Growth',
      'Multi-property analytics',
      'Priority moderation',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    cycle: 'monthly',
    propertyLimit: null,
    propertyLimitLabel: 'Unlimited properties',
    features: [
      'Everything in Portfolio',
      'Dedicated manager',
      'Custom invoice branding',
    ],
    custom: true,
  },
];

/**
 * The host's current contract — an active annual Growth plan, renewing 12 Jan 2027.
 * Swap this fixture (or the service below) to preview `expired` / `pending-payment`
 * states without touching the component.
 */
export const CURRENT_CONTRACT: Contract = {
  id: 'ctr_1001',
  planId: 'growth',
  status: 'active',
  cycle: 'annual',
  amount: 48000,
  startedAt: '2026-01-12',
  renewsAt: '2027-01-12',
  autoRenew: true,
  propertiesUsed: 2,
};
