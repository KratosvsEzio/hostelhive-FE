import type { StatusTone } from '@hostelhive/ui';
import type {
  BillingInvoice,
  BillingPayment,
  BillingPlan,
  BillingSubscription,
} from '@hostelhive/data-access';

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
 * Whether Safepay Subscriptions bills this plan right now. `billed_by` outlives the plan, so
 * it counts only while the plan is live.
 */
export function isSafepayBilled(sub: BillingSubscription | null): boolean {
  if (sub?.billed_by !== 'safepay_subscription') return false;
  const slug = sub.status?.slug;
  return slug === 'active' || slug === 'past-due';
}

/** Whether a Safepay-billed plan is in its free trial, which Safepay reports as `TRAILING`. */
export function isSafepayTrial(sub: BillingSubscription | null): boolean {
  return isSafepayBilled(sub) && sub?.safepay_status === 'TRAILING';
}

/** Pill tone for an invoice status. The pill's label comes from {@link billingInvoiceStatusKey}. */
export function invoiceStatusTone(slug: string | null | undefined): StatusTone {
  switch (slug) {
    case 'paid':
      return 'ok';
    case 'open':
      return 'warn';
    default:
      return 'neutral';
  }
}

/**
 * What an open invoice's latest payment attempt asks the payer to know before paying again.
 * `key` takes `{ number }`; `contactUs` asks for a link to the contact page beside it.
 */
export interface AttemptNotice {
  key:
    | 'hostPayment.chargedNotApplied'
    | 'hostPayment.lastAttemptFailed'
    | 'hostPayment.pendingNotice';
  tone: 'danger' | 'warn' | 'neutral';
  contactUs: boolean;
}

// The backend appends this to a payment it took but could not apply to the invoice.
const CHARGED_AT_SAFEPAY = /Charged at Safepay/i;

/**
 * The notice for an open invoice's latest payment attempt, or null when there is nothing to say.
 * `failure_reason` is internal wording: it only picks the notice and is never shown.
 */
export function latestAttemptNotice(
  invoice: BillingInvoice,
): AttemptNotice | null {
  if (invoice.status?.slug !== 'open') return null;
  const payments = invoice.payments ?? [];
  const latest = payments[payments.length - 1];
  if (!latest) return null;

  const status = latest.status?.slug;
  if (status === 'failed') {
    return CHARGED_AT_SAFEPAY.test(latest.failure_reason ?? '')
      ? {
          key: 'hostPayment.chargedNotApplied',
          tone: 'danger',
          contactUs: true,
        }
      : {
          key: 'hostPayment.lastAttemptFailed',
          tone: 'warn',
          contactUs: false,
        };
  }
  if (status === 'pending' && latest.payment_method === 'safepay') {
    return {
      key: 'hostPayment.pendingNotice',
      tone: 'neutral',
      contactUs: false,
    };
  }
  return null;
}

/** Our label for a known invoice status, or null so the caller shows the server's `status.name`. */
export function billingInvoiceStatusKey(
  slug: string | null | undefined,
): string | null {
  switch (slug) {
    case 'open':
      return 'hostBillingHistory.statusOpen';
    case 'paid':
      return 'hostBillingHistory.statusPaid';
    case 'void':
      return 'hostBillingHistory.statusVoid';
    default:
      return null;
  }
}

/** The short kind label for the history table, or null so the caller shows a dash. */
export function billingInvoiceKindLabelKey(
  kind: string | null | undefined,
): string | null {
  switch (kind) {
    case 'new':
      return 'hostBillingHistory.kindNew';
    case 'renewal':
      return 'hostBillingHistory.kindRenewal';
    case 'upgrade':
      return 'hostBillingHistory.kindUpgrade';
    default:
      return null;
  }
}

/** Pill tone for a payment attempt's status. */
export function billingPaymentStatusTone(
  slug: string | null | undefined,
): StatusTone {
  switch (slug) {
    case 'succeeded':
      return 'ok';
    case 'failed':
      return 'danger';
    case 'pending':
    case 'awaiting-verification':
      return 'warn';
    default:
      return 'neutral';
  }
}

/** Our label for a known payment status, or null so the caller shows the server's `status.name`. */
export function billingPaymentStatusKey(
  slug: string | null | undefined,
): string | null {
  switch (slug) {
    case 'pending':
      return 'hostBillingHistory.paymentPending';
    case 'awaiting-verification':
      return 'hostBillingHistory.paymentReview';
    case 'succeeded':
      return 'hostBillingHistory.paymentSucceeded';
    case 'failed':
      return 'hostBillingHistory.paymentFailed';
    default:
      return null;
  }
}

/** The label for a payment method; an unknown method reads "Other", never the raw value. */
export function billingPaymentMethodKey(
  method: string | null | undefined,
): string {
  switch (method) {
    case 'safepay':
      return 'hostBillingHistory.methodSafepay';
    case 'bank_transfer':
      return 'hostBillingHistory.methodBankTransfer';
    case 'cash':
      return 'hostBillingHistory.methodCash';
    case 'admin_grant':
      return 'hostBillingHistory.methodAdminGrant';
    default:
      return 'hostBillingHistory.methodOther';
  }
}

/** Whether a failed attempt was charged at Safepay but never applied to the invoice. */
export function billingPaymentCharged(
  payment: Pick<BillingPayment, 'status' | 'failure_reason'>,
): boolean {
  return (
    payment.status?.slug === 'failed' &&
    CHARGED_AT_SAFEPAY.test(payment.failure_reason ?? '')
  );
}

/** Whether any attempt on the invoice was charged but not applied. */
export function billingInvoiceCharged(
  invoice: Pick<BillingInvoice, 'payments'>,
): boolean {
  return (invoice.payments ?? []).some(billingPaymentCharged);
}

/**
 * Our own note under one payment attempt. `key` takes `{ number }` for the charged case;
 * `contactUs` asks for a link to the contact page beside it.
 */
export interface BillingAttemptNote {
  key: 'hostPayment.chargedNotApplied' | 'hostBillingHistory.attemptFailed';
  tone: 'danger' | 'neutral';
  contactUs: boolean;
}

/**
 * The note for one payment attempt, or null when it needs none. `failure_reason` only picks
 * the note and is never part of it.
 */
export function billingAttemptNote(
  payment: Pick<BillingPayment, 'status' | 'failure_reason'>,
): BillingAttemptNote | null {
  if (billingPaymentCharged(payment)) {
    return {
      key: 'hostPayment.chargedNotApplied',
      tone: 'danger',
      contactUs: true,
    };
  }
  if (payment.status?.slug === 'failed') {
    return {
      key: 'hostBillingHistory.attemptFailed',
      tone: 'neutral',
      contactUs: false,
    };
  }
  return null;
}

/** The hostel's billing history page. */
export function billingHistoryPath(hostelId: string): string {
  return `/host/${hostelId}/subscription/invoices`;
}

/** One invoice's page in the hostel's billing history. */
export function billingInvoicePath(hostelId: string, invoiceId: string): string {
  return `/host/${hostelId}/subscription/invoices/${invoiceId}`;
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
 * disabled `checkout` (Current plan, Unavailable) never starts one. `kind: 'scheduled'` is the
 * cheaper plan already set to take over at renewal. `kind: 'none'` means no button at all.
 * `amount` is the raw decimal string, formatted by the template with `billingMoney`; nothing
 * here formats or compares money.
 */
export interface PlanButton {
  key: string;
  disabled: boolean;
  kind: 'checkout' | 'downgrade' | 'scheduled' | 'none';
  /** `amount_due_now`, for `upgradePayNow` and the `payNow` sub-line. */
  amount?: string;
  sublineKey?: string;
  /** Plain text shown under the button. */
  hintKey?: string;
  /** A second, quieter way to buy: subscribing through Safepay, with a free trial when `days` is set. */
  subscribe?: PlanSubscribe;
}

/** The Safepay subscribe action on a plan card. `days` is the plan's free trial, for `startTrial`. */
export interface PlanSubscribe {
  key: 'hostBilling.startTrial' | 'hostBilling.subscribeWithSafepay';
  days?: number;
}

/**
 * The plan card's button. A plan Safepay bills offers no change at all: its own card reads
 * Current plan and every other one Unavailable, whatever action the server sent.
 */
export function planButton(
  plan: BillingPlan,
  subscription: BillingSubscription | null,
): PlanButton {
  const amount = plan.amount_due_now ?? undefined;

  if (isSafepayBilled(subscription)) {
    return plan.id === subscription?.plan.id
      ? {
          key: 'hostBilling.currentPlanButton',
          disabled: true,
          kind: 'checkout',
        }
      : { key: 'hostBilling.unavailable', disabled: true, kind: 'checkout' };
  }

  switch (plan.action) {
    case 'buy': {
      const days = plan.trial_days ?? 0;
      return {
        key: 'hostBilling.choosePlan',
        disabled: false,
        kind: 'checkout',
        subscribe:
          days > 0
            ? { key: 'hostBilling.startTrial', days }
            : { key: 'hostBilling.subscribeWithSafepay' },
      };
    }

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
      // A cancelling plan does not renew, so there is no renewal price to quote.
      const renews =
        plan.price &&
        subscription?.current_period_end &&
        !subscription.cancel_at_period_end;
      return {
        key: 'hostBilling.upgradePayNow',
        disabled: false,
        kind: 'checkout',
        amount,
        ...(renews ? { sublineKey: 'hostBilling.renewsAtOn' } : {}),
      };
    }

    case 'downgrade':
      // Cancel wins at period end, so no switch, scheduled or not, happens until the plan resumes.
      if (subscription?.cancel_at_period_end) {
        return {
          key: 'hostBilling.switchAtRenewal',
          disabled: true,
          kind: 'downgrade',
          hintKey: 'hostBilling.resumeToSwitch',
        };
      }
      return plan.scheduled
        ? { key: 'hostBilling.scheduled', disabled: true, kind: 'scheduled' }
        : {
            key: 'hostBilling.switchAtRenewal',
            disabled: false,
            kind: 'downgrade',
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
