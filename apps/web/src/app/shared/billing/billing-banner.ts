import type { HostBilling } from '@hostelhive/data-access';
import { isSafepayBilled } from './billing-labels';

// Every i18n key below is written out as a literal so the i18n check can find it.

/** How far ahead of the period end the renewal and plan-ending banners appear. */
export const RENEWAL_LEAD_MS = 7 * 86_400_000;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type BannerKind =
  | 'expired'
  | 'canceled'
  | 'no-plan'
  | 'awaiting-payment'
  | 'offline'
  | 'past-due'
  | 'grace-over'
  | 'cancel-pending'
  | 'renewing'
  | 'renew-due';

export type BannerTone = 'info' | 'warn' | 'danger';

export type BannerAction =
  | 'renew'
  | 'choosePlan'
  | 'pay'
  | 'resume'
  | 'goToBilling'
  | 'updateCard';

export interface BannerInput {
  billing: HostBilling | null;
  /** A "You need to subscribe" refusal was seen for this hostel. */
  offlineObserved: boolean;
  canManageBilling: boolean;
}

/** The one banner the host console shows for a hostel, or none. */
export interface BillingBannerState {
  kind: BannerKind;
  tone: BannerTone;
  /** Full i18n key, e.g. `hostAccess.renewsSoon`. */
  messageKey: string;
  /** Raw API strings; the component renders them through `apiDate`. */
  dates: Partial<Record<'date' | 'endDate' | 'graceDate', string>>;
  /** The plan name as returned. */
  params: Partial<Record<'plan', string>>;
  boostPaused: boolean;
  /** Only while past due with grace still ahead. */
  countdownMs: number | null;
  /** Null for staff. */
  action: BannerAction | null;
  /** A second, quieter action beside `action`. */
  secondaryAction: BannerAction | null;
  dismissible: boolean;
  /** The period a dismissal belongs to. */
  periodEnd: string | null;
}

export interface AccessState {
  offline: boolean;
  crmLocked: boolean;
  /** What replaces a CRM section's body, if anything. */
  bodyLock: 'offline' | 'crm' | null;
}

/** Listing and CRM are on: the subscription is active or past due within grace. */
export function isLiveBilling(b: HostBilling): boolean {
  const slug = b.subscription?.status.slug;
  return slug === 'active' || slug === 'past-due';
}

/** No subscription, or one that is not (or no longer) paid for. An unknown slug is neither live nor offline. */
export function isOfflineBilling(b: HostBilling): boolean {
  const sub = b.subscription;
  if (!sub) return true;
  const slug = sub.status.slug;
  return slug === 'incomplete' || slug === 'expired' || slug === 'canceled';
}

/** While billing is unknown nothing is offline or locked unless the server already refused. */
export function deriveAccess(i: {
  billing: HostBilling | null;
  inactiveObserved: boolean;
  crmObserved: boolean;
  isAdmin: boolean;
}): AccessState {
  const { billing, inactiveObserved, crmObserved, isAdmin } = i;
  const offline = inactiveObserved || (billing !== null && isOfflineBilling(billing));
  const crmLocked =
    !offline &&
    !isAdmin &&
    (crmObserved ||
      (billing !== null && isLiveBilling(billing) && !billing.features.includes('crm')));
  const bodyLock = isAdmin ? null : offline ? 'offline' : crmLocked ? 'crm' : null;
  return { offline, crmLocked, bodyLock };
}

/** Picks the single banner to show at `nowMs`, highest precedence first. */
export function bannerFor(input: BannerInput, nowMs: number): BillingBannerState | null {
  const { billing, offlineObserved, canManageBilling } = input;
  const billingOffline = billing !== null && isOfflineBilling(billing);
  if (billingOffline || offlineObserved) {
    return offlineBanner(billing, billingOffline, canManageBilling);
  }
  if (!billing || !canManageBilling) return null;

  const sub = billing.subscription;
  if (!sub) return null;
  const endRaw = sub.current_period_end;
  const end = instant(endRaw);
  const slug = sub.status.slug;

  // Safepay charges the plan it bills, so nothing here asks the owner to renew or pay by hand.
  const safepay = isSafepayBilled(sub);
  // A saved card is charged on its own, so the owner is not asked to renew by hand.
  const autoRenew = billing.auto_renew && !safepay;
  const renewAction: BannerAction = safepay || autoRenew ? 'goToBilling' : 'renew';

  if (slug === 'past-due') {
    const grace = instant(sub.grace_until);
    if (grace !== null && grace > nowMs && safepay) {
      return state({
        kind: 'past-due',
        tone: 'warn',
        messageKey: 'hostAccess.pastDueSafepay',
        dates: dates({ endDate: endRaw, graceDate: sub.grace_until }),
        boostPaused: sub.plan.features.includes('boost'),
        countdownMs: grace - nowMs,
        action: 'goToBilling',
        periodEnd: endRaw,
      });
    }
    if (grace !== null && grace > nowMs) {
      return state({
        kind: 'past-due',
        tone: 'warn',
        messageKey: autoRenew ? 'hostAccess.pastDueCard' : 'hostAccess.pastDue',
        dates: dates({ endDate: endRaw, graceDate: sub.grace_until }),
        boostPaused: sub.plan.features.includes('boost'),
        countdownMs: grace - nowMs,
        action: autoRenew ? 'updateCard' : 'renew',
        secondaryAction: autoRenew && billing.open_invoice ? 'pay' : null,
        periodEnd: endRaw,
      });
    }
    return state({
      kind: 'grace-over',
      tone: 'warn',
      messageKey: safepay ? 'hostAccess.graceOverSafepay' : 'hostAccess.graceOver',
      action: safepay ? 'goToBilling' : 'renew',
      periodEnd: endRaw,
    });
  }

  if (slug !== 'active' || end === null) return null;
  const left = end - nowMs;

  if (sub.cancel_at_period_end) {
    if (left <= 0 || left >= RENEWAL_LEAD_MS) return null;
    return state({
      kind: 'cancel-pending',
      tone: 'info',
      messageKey: 'hostAccess.endsSoon',
      dates: dates({ date: endRaw }),
      action: 'resume',
      dismissible: true,
      periodEnd: endRaw,
    });
  }

  if (left <= 0) {
    return state({
      kind: 'renew-due',
      tone: 'info',
      messageKey: autoRenew ? 'hostAccess.renewDueCard' : 'hostAccess.renewDue',
      action: renewAction,
      periodEnd: endRaw,
    });
  }
  if (left >= RENEWAL_LEAD_MS) return null;

  const scheduled = sub.scheduled_plan;
  const renewsKey = autoRenew ? 'hostAccess.renewsSoonCard' : 'hostAccess.renewsSoon';
  return state({
    kind: 'renewing',
    tone: 'info',
    messageKey: scheduled ? 'hostAccess.switchesSoon' : renewsKey,
    dates: dates({ date: endRaw }),
    params: scheduled ? { plan: scheduled.name } : {},
    action: renewAction,
    dismissible: true,
    periodEnd: endRaw,
  });
}

/** The largest whole unit left, rounded down; null under an hour. */
export function countdownParts(ms: number): { unit: 'day' | 'hour'; value: number } | null {
  if (ms >= DAY_MS) return { unit: 'day', value: Math.floor(ms / DAY_MS) };
  if (ms >= HOUR_MS) return { unit: 'hour', value: Math.floor(ms / HOUR_MS) };
  return null;
}

/** "3 days", "1 hour", in the locale's own plural rules. */
export function formatCountdown(p: { unit: 'day' | 'hour'; value: number }, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit: p.unit, unitDisplay: 'long' }).format(
    p.value,
  );
}

function offlineBanner(
  billing: HostBilling | null,
  billingOffline: boolean,
  canManageBilling: boolean,
): BillingBannerState {
  const periodEnd = billing?.subscription?.current_period_end ?? null;
  if (!canManageBilling) {
    return state({
      kind: 'offline',
      tone: 'danger',
      messageKey: 'hostAccess.offlineStaff',
      periodEnd,
    });
  }
  if (!billing || !billingOffline) {
    return state({
      kind: 'offline',
      tone: 'danger',
      messageKey: 'hostAccess.offline',
      action: 'goToBilling',
      periodEnd,
    });
  }
  const slug = billing.subscription?.status.slug;
  if (slug === 'expired') {
    return state({
      kind: 'expired',
      tone: 'danger',
      messageKey: 'hostAccess.expired',
      action: 'renew',
      periodEnd,
    });
  }
  if (slug === 'canceled') {
    return state({
      kind: 'canceled',
      tone: 'danger',
      messageKey: 'hostAccess.canceled',
      dates: dates({ date: periodEnd }),
      action: 'choosePlan',
      periodEnd,
    });
  }
  if (billing.open_invoice) {
    return state({
      kind: 'awaiting-payment',
      tone: 'danger',
      messageKey: 'hostAccess.awaitingPayment',
      action: 'pay',
      periodEnd,
    });
  }
  return state({
    kind: 'no-plan',
    tone: 'danger',
    messageKey: 'hostAccess.noPlan',
    action: 'choosePlan',
    periodEnd,
  });
}

type StateFields = Pick<BillingBannerState, 'kind' | 'tone' | 'messageKey' | 'periodEnd'> &
  Partial<BillingBannerState>;

function state(fields: StateFields): BillingBannerState {
  return {
    dates: {},
    params: {},
    boostPaused: false,
    countdownMs: null,
    action: null,
    secondaryAction: null,
    dismissible: false,
    ...fields,
  };
}

/** Drops the dates the API left null, so the template never formats one. */
function dates(
  raw: Partial<Record<'date' | 'endDate' | 'graceDate', string | null>>,
): BillingBannerState['dates'] {
  const out: BillingBannerState['dates'] = {};
  for (const [key, value] of Object.entries(raw) as [keyof typeof raw, string | null][]) {
    if (value) out[key] = value;
  }
  return out;
}

function instant(raw: string | null): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}
