import type {
  BillingInvoice,
  BillingPayment,
  BillingPlan,
  BillingSubscription,
} from '@hostelhive/data-access';
import {
  billingAttemptNote,
  billingHistoryPath,
  billingInvoiceCharged,
  billingInvoiceKindLabelKey,
  billingInvoicePath,
  billingInvoiceStatusKey,
  billingPaymentCharged,
  billingPaymentMethodKey,
  billingPaymentStatusKey,
  billingPaymentStatusTone,
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

describe('billingInvoiceStatusKey', () => {
  it.each([
    ['open', 'hostBillingHistory.statusOpen'],
    ['paid', 'hostBillingHistory.statusPaid'],
    ['void', 'hostBillingHistory.statusVoid'],
  ])('%s → %s', (slug, key) => {
    expect(billingInvoiceStatusKey(slug)).toBe(key);
  });

  it.each(['refunded', '', null, undefined])(
    'an unknown status %j has no key, so the caller shows status.name',
    (slug) => {
      expect(billingInvoiceStatusKey(slug)).toBeNull();
    },
  );
});

describe('billingInvoiceKindLabelKey', () => {
  it.each([
    ['new', 'hostBillingHistory.kindNew'],
    ['renewal', 'hostBillingHistory.kindRenewal'],
    ['upgrade', 'hostBillingHistory.kindUpgrade'],
  ])('%s → %s', (kind, key) => {
    expect(billingInvoiceKindLabelKey(kind)).toBe(key);
  });

  it.each(['downgrade', '', null, undefined])(
    'an unknown kind %j has no key, so the caller shows a dash',
    (kind) => {
      expect(billingInvoiceKindLabelKey(kind)).toBeNull();
    },
  );
});

describe('billingPaymentStatusTone', () => {
  it.each([
    ['succeeded', 'ok'],
    ['failed', 'danger'],
    ['pending', 'warn'],
    ['awaiting-verification', 'warn'],
    ['refunded', 'neutral'],
    [null, 'neutral'],
    [undefined, 'neutral'],
  ])('%j → %s', (slug, tone) => {
    expect(billingPaymentStatusTone(slug)).toBe(tone);
  });
});

describe('billingPaymentStatusKey', () => {
  it.each([
    ['pending', 'hostBillingHistory.paymentPending'],
    ['awaiting-verification', 'hostBillingHistory.paymentReview'],
    ['succeeded', 'hostBillingHistory.paymentSucceeded'],
    ['failed', 'hostBillingHistory.paymentFailed'],
  ])('%s → %s', (slug, key) => {
    expect(billingPaymentStatusKey(slug)).toBe(key);
  });

  it.each(['refunded', '', null, undefined])(
    'an unknown status %j has no key, so the caller shows status.name',
    (slug) => {
      expect(billingPaymentStatusKey(slug)).toBeNull();
    },
  );
});

describe('billingPaymentMethodKey', () => {
  it.each([
    ['safepay', 'hostBillingHistory.methodSafepay'],
    ['bank_transfer', 'hostBillingHistory.methodBankTransfer'],
    ['cash', 'hostBillingHistory.methodCash'],
    ['admin_grant', 'hostBillingHistory.methodAdminGrant'],
  ])('%s → %s', (method, key) => {
    expect(billingPaymentMethodKey(method)).toBe(key);
  });

  it.each(['jazzcash', '', null, undefined])(
    'an unknown method %j reads Other, never the raw value',
    (method) => {
      expect(billingPaymentMethodKey(method)).toBe(
        'hostBillingHistory.methodOther',
      );
    },
  );
});

describe('charged attempts and attempt notes', () => {
  const CHARGED_REASON =
    'Invoice voided. Charged at Safepay (track_9); refund it from the Safepay dashboard';
  const PLAIN_REASON = 'Safepay declined the payment';

  function attempt(
    slug: string,
    failure_reason: string | null = null,
  ): Pick<BillingPayment, 'status' | 'failure_reason'> {
    return {
      status: { id: 1, name: slug, slug, color: null },
      failure_reason,
    };
  }

  describe('billingPaymentCharged', () => {
    it('is true for a failed attempt the backend marked as charged at Safepay', () => {
      expect(billingPaymentCharged(attempt('failed', CHARGED_REASON))).toBe(
        true,
      );
    });

    it('is false for a failed attempt with any other reason, or none', () => {
      expect(billingPaymentCharged(attempt('failed', PLAIN_REASON))).toBe(false);
      expect(billingPaymentCharged(attempt('failed', null))).toBe(false);
    });

    it('is false for an attempt that did not fail, whatever its reason says', () => {
      expect(billingPaymentCharged(attempt('succeeded', CHARGED_REASON))).toBe(
        false,
      );
      expect(billingPaymentCharged(attempt('pending', CHARGED_REASON))).toBe(
        false,
      );
    });
  });

  describe('billingInvoiceCharged', () => {
    it('is true when any attempt was charged but not applied', () => {
      expect(
        billingInvoiceCharged({
          payments: [
            attempt('failed', CHARGED_REASON),
            attempt('succeeded'),
          ] as BillingPayment[],
        }),
      ).toBe(true);
    });

    it('is false when no attempt was charged, or there are none', () => {
      expect(
        billingInvoiceCharged({
          payments: [
            attempt('failed', PLAIN_REASON),
            attempt('pending'),
          ] as BillingPayment[],
        }),
      ).toBe(false);
      expect(billingInvoiceCharged({ payments: [] })).toBe(false);
    });
  });

  describe('billingAttemptNote', () => {
    it('a charged attempt: the charged-not-applied note, danger, with Contact us', () => {
      expect(billingAttemptNote(attempt('failed', CHARGED_REASON))).toEqual({
        key: 'hostPayment.chargedNotApplied',
        tone: 'danger',
        contactUs: true,
      });
    });

    it('any other failed attempt: our own failed note, neutral, no Contact us', () => {
      expect(billingAttemptNote(attempt('failed', PLAIN_REASON))).toEqual({
        key: 'hostBillingHistory.attemptFailed',
        tone: 'neutral',
        contactUs: false,
      });
      expect(billingAttemptNote(attempt('failed', null))).toEqual({
        key: 'hostBillingHistory.attemptFailed',
        tone: 'neutral',
        contactUs: false,
      });
    });

    it.each(['pending', 'awaiting-verification', 'succeeded', 'refunded'])(
      'a %s attempt has no note',
      (slug) => {
        expect(billingAttemptNote(attempt(slug, PLAIN_REASON))).toBeNull();
      },
    );

    it('never carries the failure reason text', () => {
      for (const reason of [CHARGED_REASON, PLAIN_REASON]) {
        const note = JSON.stringify(billingAttemptNote(attempt('failed', reason)));
        expect(note).not.toContain(reason);
        expect(note).not.toContain('track_9');
        expect(note).not.toContain('Safepay');
      }
    });
  });
});

describe('billing history paths', () => {
  it('billingHistoryPath points at the subscription invoices list, not the renter bills', () => {
    expect(billingHistoryPath('nHelLt')).toBe(
      '/host/nHelLt/subscription/invoices',
    );
  });

  it('billingInvoicePath points at one invoice under it, ids as given', () => {
    expect(billingInvoicePath('nHelLt', 'inv1')).toBe(
      '/host/nHelLt/subscription/invoices/inv1',
    );
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

  it('upgrade while cancelling: no renews-at line, because the plan will not renew', () => {
    const cancelling = { ...SUBSCRIPTION, cancel_at_period_end: true };

    expect(
      planButton(
        plan({
          action: 'upgrade',
          amount_due_now: '3000.00',
          price: '8000.00',
        }),
        cancelling,
      ),
    ).toEqual({
      key: 'hostBilling.upgradePayNow',
      disabled: false,
      kind: 'checkout',
      amount: '3000.00',
    });
  });

  it('downgrade not yet scheduled: an enabled Switch at renewal with no hint', () => {
    expect(
      planButton(
        plan({ action: 'downgrade', amount_due_now: null, scheduled: false }),
        SUBSCRIPTION,
      ),
    ).toEqual({
      key: 'hostBilling.switchAtRenewal',
      disabled: false,
      kind: 'downgrade',
    });
  });

  it('downgrade already scheduled: a disabled Scheduled of its own kind', () => {
    expect(
      planButton(
        plan({ action: 'downgrade', amount_due_now: null, scheduled: true }),
        SUBSCRIPTION,
      ),
    ).toEqual({
      key: 'hostBilling.scheduled',
      disabled: true,
      kind: 'scheduled',
    });
  });

  // Cancel wins at period end, so even the scheduled plan reads as an ordinary blocked downgrade.
  it.each([false, true])(
    'downgrade while cancelling (scheduled: %s): disabled, with the resume-to-switch hint',
    (scheduled) => {
      const cancelling = { ...SUBSCRIPTION, cancel_at_period_end: true };

      expect(
        planButton(
          plan({ action: 'downgrade', amount_due_now: null, scheduled }),
          cancelling,
        ),
      ).toEqual({
        key: 'hostBilling.switchAtRenewal',
        disabled: true,
        kind: 'downgrade',
        hintKey: 'hostBilling.resumeToSwitch',
      });
    },
  );

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
