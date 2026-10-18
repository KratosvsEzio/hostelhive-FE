import type { SubscriptionEvent } from '@hostelhive/data-access';
import {
  ADMIN_BILLING_PATHS,
  adminEventView,
  adminEventsNewestFirst,
  adminHostelBillingPath,
  adminInvoiceKindKey,
  adminInvoiceStatusKey,
  adminPaymentMethodKey,
  adminPaymentNeedsRefund,
  adminPaymentStatusKey,
} from './admin-billing-labels';

const PLAN_NAMES: Record<string, string> = {
  listing: 'Listing',
  boost: 'Listing + Boost',
};
const planName = (code: string) => PLAN_NAMES[code] ?? code;

function event(
  kind: string,
  data: Record<string, unknown> | null,
  over: Partial<SubscriptionEvent> = {},
): SubscriptionEvent {
  return {
    id: 'eVt1',
    kind,
    data,
    created_at: '2026-10-11T09:00:00Z',
    invoice_number: null,
    ...over,
  };
}

function status(slug: string) {
  return { id: 1, name: slug, slug };
}

describe('admin billing labels', () => {
  it('labels each payment status and leaves an unknown one to the server name', () => {
    expect(adminPaymentStatusKey('pending')).toBe(
      'adminBilling.paymentStatus.pending',
    );
    expect(adminPaymentStatusKey('awaiting-verification')).toBe(
      'adminBilling.paymentStatus.awaiting',
    );
    expect(adminPaymentStatusKey('succeeded')).toBe(
      'adminBilling.paymentStatus.succeeded',
    );
    expect(adminPaymentStatusKey('failed')).toBe(
      'adminBilling.paymentStatus.failed',
    );
    expect(adminPaymentStatusKey('refunded')).toBeNull();
    expect(adminPaymentStatusKey(null)).toBeNull();
    expect(adminPaymentStatusKey(undefined)).toBeNull();
  });

  it('labels each invoice status and leaves an unknown one to the server name', () => {
    expect(adminInvoiceStatusKey('open')).toBe(
      'adminBilling.invoiceStatus.open',
    );
    expect(adminInvoiceStatusKey('paid')).toBe(
      'adminBilling.invoiceStatus.paid',
    );
    expect(adminInvoiceStatusKey('void')).toBe(
      'adminBilling.invoiceStatus.void',
    );
    expect(adminInvoiceStatusKey('draft')).toBeNull();
    expect(adminInvoiceStatusKey(null)).toBeNull();
  });

  it('labels each method and calls anything else Other', () => {
    expect(adminPaymentMethodKey('safepay')).toBe(
      'adminBilling.method.safepay',
    );
    expect(adminPaymentMethodKey('bank_transfer')).toBe(
      'adminBilling.method.bankTransfer',
    );
    expect(adminPaymentMethodKey('cash')).toBe('adminBilling.method.cash');
    expect(adminPaymentMethodKey('admin_grant')).toBe(
      'adminBilling.method.adminGrant',
    );
    expect(adminPaymentMethodKey('cheque')).toBe('adminBilling.method.other');
    expect(adminPaymentMethodKey(null)).toBe('adminBilling.method.other');
  });

  it('labels each invoice kind and returns null for an unknown one', () => {
    expect(adminInvoiceKindKey('new')).toBe('adminBilling.kind.new');
    expect(adminInvoiceKindKey('renewal')).toBe('adminBilling.kind.renewal');
    expect(adminInvoiceKindKey('upgrade')).toBe('adminBilling.kind.upgrade');
    expect(adminInvoiceKindKey('downgrade')).toBeNull();
    expect(adminInvoiceKindKey(undefined)).toBeNull();
  });

  it('builds the hostel billing path from the id as given', () => {
    expect(adminHostelBillingPath('hOs3')).toBe('/admin/billing/hostels/hOs3');
  });

  it('lists the tab paths', () => {
    expect(ADMIN_BILLING_PATHS).toEqual({
      verification: '/admin/billing/verification',
      payments: '/admin/billing/payments',
      invoices: '/admin/billing/invoices',
      plans: '/admin/billing/plans',
    });
  });

  describe('adminPaymentNeedsRefund', () => {
    const MARKER =
      'Invoice HH-2026-000123 was voided. Charged at Safepay (trk_1); refund it from the Safepay dashboard';

    it('flags a failed payment carrying the full marker', () => {
      expect(
        adminPaymentNeedsRefund({
          status: status('failed'),
          failure_reason: MARKER,
        }),
      ).toBe(true);
    });

    it('flags a failed payment that only says Charged at Safepay', () => {
      expect(
        adminPaymentNeedsRefund({
          status: status('failed'),
          failure_reason: 'charged at safepay (trk_1)',
        }),
      ).toBe(true);
    });

    it('flags a failed payment that only asks for a dashboard refund', () => {
      expect(
        adminPaymentNeedsRefund({
          status: status('failed'),
          failure_reason: 'Refund it from the Safepay dashboard',
        }),
      ).toBe(true);
    });

    it('does not flag an ordinary failure', () => {
      expect(
        adminPaymentNeedsRefund({
          status: status('failed'),
          failure_reason:
            'Amount or currency does not match invoice HH-2026-000123',
        }),
      ).toBe(false);
      expect(
        adminPaymentNeedsRefund({
          status: status('failed'),
          failure_reason: null,
        }),
      ).toBe(false);
    });

    it('never flags a payment that is not failed, whatever its reason says', () => {
      for (const slug of ['pending', 'awaiting-verification', 'succeeded']) {
        expect(
          adminPaymentNeedsRefund({
            status: status(slug),
            failure_reason: MARKER,
          }),
        ).toBe(false);
      }
    });
  });

  describe('adminEventView', () => {
    const cases: [
      string,
      SubscriptionEvent,
      { key: string; params: Record<string, string>; date: string | null },
    ][] = [
      [
        'activated',
        event('activated', { plan: 'listing' }),
        {
          key: 'adminBilling.events.activated',
          params: { plan: 'Listing' },
          date: null,
        },
      ],
      [
        'activated without a plan',
        event('activated', {}),
        { key: 'adminBilling.events.activatedPlain', params: {}, date: null },
      ],
      [
        'granted',
        event('granted', { plan: 'boost' }),
        {
          key: 'adminBilling.events.granted',
          params: { plan: 'Listing + Boost' },
          date: null,
        },
      ],
      [
        'granted without data',
        event('granted', null),
        { key: 'adminBilling.events.grantedPlain', params: {}, date: null },
      ],
      [
        'renewed',
        event('renewed', {
          plan: 'listing',
          period_end: '2026-11-11T00:00:00Z',
        }),
        {
          key: 'adminBilling.events.renewed',
          params: { plan: 'Listing' },
          date: '2026-11-11T00:00:00Z',
        },
      ],
      [
        'renewed without a period end',
        event('renewed', { plan: 'listing' }),
        { key: 'adminBilling.events.renewedPlain', params: {}, date: null },
      ],
      [
        'upgraded',
        event('upgraded', { from: 'listing', to: 'boost' }),
        {
          key: 'adminBilling.events.upgraded',
          params: { from: 'Listing', to: 'Listing + Boost' },
          date: null,
        },
      ],
      [
        'upgraded without a from',
        event('upgraded', { to: 'boost' }),
        { key: 'adminBilling.events.upgradedPlain', params: {}, date: null },
      ],
      [
        'downgraded',
        event('downgraded', { from: 'boost', to: 'listing' }),
        {
          key: 'adminBilling.events.downgraded',
          params: { from: 'Listing + Boost', to: 'Listing' },
          date: null,
        },
      ],
      [
        'downgraded without a to',
        event('downgraded', { from: 'boost' }),
        { key: 'adminBilling.events.downgradedPlain', params: {}, date: null },
      ],
      [
        'downgrade_scheduled',
        event('downgrade_scheduled', {
          to: 'listing',
          at: '2026-11-11T00:00:00Z',
        }),
        {
          key: 'adminBilling.events.downgradeScheduled',
          params: { to: 'Listing' },
          date: '2026-11-11T00:00:00Z',
        },
      ],
      [
        'downgrade_scheduled without a date',
        event('downgrade_scheduled', { to: 'listing' }),
        {
          key: 'adminBilling.events.downgradeScheduledPlain',
          params: {},
          date: null,
        },
      ],
      [
        'cancel_scheduled',
        event('cancel_scheduled', { at: '2026-11-11T00:00:00Z' }),
        {
          key: 'adminBilling.events.cancelScheduled',
          params: {},
          date: '2026-11-11T00:00:00Z',
        },
      ],
      [
        'cancel_scheduled without a date',
        event('cancel_scheduled', {}),
        {
          key: 'adminBilling.events.cancelScheduledPlain',
          params: {},
          date: null,
        },
      ],
      [
        'downgrade_unscheduled',
        event('downgrade_unscheduled', {}),
        {
          key: 'adminBilling.events.downgradeUnscheduled',
          params: {},
          date: null,
        },
      ],
      [
        'cancel_unscheduled',
        event('cancel_unscheduled', {}),
        {
          key: 'adminBilling.events.cancelUnscheduled',
          params: {},
          date: null,
        },
      ],
      [
        'past_due',
        event('past_due', {}),
        { key: 'adminBilling.events.pastDue', params: {}, date: null },
      ],
      [
        'expired',
        event('expired', null),
        { key: 'adminBilling.events.expired', params: {}, date: null },
      ],
      [
        'canceled',
        event('canceled', {}),
        { key: 'adminBilling.events.canceled', params: {}, date: null },
      ],
      [
        'payment_failed',
        event('payment_failed', {
          payment_id: 4821,
          reason: 'Amount or currency does not match invoice HH-2026-000123',
        }),
        {
          key: 'adminBilling.events.paymentFailed',
          params: {
            reason: 'Amount or currency does not match invoice HH-2026-000123',
          },
          date: null,
        },
      ],
      [
        'payment_failed without a reason',
        event('payment_failed', { payment_id: 4821 }),
        {
          key: 'adminBilling.events.paymentFailedPlain',
          params: {},
          date: null,
        },
      ],
      [
        'currency_changed',
        event('currency_changed', { from: 'PKR', to: 'USD' }),
        {
          key: 'adminBilling.events.currencyChanged',
          params: { from: 'PKR', to: 'USD' },
          date: null,
        },
      ],
      [
        'currency_changed with a blank side',
        event('currency_changed', { from: 'PKR', to: ' ' }),
        {
          key: 'adminBilling.events.currencyChangedPlain',
          params: {},
          date: null,
        },
      ],
      [
        'currency_override_changed set',
        event('currency_override_changed', {
          from: null,
          to: 'USD',
          admin_id: 77,
          admin_name: 'Sara Khan',
        }),
        {
          key: 'adminBilling.events.currencyOverrideSet',
          params: { to: 'USD', admin: 'Sara Khan' },
          date: null,
        },
      ],
      [
        'currency_override_changed changed',
        event('currency_override_changed', {
          from: 'PKR',
          to: 'USD',
          admin_id: 77,
          admin_name: 'Sara Khan',
        }),
        {
          key: 'adminBilling.events.currencyOverrideChanged',
          params: { from: 'PKR', to: 'USD', admin: 'Sara Khan' },
          date: null,
        },
      ],
      [
        'currency_override_changed cleared',
        event('currency_override_changed', {
          from: 'USD',
          to: null,
          admin_id: 77,
          admin_name: 'Sara Khan',
        }),
        {
          key: 'adminBilling.events.currencyOverrideCleared',
          params: { admin: 'Sara Khan' },
          date: null,
        },
      ],
      [
        'currency_override_changed without an admin name',
        event('currency_override_changed', {
          from: 'PKR',
          to: 'USD',
          admin_id: 77,
        }),
        {
          key: 'adminBilling.events.currencyOverridePlain',
          params: {},
          date: null,
        },
      ],
      [
        'currency_override_changed with no data',
        event('currency_override_changed', null),
        {
          key: 'adminBilling.events.currencyOverridePlain',
          params: {},
          date: null,
        },
      ],
      [
        'an unknown kind',
        event('refunded', { amount: '5000.00' }),
        {
          key: 'adminBilling.events.other',
          params: { kind: 'refunded' },
          date: null,
        },
      ],
    ];

    it.each(cases)('labels %s', (_label, e, expected) => {
      const view = adminEventView(e, planName);

      expect({ key: view.key, params: view.params, date: view.date }).toEqual(
        expected,
      );
    });

    it('carries the id, kind, invoice number and created date through', () => {
      const view = adminEventView(
        event(
          'granted',
          { plan: 'listing' },
          {
            id: 'eVt9',
            invoice_number: 'HH-2026-000124',
            created_at: '2026-10-12T10:00:00Z',
          },
        ),
        planName,
      );

      expect(view).toEqual({
        id: 'eVt9',
        kind: 'granted',
        key: 'adminBilling.events.granted',
        params: { plan: 'Listing' },
        date: null,
        invoiceNumber: 'HH-2026-000124',
        createdAt: '2026-10-12T10:00:00Z',
      });
    });

    it('falls back to the plan code when no name is known', () => {
      const view = adminEventView(
        event('activated', { plan: 'legacy' }),
        planName,
      );

      expect(view.params).toEqual({ plan: 'legacy' });
    });

    it('treats a non-string plan code as missing', () => {
      const view = adminEventView(event('activated', { plan: 42 }), planName);

      expect(view.key).toBe('adminBilling.events.activatedPlain');
    });

    it('never puts the payment id anywhere in the view', () => {
      const view = adminEventView(
        event('payment_failed', { payment_id: 4821, reason: 'Card declined' }),
        planName,
      );

      expect(JSON.stringify(view)).not.toContain('4821');
      expect(Object.keys(view.params)).toEqual(['reason']);
    });
  });

  describe('adminEventsNewestFirst', () => {
    it('reverses the oldest-first list without touching the input', () => {
      const events = [
        event('activated', { plan: 'listing' }, { id: 'a' }),
        event(
          'renewed',
          { plan: 'listing', period_end: '2026-12-11T00:00:00Z' },
          { id: 'b' },
        ),
        event('canceled', {}, { id: 'c' }),
      ];
      const snapshot = structuredClone(events);

      const views = adminEventsNewestFirst(events, planName);

      expect(views.map((v) => v.id)).toEqual(['c', 'b', 'a']);
      expect(events).toEqual(snapshot);
      expect(events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    });

    it('returns an empty list for no events', () => {
      expect(adminEventsNewestFirst([], planName)).toEqual([]);
    });
  });
});
