import type { StatusTone } from '@hostelhive/ui';
import type { BillingPlan, BillingSubscription } from '@hostelhive/data-access';

// Every i18n key below is written out as a literal so the i18n check can find it.

/** Pill tone for a subscription status. The pill's label is the server's `status.name`. */
export function statusTone(slug: string | null | undefined): StatusTone {
  switch (slug) {
    case 'active':
      return 'ok';
    case 'past-due':
      return 'warn';
    case 'expired':
      return 'danger';
    default:
      return 'neutral';
  }
}

/**
 * The features a plan can carry, in the order every billing surface lists them, with their
 * labels. Listing is part of every plan; a plan's `features` only ever names the add-ons.
 */
export const BILLING_FEATURES: readonly { code: string; labelKey: string }[] = [
  { code: 'listing', labelKey: 'sharedBilling.featureListing' },
  { code: 'boost', labelKey: 'sharedBilling.featureBoost' },
  { code: 'crm', labelKey: 'sharedBilling.featureCrm' },
];

/** The purpose line for an invoice kind, or null for a kind this app does not know. */
export function invoiceKindKey(kind: string | null | undefined): string | null {
  switch (kind) {
    case 'new':
      return 'hostBilling.kindNew';
    case 'renewal':
      return 'hostBilling.kindRenewal';
    case 'upgrade':
      return 'hostBilling.kindUpgrade';
    default:
      return null;
  }
}

/**
 * The one button a plan card shows, as the server's `action` dictates.
 *
 * `kind` is the flow the button belongs to and `disabled` whether it can be pressed, so a
 * disabled `checkout` (Current plan, Unavailable) never starts one. `kind: 'none'` means no
 * button at all. `amount` is the raw decimal string, formatted by the template with
 * `billingMoney`; nothing here formats or compares money.
 */
export interface PlanButton {
  key: string;
  disabled: boolean;
  kind: 'checkout' | 'downgrade' | 'none';
  /** `amount_due_now`, for `upgradePayNow` and the `payNow` sub-line. */
  amount?: string;
  sublineKey?: string;
  badgeKey?: string;
  hintKey?: string;
}

export function planButton(
  plan: BillingPlan,
  subscription: BillingSubscription | null,
): PlanButton {
  const amount = plan.amount_due_now ?? undefined;

  switch (plan.action) {
    case 'buy':
      return {
        key: 'hostBilling.choosePlan',
        disabled: false,
        kind: 'checkout',
      };

    case 'current':
      return {
        key: 'hostBilling.currentPlanButton',
        disabled: true,
        kind: 'checkout',
      };

    case 'renew':
      return amount
        ? {
            key: 'hostBilling.renew',
            disabled: false,
            kind: 'checkout',
            amount,
            sublineKey: 'hostBilling.payNow',
          }
        : { key: 'hostBilling.renew', disabled: false, kind: 'checkout' };

    case 'upgrade': {
      // The label quotes the amount, so without one the plain label is the honest choice.
      if (!amount) {
        return {
          key: 'hostBilling.choosePlan',
          disabled: false,
          kind: 'checkout',
        };
      }
      const renews = plan.price && subscription?.current_period_end;
      return {
        key: 'hostBilling.upgradePayNow',
        disabled: false,
        kind: 'checkout',
        amount,
        ...(renews ? { sublineKey: 'hostBilling.renewsAtOn' } : {}),
      };
    }

    case 'downgrade':
      return plan.scheduled
        ? {
            key: 'hostBilling.switchAtRenewal',
            disabled: true,
            kind: 'downgrade',
            badgeKey: 'hostBilling.scheduledForRenewal',
          }
        : {
            key: 'hostBilling.switchAtRenewal',
            disabled: true,
            kind: 'downgrade',
            hintKey: 'hostBilling.switchComingSoon',
          };

    case 'unavailable':
      return {
        key: 'hostBilling.unavailable',
        disabled: true,
        kind: 'checkout',
      };

    default:
      return { key: '', disabled: true, kind: 'none' };
  }
}
