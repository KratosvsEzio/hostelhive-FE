import type {
  BillingInvoice,
  BillingPayment,
  BillingPlan,
  BillingSubscription,
} from '@hostelhive/data-access';
import {
  invoiceKindKey,
  invoiceStatusTone,
  latestAttemptNotice,
  planButton,
  statusTone,
} from './billing-labels';

function plan(overrides: Partial<BillingPlan>): BillingPlan {
  return {
    id: 'GMfbpD',
    code: 'listing_boost',
    name: 'Listing + Boost',
    features: ['boost'],
    interval: 'month',
    currency: 'PKR',
    price: '8000.00',
    action: 'buy',
    amount_due_now: '8000.00',
    ...overrides,
  };
}

const SUBSCRIPTION: BillingSubscription = {
  id: 'sub1',
  status: { id: 1, name: 'Active', slug: 'active', color: null },
  currency: 'PKR',
  plan: { id: 'qTFruf', code: 'listing', name: 'Listing', features: [] },
  current_period_start: '2026-10-12T00:00:00+05:00',
  current_period_end: '2026-11-12T00:00:00+05:00',
  grace_until: null,
  scheduled_plan: null,
  cancel_at_period_end: false,
};

describe('statusTone', () => {
  it('tones the known statuses by slug', () => {
    expect(statusTone('active')).toBe('ok');
    expect(statusTone('past-due')).toBe('warn');
    expect(statusTone('expired')).toBe('danger');
  });

  it('leaves every other status neutral', () => {
    expect(statusTone('incomplete')).toBe('neutral');
    expect(statusTone('canceled')).toBe('neutral');
    expect(statusTone('suspended')).toBe('neutral');
    expect(statusTone(null)).toBe('neutral');
    expect(statusTone(undefined)).toBe('neutral');
  });
});

describe('invoiceKindKey', () => {
  it('names each invoice kind', () => {
    expect(invoiceKindKey('new')).toBe('hostBilling.kindNew');
    expect(invoiceKindKey('renewal')).toBe('hostBilling.kindRenewal');
    expect(invoiceKindKey('upgrade')).toBe('hostBilling.kindUpgrade');
  });

  // The caller then shows the period alone.
  it('has no label for a kind it does not know', () => {
    expect(invoiceKindKey('credit')).toBeNull();
    expect(invoiceKindKey(null)).toBeNull();
  });
});

/**
 * One button per plan, chosen only by the server's action. The amount travels as the server's
 * own string so the button can quote it, never one derived from the plan's prices.
 */
describe('invoiceStatusTone', () => {
  it('tones the known invoice statuses by slug', () => {
    expect(invoiceStatusTone('paid')).toBe('ok');
    expect(invoiceStatusTone('open')).toBe('warn');
    expect(invoiceStatusTone('void')).toBe('neutral');
  });

  it('leaves every other status neutral', () => {
    expect(invoiceStatusTone('refunded')).toBe('neutral');
    expect(invoiceStatusTone(null)).toBe('neutral');
    expect(invoiceStatusTone(undefined)).toBe('neutral');
  });
});

describe('latestAttemptNotice', () => {
  const CHARGED_REASON =
    'Invoice voided. Charged at Safepay (track_9); refund it from the Safepay dashboard';

  function payment(overrides: Partial<BillingPayment>): BillingPayment {
    return {
      id: 'pay1',
      status: { id: 1, name: 'Pending', slug: 'pending', color: null },
      payment_method: 'safepay',
      amount: '5000.00',
      currency: 'PKR',
      reference: null,
      gateway_reference: 'track_1',
      failure_reason: null,
      proof_url: null,
      verified_at: null,
      succeeded_at: null,
      created_at: '2026-10-11T00:00:00Z',
      invoice_id: 'inv1',
      ...overrides,
    };
  }

  const FAILED = { id: 4, name: 'Failed', slug: 'failed', color: null };
  const SUCCEEDED = { id: 3, name: 'Succeeded', slug: 'succeeded', color: null };

  function invoice(
    payments: BillingPayment[],
    slug = 'open',
  ): BillingInvoice {
    return {
      id: 'inv1',
      number: 'HH-0001',
      kind: 'new',
      currency: 'PKR',
      total: '5000.00',
      period_start: null,
      period_end: null,
      expires_at: null,
      paid_at: null,
      voided_at: null,
      created_at: '2026-10-11T00:00:00Z',
      invoice_pdf_url: null,
      plan: null,
      lines: [],
      status: { id: 1, name: slug, slug, color: null },
      payments,
    };
  }

  it('says nothing about an invoice nobody has tried to pay', () => {
    expect(latestAttemptNotice(invoice([]))).toBeNull();
  });

  it('says nothing once the invoice is no longer open', () => {
    const failed = [payment({ status: FAILED })];
    expect(latestAttemptNotice(invoice(failed, 'paid'))).toBeNull();
    expect(latestAttemptNotice(invoice(failed, 'void'))).toBeNull();
  });

  it('asks the payer to make contact when a payment was taken but not applied', () => {
    const notice = latestAttemptNotice(
      invoice([payment({ status: FAILED, failure_reason: CHARGED_REASON })]),
    );

    expect(notice).toEqual({
      key: 'hostPayment.chargedNotApplied',
      tone: 'danger',
      contactUs: true,
    });
  });

  it('matches the charged wording whatever its case', () => {
    const notice = latestAttemptNotice(
      invoice([
        payment({ status: FAILED, failure_reason: 'Expired. charged at safepay (t)' }),
      ]),
    );

    expect(notice?.key).toBe('hostPayment.chargedNotApplied');
  });

  it('reports a plain failed attempt', () => {
    const notice = latestAttemptNotice(
      invoice([
        payment({ status: FAILED, failure_reason: 'Safepay declined the payment' }),
      ]),
    );

    expect(notice).toEqual({
      key: 'hostPayment.lastAttemptFailed',
      tone: 'warn',
      contactUs: false,
    });
  });

  it('reports a failed attempt that gave no reason', () => {
    const notice = latestAttemptNotice(
      invoice([payment({ status: FAILED, failure_reason: null })]),
    );

    expect(notice?.key).toBe('hostPayment.lastAttemptFailed');
  });

  it('warns against paying twice while a Safepay attempt is pending', () => {
    expect(latestAttemptNotice(invoice([payment({})]))).toEqual({
      key: 'hostPayment.pendingNotice',
      tone: 'neutral',
      contactUs: false,
    });
  });

  it('says nothing about a pending attempt made some other way', () => {
    expect(
      latestAttemptNotice(
        invoice([payment({ payment_method: 'bank_transfer' })]),
      ),
    ).toBeNull();
  });

  it('says nothing for any other attempt status', () => {
    expect(
      latestAttemptNotice(invoice([payment({ status: SUCCEEDED })])),
    ).toBeNull();
  });

  // An earlier failure is history once the payer has tried again.
  it('looks at the latest attempt only', () => {
    const notice = latestAttemptNotice(
      invoice([
        payment({ id: 'pay1', status: FAILED, failure_reason: CHARGED_REASON }),
        payment({ id: 'pay2' }),
      ]),
    );

    expect(notice?.key).toBe('hostPayment.pendingNotice');
  });
});

describe('planButton', () => {
  it('buy: an enabled Choose plan that starts checkout', () => {
    expect(planButton(plan({ action: 'buy' }), null)).toEqual({
      key: 'hostBilling.choosePlan',
      disabled: false,
      kind: 'checkout',
    });
  });

  // The current plan's amount_due_now is its renewal price, which the card must not quote.
  it('current: a disabled Current plan that quotes no amount', () => {
    expect(planButton(plan({ action: 'current' }), SUBSCRIPTION)).toEqual({
      key: 'hostBilling.currentPlanButton',
      disabled: true,
      kind: 'checkout',
    });
  });

  it('renew: an enabled Renew with a Pay-now sub-line carrying amount_due_now', () => {
    expect(
      planButton(
        plan({ action: 'renew', amount_due_now: '8000.00' }),
        SUBSCRIPTION,
      ),
    ).toEqual({
      key: 'hostBilling.renew',
      disabled: false,
      kind: 'checkout',
      amount: '8000.00',
      sublineKey: 'hostBilling.payNow',
    });
  });

  it('renew without an amount: Renew alone, no Pay-now line', () => {
    expect(
      planButton(plan({ action: 'renew', amount_due_now: null }), SUBSCRIPTION),
    ).toEqual({
      key: 'hostBilling.renew',
      disabled: false,
      kind: 'checkout',
    });
  });

  it('upgrade: quotes amount_due_now as given and adds the renews-at line', () => {
    expect(
      planButton(
        plan({
          action: 'upgrade',
          amount_due_now: '3000.00',
          price: '8000.00',
        }),
        SUBSCRIPTION,
      ),
    ).toEqual({
      key: 'hostBilling.upgradePayNow',
      disabled: false,
      kind: 'checkout',
      amount: '3000.00',
      sublineKey: 'hostBilling.renewsAtOn',
    });
  });

  // A zero proration is possible at the very end of a period; it is shown, not hidden.
  it('upgrade: keeps a zero amount exactly as returned', () => {
    expect(
      planButton(
        plan({ action: 'upgrade', amount_due_now: '0.00' }),
        SUBSCRIPTION,
      ).amount,
    ).toBe('0.00');
  });

  it('upgrade: drops the renews-at line when there is no renewal date to quote', () => {
    const noDate = { ...SUBSCRIPTION, current_period_end: null };
    const button = planButton(
      plan({ action: 'upgrade', amount_due_now: '3000.00' }),
      noDate,
    );

    expect(button.key).toBe('hostBilling.upgradePayNow');
    expect(button.sublineKey).toBeUndefined();
  });

  it('downgrade not yet scheduled: a disabled Switch at renewal with the coming-soon hint', () => {
    expect(
      planButton(
        plan({ action: 'downgrade', amount_due_now: null, scheduled: false }),
        SUBSCRIPTION,
      ),
    ).toEqual({
      key: 'hostBilling.switchAtRenewal',
      disabled: true,
      kind: 'downgrade',
      hintKey: 'hostBilling.switchComingSoon',
    });
  });

  it('downgrade already scheduled: disabled, with the Scheduled for renewal badge', () => {
    expect(
      planButton(
        plan({ action: 'downgrade', amount_due_now: null, scheduled: true }),
        SUBSCRIPTION,
      ),
    ).toEqual({
      key: 'hostBilling.switchAtRenewal',
      disabled: true,
      kind: 'downgrade',
      badgeKey: 'hostBilling.scheduledForRenewal',
    });
  });

  it('unavailable: a disabled Unavailable; the caller shows the reason as returned', () => {
    expect(
      planButton(
        plan({
          action: 'unavailable',
          amount_due_now: null,
          reason: 'This plan is not available in USD',
        }),
        null,
      ),
    ).toEqual({
      key: 'hostBilling.unavailable',
      disabled: true,
      kind: 'checkout',
    });
  });

  it('an action this app does not know: no button at all', () => {
    expect(planButton(plan({ action: 'pause' }), SUBSCRIPTION)).toEqual({
      key: '',
      disabled: true,
      kind: 'none',
    });
  });
});
