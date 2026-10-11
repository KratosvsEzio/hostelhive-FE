import type { BillingPlan, BillingSubscription } from '@hostelhive/data-access';
import { invoiceKindKey, planButton, statusTone } from './billing-labels';

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
