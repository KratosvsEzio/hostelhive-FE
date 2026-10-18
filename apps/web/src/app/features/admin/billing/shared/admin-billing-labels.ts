import type {
  BillingPayment,
  SubscriptionEvent,
} from '@hostelhive/data-access';
import { billingPaymentCharged } from '@app/shared/billing/billing-labels';

// Every i18n key below is written out as a literal so the i18n check can find it.

/** Our admin label for a known payment status, or null so the caller shows `status.name`. */
export function adminPaymentStatusKey(
  slug: string | null | undefined,
): string | null {
  switch (slug) {
    case 'pending':
      return 'adminBilling.paymentStatus.pending';
    case 'awaiting-verification':
      return 'adminBilling.paymentStatus.awaiting';
    case 'succeeded':
      return 'adminBilling.paymentStatus.succeeded';
    case 'failed':
      return 'adminBilling.paymentStatus.failed';
    default:
      return null;
  }
}

/** Our admin label for a known invoice status, or null so the caller shows `status.name`. */
export function adminInvoiceStatusKey(
  slug: string | null | undefined,
): string | null {
  switch (slug) {
    case 'open':
      return 'adminBilling.invoiceStatus.open';
    case 'paid':
      return 'adminBilling.invoiceStatus.paid';
    case 'void':
      return 'adminBilling.invoiceStatus.void';
    default:
      return null;
  }
}

/** The label for a payment method; an unknown method reads "Other", never the raw value. */
export function adminPaymentMethodKey(
  method: string | null | undefined,
): string {
  switch (method) {
    case 'safepay':
      return 'adminBilling.method.safepay';
    case 'bank_transfer':
      return 'adminBilling.method.bankTransfer';
    case 'cash':
      return 'adminBilling.method.cash';
    case 'admin_grant':
      return 'adminBilling.method.adminGrant';
    default:
      return 'adminBilling.method.other';
  }
}

/** The label for an invoice kind, or null so the caller shows a dash. */
export function adminInvoiceKindKey(
  kind: string | null | undefined,
): string | null {
  switch (kind) {
    case 'new':
      return 'adminBilling.kind.new';
    case 'renewal':
      return 'adminBilling.kind.renewal';
    case 'upgrade':
      return 'adminBilling.kind.upgrade';
    default:
      return null;
  }
}

// The backend's manual-refund marker ends with this, after the "Charged at Safepay" part.
const REFUND_FROM_DASHBOARD = /refund it from the Safepay dashboard/i;

/** failed AND (billingPaymentCharged(p) OR /refund it from the Safepay dashboard/i). */
export function adminPaymentNeedsRefund(
  p: Pick<BillingPayment, 'status' | 'failure_reason'>,
): boolean {
  if (p.status?.slug !== 'failed') return false;
  return (
    billingPaymentCharged(p) ||
    REFUND_FROM_DASHBOARD.test(p.failure_reason ?? '')
  );
}

/**
 * Wraps a formatted amount (or an invoice number) in Unicode isolates, the plain-text form of
 * `<bdi>`, so it reads as one unit inside a right-to-left sentence or table cell.
 */
export function isolate(text: string): string {
  return text ? `⁨${text}⁩` : '';
}

/** One hostel's billing page in the admin area. */
export function adminHostelBillingPath(hostelId: string): string {
  return `/admin/billing/hostels/${hostelId}`;
}

/** The admin billing tabs, as absolute paths for template links. */
export const ADMIN_BILLING_PATHS = {
  verification: '/admin/billing/verification',
  payments: '/admin/billing/payments',
  invoices: '/admin/billing/invoices',
  plans: '/admin/billing/plans',
} as const;

/** Router state that carries the hostel name into the hostel page. */
export interface AdminHostelState {
  hostel: { id: string; name: string };
}

/** One subscription event, ready for the history timeline. */
export interface AdminEventView {
  id: string;
  kind: string;
  /** literal adminBilling.events.* key */
  key: string;
  /** plan/from/to/reason/kind/currency — already resolved */
  params: Record<string, string>;
  /** raw API instant for {{date}}; the component formats it with adminUtcDate and merges it as params.date */
  date: string | null;
  invoiceNumber: string | null;
  createdAt: string;
}

type EventLabel = Pick<AdminEventView, 'key' | 'params' | 'date'>;

/** A non-blank string field of the event's data, or null. */
function text(
  data: Record<string, unknown> | null,
  field: string,
): string | null {
  const value = data?.[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

function plain(key: string): EventLabel {
  return { key, params: {}, date: null };
}

function eventLabel(
  e: SubscriptionEvent,
  planName: (code: string) => string,
): EventLabel {
  const data = e.data;
  const plan = (field: string): string | null => {
    const code = text(data, field);
    return code ? planName(code) : null;
  };

  switch (e.kind) {
    case 'activated': {
      const name = plan('plan');
      return name
        ? {
            key: 'adminBilling.events.activated',
            params: { plan: name },
            date: null,
          }
        : plain('adminBilling.events.activatedPlain');
    }
    case 'granted': {
      const name = plan('plan');
      return name
        ? {
            key: 'adminBilling.events.granted',
            params: { plan: name },
            date: null,
          }
        : plain('adminBilling.events.grantedPlain');
    }
    case 'renewed': {
      const name = plan('plan');
      const date = text(data, 'period_end');
      return name && date
        ? { key: 'adminBilling.events.renewed', params: { plan: name }, date }
        : plain('adminBilling.events.renewedPlain');
    }
    case 'upgraded': {
      const from = plan('from');
      const to = plan('to');
      return from && to
        ? {
            key: 'adminBilling.events.upgraded',
            params: { from, to },
            date: null,
          }
        : plain('adminBilling.events.upgradedPlain');
    }
    case 'downgraded': {
      const from = plan('from');
      const to = plan('to');
      return from && to
        ? {
            key: 'adminBilling.events.downgraded',
            params: { from, to },
            date: null,
          }
        : plain('adminBilling.events.downgradedPlain');
    }
    case 'downgrade_scheduled': {
      const to = plan('to');
      const date = text(data, 'at');
      return to && date
        ? {
            key: 'adminBilling.events.downgradeScheduled',
            params: { to },
            date,
          }
        : plain('adminBilling.events.downgradeScheduledPlain');
    }
    case 'cancel_scheduled': {
      const date = text(data, 'at');
      return date
        ? { key: 'adminBilling.events.cancelScheduled', params: {}, date }
        : plain('adminBilling.events.cancelScheduledPlain');
    }
    case 'downgrade_unscheduled':
      return plain('adminBilling.events.downgradeUnscheduled');
    case 'cancel_unscheduled':
      return plain('adminBilling.events.cancelUnscheduled');
    case 'past_due':
      return plain('adminBilling.events.pastDue');
    case 'expired':
      return plain('adminBilling.events.expired');
    case 'canceled':
      return plain('adminBilling.events.canceled');
    case 'payment_failed': {
      // Only the reason is read: payment_id is a raw database id.
      const reason = text(data, 'reason');
      return reason
        ? {
            key: 'adminBilling.events.paymentFailed',
            params: { reason },
            date: null,
          }
        : plain('adminBilling.events.paymentFailedPlain');
    }
    case 'currency_changed': {
      const from = text(data, 'from');
      const to = text(data, 'to');
      return from && to
        ? {
            key: 'adminBilling.events.currencyChanged',
            params: { from, to },
            date: null,
          }
        : plain('adminBilling.events.currencyChangedPlain');
    }
    default:
      return {
        key: 'adminBilling.events.other',
        params: { kind: e.kind },
        date: null,
      };
  }
}

/** planName(code) returns a name or the code. Uses the parameterised key only when every param is present, else the *Plain key. */
export function adminEventView(
  e: SubscriptionEvent,
  planName: (code: string) => string,
): AdminEventView {
  return {
    id: e.id,
    kind: e.kind,
    ...eventLabel(e, planName),
    invoiceNumber: e.invoice_number ?? null,
    createdAt: e.created_at,
  };
}

/** [...events].reverse().map(...); never mutates the input. */
export function adminEventsNewestFirst(
  events: readonly SubscriptionEvent[],
  planName: (code: string) => string,
): AdminEventView[] {
  return [...events].reverse().map((e) => adminEventView(e, planName));
}
