// Host Subscription & Billing — local domain models.
// Scoped to @hostelhive/feature-subscription (mockup 18, Feature 7). These mirror the
// shape the typed SDK will eventually expose; until then they live with the feature.

/** Billing cadence for a plan / contract. */
export type BillingCycle = 'monthly' | 'annual';

/**
 * SubscriptionContract lifecycle. The host's subscription moves through this state machine:
 *
 *   draft ──checkout──▶ pending-payment ──webhook(success)──▶ active
 *                            │                                   │
 *                            └──webhook(fail)/timeout──▶ draft    ├──renew──▶ active
 *                                                                 ├──lapse──▶ expired
 *                                                                 └──cancel─▶ cancelled
 *   expired ──checkout/renew──▶ pending-payment   (re-subscribe path)
 *
 * Only `active` keeps the host's listings published; `expired` pauses publishing.
 */
export type SubscriptionContractStatus =
  | 'draft'
  | 'pending-payment'
  | 'active'
  | 'expired'
  | 'cancelled';

/** A selectable plan tier shown in the plan grid. */
export interface SubscriptionPlan {
  id: string;
  name: string;
  /** Price in PKR for the plan's `cycle`; `null` = custom / contact sales. */
  price: number | null;
  cycle: BillingCycle;
  /** Short caption under the price, e.g. "Up to 3 properties". */
  propertyLimitLabel: string;
  /** Max properties this tier allows; `null` = unlimited. */
  propertyLimit: number | null;
  features: string[];
  /** Highlighted "recommended" tier (orange border + emphasis). */
  recommended?: boolean;
  /** Custom-priced tier routes to "Contact sales" rather than checkout. */
  custom?: boolean;
}

/** A row in the payment-history table. */
export interface SubscriptionPayment {
  id: string;
  /** ISO date the payment was charged. */
  date: string;
  description: string;
  /** Masked payment method, e.g. "Card ··6411". */
  method: string;
  status: 'paid' | 'failed' | 'refunded' | 'pending';
  /** Amount in PKR. */
  amount: number;
  /** Receipt URL — `null` while a payment is still pending/failed. */
  receiptUrl: string | null;
}

/** The host's current subscription contract. */
export interface SubscriptionContract {
  id: string;
  planId: string;
  status: SubscriptionContractStatus;
  cycle: BillingCycle;
  /** Amount in PKR billed per `cycle`. */
  amount: number;
  /** ISO date the contract started; `null` for a never-activated draft. */
  startedAt: string | null;
  /** ISO date the contract renews / expires; `null` for a draft. */
  renewsAt: string | null;
  autoRenew: boolean;
  /** Properties currently in use under this contract. */
  propertiesUsed: number;
}
