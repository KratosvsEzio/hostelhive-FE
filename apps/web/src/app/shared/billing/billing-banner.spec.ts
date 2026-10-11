import type { BillingSubscription, HostBilling } from '@hostelhive/data-access';
import {
  bannerFor,
  type BannerInput,
  countdownParts,
  deriveAccess,
  formatCountdown,
  isLiveBilling,
  isOfflineBilling,
  RENEWAL_LEAD_MS,
} from './billing-banner';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const DAY = 86_400_000;
const HOUR = 3_600_000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function subscription(overrides: Partial<BillingSubscription> = {}): BillingSubscription {
  return {
    id: 'sub1',
    status: { id: 1, name: 'Active', slug: 'active' },
    currency: 'PKR',
    plan: { id: 'qTFruf', code: 'listing_crm', name: 'Listing + CRM', features: ['crm'] },
    current_period_start: iso(NOW - 20 * DAY),
    current_period_end: iso(NOW + 10 * DAY),
    grace_until: null,
    scheduled_plan: null,
    cancel_at_period_end: false,
    ...overrides,
  };
}

function withSlug(slug: string, overrides: Partial<BillingSubscription> = {}): BillingSubscription {
  return subscription({ status: { id: 9, name: slug, slug }, ...overrides });
}

function billing(overrides: Partial<HostBilling> = {}): HostBilling {
  return {
    currency: 'PKR',
    country_code: 'PK',
    payment_methods: ['safepay'],
    subscription: subscription(),
    features: ['listing', 'crm'],
    open_invoice: null,
    plans: [],
    ...overrides,
  };
}

const OPEN_INVOICE: HostBilling['open_invoice'] = {
  id: 'inv1',
  number: 'HH-0001',
  kind: 'new',
  total: '5000.00',
  currency: 'PKR',
  period_start: null,
  period_end: null,
  expires_at: null,
  awaiting_verification: false,
};

function owner(b: HostBilling | null, offlineObserved = false): BannerInput {
  return { billing: b, offlineObserved, canManageBilling: true };
}

function staff(b: HostBilling | null, offlineObserved = false): BannerInput {
  return { billing: b, offlineObserved, canManageBilling: false };
}

describe('isLiveBilling / isOfflineBilling', () => {
  it.each([
    ['active', true, false],
    ['past-due', true, false],
    ['incomplete', false, true],
    ['expired', false, true],
    ['canceled', false, true],
    ['suspended', false, false],
  ])('classifies %s', (slug, live, offline) => {
    const b = billing({ subscription: withSlug(slug) });
    expect(isLiveBilling(b)).toBe(live);
    expect(isOfflineBilling(b)).toBe(offline);
  });

  it('treats no subscription as offline', () => {
    const b = billing({ subscription: null });
    expect(isLiveBilling(b)).toBe(false);
    expect(isOfflineBilling(b)).toBe(true);
  });
});

describe('deriveAccess', () => {
  const live = billing();
  const liveNoCrm = billing({ features: ['listing'] });
  const expired = billing({ subscription: withSlug('expired') });
  const unknown = billing({ subscription: withSlug('suspended'), features: [] });

  it.each([
    ['unknown billing fails open', null, false, false, false, [false, false, null]],
    ['live with crm', live, false, false, false, [false, false, null]],
    ['live without crm', liveNoCrm, false, false, false, [false, true, 'crm']],
    ['offline billing', expired, false, false, false, [true, false, 'offline']],
    ['inactive observed, billing unknown', null, true, false, false, [true, false, 'offline']],
    ['inactive observed over live billing', live, true, false, false, [true, false, 'offline']],
    ['crm observed, billing unknown', null, false, true, false, [false, true, 'crm']],
    ['crm observed over live billing', live, false, true, false, [false, true, 'crm']],
    ['offline wins over crm observed', expired, false, true, false, [true, false, 'offline']],
    ['unknown slug without crm', unknown, false, false, false, [false, false, null]],
    ['admin, live without crm', liveNoCrm, false, false, true, [false, false, null]],
    ['admin, crm observed', null, false, true, true, [false, false, null]],
    ['admin, offline', expired, false, false, true, [true, false, null]],
    ['admin, inactive observed', null, true, false, true, [true, false, null]],
  ] as const)(
    '%s',
    (_label, b, inactiveObserved, crmObserved, isAdmin, [offline, crmLocked, bodyLock]) => {
      expect(deriveAccess({ billing: b, inactiveObserved, crmObserved, isAdmin })).toEqual({
        offline,
        crmLocked,
        bodyLock,
      });
    },
  );
});

describe('bannerFor', () => {
  describe('offline', () => {
    it('asks an expired owner to renew', () => {
      const end = iso(NOW - 3 * DAY);
      const b = billing({ subscription: withSlug('expired', { current_period_end: end }) });
      expect(bannerFor(owner(b), NOW)).toEqual({
        kind: 'expired',
        tone: 'danger',
        messageKey: 'hostAccess.expired',
        dates: {},
        params: {},
        boostPaused: false,
        countdownMs: null,
        action: 'renew',
        dismissible: false,
        periodEnd: end,
      });
    });

    it('dates a canceled plan by its period end and offers a plan', () => {
      const end = iso(NOW - DAY);
      const b = billing({ subscription: withSlug('canceled', { current_period_end: end }) });
      expect(bannerFor(owner(b), NOW)).toMatchObject({
        kind: 'canceled',
        tone: 'danger',
        messageKey: 'hostAccess.canceled',
        dates: { date: end },
        action: 'choosePlan',
        dismissible: false,
      });
    });

    it('leaves the date out of a canceled plan with no period end', () => {
      const b = billing({ subscription: withSlug('canceled', { current_period_end: null }) });
      expect(bannerFor(owner(b), NOW)).toMatchObject({ kind: 'canceled', dates: {} });
    });

    it.each([
      ['no subscription', null],
      ['incomplete', withSlug('incomplete')],
    ])('asks for payment when %s has an open invoice', (_label, sub) => {
      const b = billing({ subscription: sub, open_invoice: OPEN_INVOICE });
      expect(bannerFor(owner(b), NOW)).toMatchObject({
        kind: 'awaiting-payment',
        tone: 'danger',
        messageKey: 'hostAccess.awaitingPayment',
        action: 'pay',
        dismissible: false,
      });
    });

    it.each([
      ['no subscription', null],
      ['incomplete', withSlug('incomplete')],
    ])('offers a plan when %s has no open invoice', (_label, sub) => {
      const b = billing({ subscription: sub });
      expect(bannerFor(owner(b), NOW)).toMatchObject({
        kind: 'no-plan',
        tone: 'danger',
        messageKey: 'hostAccess.noPlan',
        action: 'choosePlan',
        dismissible: false,
      });
    });

    it.each([
      ['billing unknown', null],
      ['billing live', billing()],
      ['an unknown slug', billing({ subscription: withSlug('suspended') })],
    ])('sends an owner to billing on an observed refusal with %s', (_label, b) => {
      expect(bannerFor(owner(b, true), NOW)).toMatchObject({
        kind: 'offline',
        tone: 'danger',
        messageKey: 'hostAccess.offline',
        action: 'goToBilling',
        dismissible: false,
      });
    });

    it('prefers what billing says over the observed refusal', () => {
      const b = billing({ subscription: withSlug('expired') });
      expect(bannerFor(owner(b, true), NOW)?.kind).toBe('expired');
    });

    it.each([
      ['an observed refusal', null, true],
      ['expired billing', billing({ subscription: withSlug('expired') }), false],
      ['no subscription', billing({ subscription: null, open_invoice: OPEN_INVOICE }), false],
    ])('tells staff to ask the owner on %s, with no action', (_label, b, observed) => {
      expect(bannerFor(staff(b, observed), NOW)).toMatchObject({
        kind: 'offline',
        tone: 'danger',
        messageKey: 'hostAccess.offlineStaff',
        action: null,
        dismissible: false,
      });
    });
  });

  describe('nothing proactive', () => {
    it('shows nothing while billing is unknown', () => {
      expect(bannerFor(owner(null), NOW)).toBeNull();
    });

    it.each([
      ['past due', withSlug('past-due', { grace_until: iso(NOW + DAY) })],
      ['renewing', subscription({ current_period_end: iso(NOW + DAY) })],
      ['renew due', subscription({ current_period_end: iso(NOW - DAY) })],
    ])('shows staff nothing while %s', (_label, sub) => {
      expect(bannerFor(staff(billing({ subscription: sub })), NOW)).toBeNull();
    });

    it('shows nothing for an unknown slug', () => {
      const sub = withSlug('suspended', { current_period_end: iso(NOW + DAY) });
      expect(bannerFor(owner(billing({ subscription: sub })), NOW)).toBeNull();
    });

    it('shows nothing for an active plan with no period end', () => {
      const sub = subscription({ current_period_end: null });
      expect(bannerFor(owner(billing({ subscription: sub })), NOW)).toBeNull();
    });

    it('shows nothing for an active plan with an unreadable period end', () => {
      const sub = subscription({ current_period_end: 'not a date' });
      expect(bannerFor(owner(billing({ subscription: sub })), NOW)).toBeNull();
    });
  });

  describe('past due', () => {
    const end = iso(NOW - 2 * DAY);

    it('counts down to the grace end and notes the paused boost', () => {
      const grace = iso(NOW + 3 * DAY + 5 * HOUR);
      const sub = withSlug('past-due', {
        current_period_end: end,
        grace_until: grace,
        plan: { id: 'p', code: 'all', name: 'All', features: ['boost', 'crm'] },
      });
      expect(bannerFor(owner(billing({ subscription: sub })), NOW)).toEqual({
        kind: 'past-due',
        tone: 'warn',
        messageKey: 'hostAccess.pastDue',
        dates: { endDate: end, graceDate: grace },
        params: {},
        boostPaused: true,
        countdownMs: 3 * DAY + 5 * HOUR,
        action: 'renew',
        dismissible: false,
        periodEnd: end,
      });
    });

    it('does not mention boost when the plan has none', () => {
      const sub = withSlug('past-due', { current_period_end: end, grace_until: iso(NOW + 1) });
      expect(bannerFor(owner(billing({ subscription: sub })), NOW)).toMatchObject({
        kind: 'past-due',
        boostPaused: false,
        countdownMs: 1,
      });
    });

    it('leaves a null period end out of the dates', () => {
      const grace = iso(NOW + DAY);
      const sub = withSlug('past-due', { current_period_end: null, grace_until: grace });
      expect(bannerFor(owner(billing({ subscription: sub })), NOW)?.dates).toEqual({
        graceDate: grace,
      });
    });

    it.each([
      ['grace ends exactly now', iso(NOW)],
      ['grace has passed', iso(NOW - HOUR)],
      ['no grace date', null],
    ])('says grace is over when %s', (_label, grace) => {
      const sub = withSlug('past-due', { current_period_end: end, grace_until: grace });
      expect(bannerFor(owner(billing({ subscription: sub })), NOW)).toEqual({
        kind: 'grace-over',
        tone: 'warn',
        messageKey: 'hostAccess.graceOver',
        dates: {},
        params: {},
        boostPaused: false,
        countdownMs: null,
        action: 'renew',
        dismissible: false,
        periodEnd: end,
      });
    });
  });

  describe('plan ending', () => {
    it.each([
      ['7 days less 1ms', RENEWAL_LEAD_MS - 1],
      ['1ms', 1],
    ])('warns with %s left', (_label, left) => {
      const end = iso(NOW + left);
      const sub = subscription({ current_period_end: end, cancel_at_period_end: true });
      expect(bannerFor(owner(billing({ subscription: sub })), NOW)).toEqual({
        kind: 'cancel-pending',
        tone: 'info',
        messageKey: 'hostAccess.endsSoon',
        dates: { date: end },
        params: {},
        boostPaused: false,
        countdownMs: null,
        action: 'resume',
        dismissible: true,
        periodEnd: end,
      });
    });

    it.each([
      ['exactly 7 days', RENEWAL_LEAD_MS],
      ['more than 7 days', 10 * DAY],
      ['the end exactly now', 0],
      ['the end passed', -DAY],
    ])('shows nothing with %s left', (_label, left) => {
      const sub = subscription({ current_period_end: iso(NOW + left), cancel_at_period_end: true });
      expect(bannerFor(owner(billing({ subscription: sub })), NOW)).toBeNull();
    });
  });

  describe('renewing', () => {
    it.each([
      ['7 days less 1ms', RENEWAL_LEAD_MS - 1],
      ['1ms', 1],
    ])('gives the renewal date with %s left', (_label, left) => {
      const end = iso(NOW + left);
      const sub = subscription({ current_period_end: end });
      expect(bannerFor(owner(billing({ subscription: sub })), NOW)).toEqual({
        kind: 'renewing',
        tone: 'info',
        messageKey: 'hostAccess.renewsSoon',
        dates: { date: end },
        params: {},
        boostPaused: false,
        countdownMs: null,
        action: 'renew',
        dismissible: true,
        periodEnd: end,
      });
    });

    it('names the plan a scheduled downgrade switches to', () => {
      const end = iso(NOW + 2 * DAY);
      const sub = subscription({
        current_period_end: end,
        scheduled_plan: { id: 'qTFruf', code: 'listing', name: 'Listing' },
      });
      expect(bannerFor(owner(billing({ subscription: sub })), NOW)).toMatchObject({
        kind: 'renewing',
        messageKey: 'hostAccess.switchesSoon',
        params: { plan: 'Listing' },
        dates: { date: end },
      });
    });

    it.each([
      ['exactly 7 days', RENEWAL_LEAD_MS],
      ['more than 7 days', 10 * DAY],
    ])('shows nothing with %s left', (_label, left) => {
      const sub = subscription({ current_period_end: iso(NOW + left) });
      expect(bannerFor(owner(billing({ subscription: sub })), NOW)).toBeNull();
    });
  });

  describe('renew due', () => {
    it.each([
      ['ends exactly now', 0],
      ['ended', -3 * DAY],
    ])('says renewal is due when the period %s, and cannot be dismissed', (_label, offset) => {
      const end = iso(NOW + offset);
      const sub = subscription({ current_period_end: end });
      expect(bannerFor(owner(billing({ subscription: sub })), NOW)).toEqual({
        kind: 'renew-due',
        tone: 'info',
        messageKey: 'hostAccess.renewDue',
        dates: {},
        params: {},
        boostPaused: false,
        countdownMs: null,
        action: 'renew',
        dismissible: false,
        periodEnd: end,
      });
    });
  });
});

describe('countdownParts', () => {
  it.each([
    [10 * DAY + 23 * HOUR, { unit: 'day', value: 10 }],
    [2 * DAY - 1, { unit: 'day', value: 1 }],
    [DAY, { unit: 'day', value: 1 }],
    [DAY - 1, { unit: 'hour', value: 23 }],
    [2 * HOUR - 1, { unit: 'hour', value: 1 }],
    [HOUR, { unit: 'hour', value: 1 }],
    [HOUR - 1, null],
    [59 * 60_000, null],
    [0, null],
    [-HOUR, null],
  ] as const)('splits %d ms', (ms, expected) => {
    expect(countdownParts(ms)).toEqual(expected);
  });
});

describe('formatCountdown', () => {
  it('uses the locale plural for each unit', () => {
    expect(formatCountdown({ unit: 'day', value: 1 }, 'en')).toBe('1 day');
    expect(formatCountdown({ unit: 'day', value: 3 }, 'en')).toBe('3 days');
    expect(formatCountdown({ unit: 'hour', value: 1 }, 'en')).toBe('1 hour');
    expect(formatCountdown({ unit: 'hour', value: 5 }, 'en')).toBe('5 hours');
  });

  it('formats in the given locale', () => {
    const expected = new Intl.NumberFormat('de', {
      style: 'unit',
      unit: 'day',
      unitDisplay: 'long',
    }).format(2);
    expect(formatCountdown({ unit: 'day', value: 2 }, 'de')).toBe(expected);
    expect(expected).not.toBe('2 days');
  });
});
