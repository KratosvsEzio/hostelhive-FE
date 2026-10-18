import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';
import { Router, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import type {
  ApiError,
  BillingPlan,
  BillingSubscription,
  HostBilling,
  SavedCard,
} from '@hostelhive/data-access';
import { BillingApi, HostBillingStore } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import {
  BILLING_RETURN_MODE,
  BillingReturn,
  ReturnMode,
  canceledReturnView,
  cardLanded,
  returnIntent,
  settledReturnView,
} from './billing-return';
import { ReturnStash, SafepayCheckout } from './safepay-checkout';

const OLD_CARD: SavedCard = {
  label: 'Visa •••• 4242',
  expires_on: '2027-01-31',
};
const NEW_CARD: SavedCard = {
  label: 'Visa •••• 1111',
  expires_on: '2029-12-31',
};

function sub(over: Partial<BillingSubscription> = {}): BillingSubscription {
  return {
    id: 'sub1',
    status: { id: 1, name: 'Active', slug: 'active', color: null },
    currency: 'PKR',
    plan: { id: 'p1', code: 'growth', name: 'Growth', features: [] },
    current_period_start: '2026-10-18T00:00:00.000+05:00',
    current_period_end: '2026-11-01T00:00:00.000+05:00',
    grace_until: null,
    scheduled_plan: null,
    cancel_at_period_end: false,
    billed_by: 'invoice',
    safepay_status: null,
    ...over,
  };
}

const SAFEPAY_LIVE = sub({ billed_by: 'safepay_subscription' });
const SAFEPAY_TRIAL = sub({
  billed_by: 'safepay_subscription',
  safepay_status: 'TRAILING',
});
// Linked to Safepay, but the webhook has not made the plan live yet.
const SAFEPAY_LINKED = sub({
  billed_by: 'safepay_subscription',
  status: { id: 2, name: 'Pending', slug: 'pending', color: null },
});

function plan(id: string, trial_days: number | null): BillingPlan {
  return { id, trial_days, action: 'buy' } as BillingPlan;
}

function billing(over: Partial<HostBilling> = {}): HostBilling {
  return {
    currency: 'PKR',
    country_code: 'PK',
    payment_methods: ['safepay'],
    auto_renew: false,
    saved_card: null,
    subscription: sub(),
    features: [],
    open_invoice: null,
    plans: [],
    ...over,
  };
}

function apiError(status: number, serverMessages?: string[]): ApiError {
  return { status, code: 'x', message: '', serverMessages };
}

const params = (query: Record<string, string>) => convertToParamMap(query);

describe('returnIntent', () => {
  it.each<[ReturnMode, Record<string, string>, unknown]>([
    ['success', { card: 'saved' }, { subject: 'card', outcome: 'saved' }],
    [
      'success',
      { card: 'saved?tracker=track_1' },
      { subject: 'card', outcome: 'saved' },
    ],
    [
      'success',
      { subscription: 'started' },
      { subject: 'subscription', outcome: 'started' },
    ],
    ['cancel', { card: 'canceled' }, { subject: 'card', outcome: 'canceled' }],
    [
      'cancel',
      { subscription: 'canceled?tracker=track_1' },
      { subject: 'subscription', outcome: 'canceled' },
    ],
    ['success', { card: 'foo' }, null],
    ['success', { card: '' }, null],
    ['success', { card: 'canceled' }, null],
    ['success', { subscription: 'saved' }, null],
    ['cancel', { card: 'saved' }, null],
    ['cancel', { subscription: 'started' }, null],
    ['success', {}, null],
  ])('reads %s %o as %o', (mode, query, intent) => {
    expect(returnIntent(mode, params(query))).toEqual(intent);
  });
});

describe('cardLanded', () => {
  it('needs a card', () => {
    expect(cardLanded(null, null)).toBe(false);
    expect(cardLanded(null, OLD_CARD)).toBe(false);
  });

  it('takes any card when there was none before, or no stash said', () => {
    expect(cardLanded(OLD_CARD, null)).toBe(true);
  });

  it('waits while the card on file is still the one from before', () => {
    expect(cardLanded({ ...OLD_CARD }, OLD_CARD)).toBe(false);
  });

  it('takes a replacement that differs in label or in expiry', () => {
    expect(cardLanded(NEW_CARD, OLD_CARD)).toBe(true);
    expect(
      cardLanded({ ...OLD_CARD, expires_on: '2030-01-31' }, OLD_CARD),
    ).toBe(true);
    expect(
      cardLanded({ ...OLD_CARD, label: 'Mastercard •••• 4242' }, OLD_CARD),
    ).toBe(true);
  });
});

describe('settledReturnView', () => {
  const cardStash: ReturnStash = {
    kind: 'card',
    hostelId: 'h1',
    previous: OLD_CARD,
  };

  it('settles a subscription only once it is live and billed by Safepay', () => {
    for (const subscription of [sub(), SAFEPAY_LINKED, null]) {
      expect(
        settledReturnView(
          { value: billing({ subscription }) },
          'subscription',
          null,
        ),
      ).toBeNull();
    }
    expect(
      settledReturnView(
        { value: billing({ subscription: SAFEPAY_LIVE }) },
        'subscription',
        null,
      ),
    ).toEqual({ kind: 'subscribed', plan: 'Growth', trialEnds: null });
  });

  it('carries the trial end during a free trial', () => {
    expect(
      settledReturnView(
        { value: billing({ subscription: SAFEPAY_TRIAL }) },
        'subscription',
        null,
      ),
    ).toEqual({
      kind: 'subscribed',
      plan: 'Growth',
      trialEnds: '2026-11-01T00:00:00.000+05:00',
    });
  });

  it('ignores a card stash left for another kind of return', () => {
    const other: ReturnStash = {
      kind: 'subscription',
      hostelId: 'h1',
      planId: 'p1',
    };
    expect(
      settledReturnView(
        { value: billing({ saved_card: OLD_CARD }) },
        'card',
        other,
      ),
    ).toEqual(expect.objectContaining({ kind: 'cardSaved' }));
  });

  it('waits on the card stashed before leaving', () => {
    expect(
      settledReturnView(
        { value: billing({ saved_card: OLD_CARD }) },
        'card',
        cardStash,
      ),
    ).toBeNull();
  });

  it('stops on a refusal and keeps polling through other errors', () => {
    expect(settledReturnView({ error: apiError(403) }, 'card', null)).toEqual({
      kind: 'forbidden',
    });
    expect(
      settledReturnView({ error: apiError(500) }, 'card', null),
    ).toBeNull();
    expect(
      settledReturnView({ error: apiError(0) }, 'subscription', null),
    ).toBeNull();
  });
});

describe('canceledReturnView', () => {
  it('says whether a card is still on file', () => {
    expect(
      canceledReturnView(billing({ saved_card: OLD_CARD }), 'card', null),
    ).toEqual({
      kind: 'cardCanceled',
      cardKept: true,
    });
    expect(canceledReturnView(billing(), 'card', null)).toEqual({
      kind: 'cardCanceled',
      cardKept: false,
    });
  });

  it('offers the trial again only when the stashed plan still has one', () => {
    const stash: ReturnStash = {
      kind: 'subscription',
      hostelId: 'h1',
      planId: 'p2',
    };
    const plans = [plan('p1', null), plan('p2', 14)];

    expect(
      canceledReturnView(billing({ plans }), 'subscription', stash),
    ).toEqual({
      kind: 'subscriptionCanceled',
      trialAvailable: true,
    });
    expect(
      canceledReturnView(
        billing({ plans: [plan('p2', null)] }),
        'subscription',
        stash,
      ),
    ).toEqual({ kind: 'subscriptionCanceled', trialAvailable: false });
    expect(
      canceledReturnView(billing({ plans }), 'subscription', null),
    ).toEqual({
      kind: 'subscriptionCanceled',
      trialAvailable: false,
    });
  });

  it('shows the success when the subscription went live anyway', () => {
    expect(
      canceledReturnView(
        billing({ subscription: SAFEPAY_LIVE }),
        'subscription',
        null,
      ),
    ).toEqual({ kind: 'subscribed', plan: 'Growth', trialEnds: null });
  });
});

describe('BillingReturn', () => {
  let fixture: ComponentFixture<BillingReturn>;
  let fetch: Mock<(hostelId: string) => Observable<HostBilling>>;
  let accept: Mock<(hostelId: string, billing: HostBilling) => void>;
  let checkout: {
    returnStash: Mock<() => ReturnStash | null>;
    returnHostelFor: Mock<(kind: string) => string | null>;
    clearReturn: Mock<() => void>;
    startCardSave: Mock<
      (
        hostelId: string,
        previous: SavedCard | null,
        invoiceId?: string,
      ) => Observable<void>
    >;
    restored$: Subject<void>;
  };

  interface Opening {
    stash?: ReturnStash | null;
    hostel?: string | null;
    /** Billing reads in order; the last repeats. An `ApiError` fails that read. */
    reads?: (HostBilling | ApiError)[];
  }

  async function open(
    url: string,
    mode: ReturnMode,
    { stash = null, hostel = 'h1', reads = [billing()] }: Opening = {},
  ): Promise<HTMLElement> {
    const answer = (r: HostBilling | ApiError) =>
      'status' in r && typeof r.status === 'number'
        ? throwError(() => r)
        : of(r as HostBilling);
    fetch = vi.fn<(hostelId: string) => Observable<HostBilling>>();
    reads.forEach((r) => fetch.mockImplementationOnce(() => answer(r)));
    fetch.mockImplementation(() => answer(reads[reads.length - 1]));
    accept = vi.fn<(hostelId: string, billing: HostBilling) => void>();
    checkout = {
      returnStash: vi.fn<() => ReturnStash | null>(() => stash),
      returnHostelFor: vi.fn<(kind: string) => string | null>(() => hostel),
      clearReturn: vi.fn<() => void>(),
      startCardSave: vi.fn<
        (
          hostelId: string,
          previous: SavedCard | null,
          invoiceId?: string,
        ) => Observable<void>
      >(() => new Subject<void>()),
      restored$: new Subject<void>(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        provideI18nTesting(),
        { provide: BillingApi, useValue: { billing: fetch } },
        { provide: SafepayCheckout, useValue: checkout },
        { provide: HostBillingStore, useValue: { accept } },
        { provide: BILLING_RETURN_MODE, useValue: mode },
      ],
    });
    // The page reads its query from the root route, which a real navigation fills in.
    await TestBed.inject(Router).navigateByUrl(url);
    vi.useFakeTimers();
    fixture = TestBed.createComponent(BillingReturn);
    return fixture.nativeElement as HTMLElement;
  }

  function settle(ms = 0): void {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  const text = (el: HTMLElement) => el.textContent ?? '';
  const action = (el: HTMLElement, name: string) =>
    el.querySelector<HTMLElement>(`[data-action="${name}"]`);
  const live = (el: HTMLElement) =>
    el.querySelector('[role="status"][aria-live="polite"]')?.textContent ?? '';

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('?card=saved', () => {
    const stash: ReturnStash = {
      kind: 'card',
      hostelId: 'h1',
      previous: OLD_CARD,
    };

    it('confirms politely, then shows the new card once it replaces the old one', async () => {
      const el = await open('/billing/payment/success?card=saved', 'success', {
        stash,
        reads: [
          billing({ saved_card: OLD_CARD }),
          billing({ saved_card: NEW_CARD }),
        ],
      });
      settle(0);

      expect(checkout.returnHostelFor).toHaveBeenCalledWith('card');
      expect(fetch).toHaveBeenCalledWith('h1');
      expect(live(el)).toContain('hostPayment.cardConfirmingTitle');
      expect(live(el)).toContain('hostPayment.confirmingMessage');
      expect(action(el, 'go-to-billing')).toBeNull();
      expect(checkout.clearReturn).not.toHaveBeenCalled();

      settle(2500);

      expect(live(el)).toContain('hostPayment.cardSavedTitle');
      expect(live(el)).toContain('hostPayment.cardSavedMessage');
      expect(checkout.clearReturn).toHaveBeenCalledTimes(1);
      expect(accept).toHaveBeenCalledTimes(2);
      expect(accept).toHaveBeenLastCalledWith(
        'h1',
        billing({ saved_card: NEW_CARD }),
      );
      expect(action(el, 'go-to-billing')?.getAttribute('href')).toBe(
        '/en/host/h1/subscription',
      );

      settle(30_000);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('reads the outcome through Safepay tracker suffix', async () => {
      const el = await open(
        '/billing/payment/success?card=saved?tracker=track_1',
        'success',
        { reads: [billing({ saved_card: NEW_CARD })] },
      );
      settle(0);

      expect(live(el)).toContain('hostPayment.cardSavedTitle');
    });

    it('takes any card as the saved one when no stash says what was there', async () => {
      const el = await open('/billing/payment/success?card=saved', 'success', {
        reads: [billing({ saved_card: OLD_CARD })],
      });
      settle(0);

      expect(live(el)).toContain('hostPayment.cardSavedTitle');
    });

    it('says the card will not renew a plan that is set to end', async () => {
      const el = await open('/billing/payment/success?card=saved', 'success', {
        reads: [
          billing({
            saved_card: NEW_CARD,
            subscription: sub({ cancel_at_period_end: true }),
          }),
        ],
      });
      settle(0);

      expect(live(el)).toContain('hostPayment.cardSavedCancellingMessage');
      expect(live(el)).not.toContain('hostPayment.cardSavedMessage');
    });

    it('offers to pay the invoice the card was saved from while it is still open', async () => {
      const open_invoice = {
        id: 'inv7',
        number: 'HH-2026-0007',
      } as HostBilling['open_invoice'];
      const el = await open('/billing/payment/success?card=saved', 'success', {
        stash: { ...stash, invoiceId: 'inv7' },
        reads: [billing({ saved_card: NEW_CARD, open_invoice })],
      });
      settle(0);

      const pay = action(el, 'pay-invoice');
      expect(pay?.getAttribute('href')).toBe(
        '/en/host/h1/subscription/pay/inv7',
      );
      expect(pay?.textContent).toContain('hostPayment.payInvoice');
      expect(action(el, 'go-to-billing')).not.toBeNull();
    });

    it('offers no invoice once it is no longer the open one', async () => {
      const el = await open('/billing/payment/success?card=saved', 'success', {
        stash: { ...stash, invoiceId: 'inv7' },
        reads: [
          billing({
            saved_card: NEW_CARD,
            open_invoice: {
              id: 'inv8',
              number: 'HH-2026-0008',
            } as HostBilling['open_invoice'],
          }),
        ],
      });
      settle(0);

      expect(action(el, 'pay-invoice')).toBeNull();
    });

    it('owns up after a minute and checks again on request', async () => {
      const el = await open('/billing/payment/success?card=saved', 'success', {
        stash,
        reads: [billing({ saved_card: OLD_CARD })],
      });
      settle(0);
      settle(60_000);

      expect(live(el)).toContain('hostPayment.safepayWaitingTitle');
      expect(live(el)).toContain('hostPayment.cardSlowMessage');
      expect(action(el, 'back-to-billing')?.getAttribute('href')).toBe(
        '/en/host/h1/subscription',
      );
      expect(checkout.clearReturn).not.toHaveBeenCalled();

      const calls = fetch.mock.calls.length;
      settle(10_000);
      expect(fetch).toHaveBeenCalledTimes(calls);

      fetch.mockImplementation(() => of(billing({ saved_card: NEW_CARD })));
      action(el, 'check-again')?.click();
      settle(0);

      expect(live(el)).toContain('hostPayment.cardSavedTitle');
      expect(checkout.clearReturn).toHaveBeenCalledTimes(1);
    });

    it('adds the connection hint when the last check never reached the server', async () => {
      const el = await open('/billing/payment/success?card=saved', 'success', {
        reads: [apiError(0)],
      });
      settle(0);
      settle(60_000);

      expect(live(el)).toContain('hostPayment.cardSlowMessage');
      expect(el.querySelector('[data-field="network-hint"]')).not.toBeNull();
    });

    it('shows an error with a retry when the last check failed on the server', async () => {
      const el = await open('/billing/payment/success?card=saved', 'success', {
        reads: [apiError(500)],
      });
      settle(0);
      settle(60_000);

      expect(text(el)).toContain('hostBilling.loadError');
      expect(checkout.clearReturn).not.toHaveBeenCalled();
    });

    it('stops at once on a refusal, keeping the stash', async () => {
      const el = await open('/billing/payment/success?card=saved', 'success', {
        reads: [apiError(403)],
      });
      settle(0);

      expect(live(el)).toContain('hostBilling.noAccessTitle');
      settle(10_000);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(checkout.clearReturn).not.toHaveBeenCalled();
    });

    it('stops polling when the page goes away', async () => {
      await open('/billing/payment/success?card=saved', 'success', {
        stash,
        reads: [billing({ saved_card: OLD_CARD })],
      });
      settle(0);
      fixture.destroy();
      const calls = fetch.mock.calls.length;
      vi.advanceTimersByTime(30_000);

      expect(fetch).toHaveBeenCalledTimes(calls);
    });

    it('checks again when the page comes back from the back-forward cache', async () => {
      const el = await open('/billing/payment/success?card=saved', 'success', {
        stash,
        reads: [billing({ saved_card: OLD_CARD })],
      });
      settle(0);
      settle(60_000);
      expect(live(el)).toContain('hostPayment.cardSlowMessage');

      fetch.mockImplementation(() => of(billing({ saved_card: NEW_CARD })));
      checkout.restored$.next();
      settle(0);

      expect(live(el)).toContain('hostPayment.cardSavedTitle');
    });
  });

  describe('?subscription=started', () => {
    it('keeps polling while the plan is linked but not live, then says it is subscribed', async () => {
      const el = await open(
        '/billing/payment/success?subscription=started',
        'success',
        {
          reads: [
            billing({ subscription: sub() }),
            billing({ subscription: SAFEPAY_LINKED }),
            billing({ subscription: SAFEPAY_LIVE }),
          ],
        },
      );
      settle(0);

      expect(checkout.returnHostelFor).toHaveBeenCalledWith('subscription');
      expect(live(el)).toContain('hostPayment.subscriptionConfirmingTitle');

      settle(2500);
      expect(live(el)).toContain('hostPayment.subscriptionConfirmingTitle');
      expect(checkout.clearReturn).not.toHaveBeenCalled();

      settle(2500);
      expect(live(el)).toContain('hostPayment.subscribedTitle');
      expect(live(el)).toContain('hostPayment.subscribedMessage');
      expect(checkout.clearReturn).toHaveBeenCalledTimes(1);
      expect(accept).toHaveBeenCalledTimes(3);
    });

    it('announces a free trial', async () => {
      const el = await open(
        '/billing/payment/success?subscription=started',
        'success',
        {
          reads: [billing({ subscription: SAFEPAY_TRIAL })],
        },
      );
      settle(0);

      expect(live(el)).toContain('hostPayment.trialStartedTitle');
      expect(live(el)).toContain('hostPayment.trialStartedMessage');
      expect(live(el)).not.toContain('hostPayment.subscribedTitle');
    });

    it('tells the host not to subscribe again when Safepay is slow', async () => {
      const el = await open(
        '/billing/payment/success?subscription=started',
        'success',
        {
          reads: [billing({ subscription: SAFEPAY_LINKED })],
        },
      );
      settle(0);
      settle(60_000);

      expect(live(el)).toContain('hostPayment.safepayWaitingTitle');
      expect(live(el)).toContain('hostPayment.subscriptionSlowMessage');
      expect(action(el, 'check-again')).not.toBeNull();
      expect(checkout.clearReturn).not.toHaveBeenCalled();
    });
  });

  describe('?card=canceled', () => {
    it('reads billing once and says nothing changed, the current card included', async () => {
      const el = await open('/billing/payment/cancel?card=canceled', 'cancel', {
        reads: [billing({ saved_card: OLD_CARD })],
      });
      settle(0);
      settle(30_000);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(live(el)).toContain('hostPayment.cardCanceledTitle');
      expect(live(el)).toContain('hostPayment.canceledMessage');
      expect(el.querySelector('[data-field="card-kept"]')).not.toBeNull();
      expect(action(el, 'back-to-billing')?.getAttribute('href')).toBe(
        '/en/host/h1/subscription',
      );
      expect(checkout.clearReturn).toHaveBeenCalledTimes(1);
    });

    it('mentions no card when there is none', async () => {
      const el = await open('/billing/payment/cancel?card=canceled', 'cancel');
      settle(0);

      expect(el.querySelector('[data-field="card-kept"]')).toBeNull();
    });

    it('tries again with the card on file and the invoice it came from', async () => {
      const el = await open('/billing/payment/cancel?card=canceled', 'cancel', {
        stash: {
          kind: 'card',
          hostelId: 'h1',
          previous: null,
          invoiceId: 'inv7',
        },
        reads: [billing({ saved_card: OLD_CARD })],
      });
      settle(0);

      action(el, 'try-again')?.click();
      settle(0);

      expect(checkout.startCardSave).toHaveBeenCalledWith(
        'h1',
        OLD_CARD,
        'inv7',
      );
      expect(action(el, 'try-again')?.textContent).toContain(
        'hostPayment.redirecting',
      );
    });

    it('shows a refusal from the server verbatim', async () => {
      const el = await open('/billing/payment/cancel?card=canceled', 'cancel');
      settle(0);
      checkout.startCardSave.mockReturnValue(
        throwError(() => apiError(422, ['Choose a plan first'])),
      );

      action(el, 'try-again')?.click();
      settle(0);

      expect(
        el.querySelector('[data-field="start-note"]')?.textContent,
      ).toContain('Choose a plan first');
      expect(action(el, 'try-again')?.textContent).toContain('common.tryAgain');
    });

    it('says the host may not change the card when the start is refused', async () => {
      const el = await open('/billing/payment/cancel?card=canceled', 'cancel');
      settle(0);
      checkout.startCardSave.mockReturnValue(throwError(() => apiError(403)));

      action(el, 'try-again')?.click();
      settle(0);

      expect(
        el.querySelector('[data-field="start-note"]')?.textContent,
      ).toContain('hostPayment.cardStartForbidden');
    });

    it('offers a retry when billing fails to load', async () => {
      const el = await open('/billing/payment/cancel?card=canceled', 'cancel', {
        reads: [apiError(500), billing()],
      });
      settle(0);

      expect(text(el)).toContain('hostBilling.loadError');
      expect(checkout.clearReturn).not.toHaveBeenCalled();

      el.querySelector<HTMLButtonElement>('hh-error-state button')?.click();
      settle(0);

      expect(live(el)).toContain('hostPayment.cardCanceledTitle');
    });

    it('shows the forbidden copy on a refused read', async () => {
      const el = await open('/billing/payment/cancel?card=canceled', 'cancel', {
        reads: [apiError(403)],
      });
      settle(0);

      expect(live(el)).toContain('hostBilling.noAccessTitle');
    });
  });

  describe('?subscription=canceled', () => {
    it('says it did not start and that the trial is still there', async () => {
      const el = await open(
        '/billing/payment/cancel?subscription=canceled',
        'cancel',
        {
          stash: { kind: 'subscription', hostelId: 'h1', planId: 'p2' },
          reads: [billing({ plans: [plan('p2', 14)] })],
        },
      );
      settle(0);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(live(el)).toContain('hostPayment.subscriptionCanceledTitle');
      expect(el.querySelector('[data-field="trial-available"]')).not.toBeNull();
      expect(action(el, 'go-to-billing')?.getAttribute('href')).toBe(
        '/en/host/h1/subscription',
      );
      expect(checkout.clearReturn).toHaveBeenCalledTimes(1);
    });

    it('shows the success when the subscription went live before the host pressed back', async () => {
      const el = await open(
        '/billing/payment/cancel?subscription=canceled',
        'cancel',
        {
          reads: [billing({ subscription: SAFEPAY_LIVE })],
        },
      );
      settle(0);

      expect(live(el)).toContain('hostPayment.subscribedTitle');
    });
  });

  describe('a link it cannot read', () => {
    it.each<[string, ReturnMode]>([
      ['/billing/payment/success?card=foo', 'success'],
      ['/billing/payment/success?card=', 'success'],
      ['/billing/payment/cancel?card=saved', 'cancel'],
      ['/billing/payment/success?subscription=canceled', 'success'],
    ])(
      'says it could not tell at %s, asking for nothing',
      async (url, mode) => {
        const el = await open(url, mode);
        settle(10_000);

        expect(live(el)).toContain('hostPayment.unclearReturnTitle');
        expect(action(el, 'go-to-billing')?.getAttribute('href')).toBe(
          '/en/host/h1/subscription',
        );
        expect(fetch).not.toHaveBeenCalled();
        expect(checkout.clearReturn).not.toHaveBeenCalled();
      },
    );
  });

  it('sends the host to their hostels when there is no hostel to read', async () => {
    const el = await open('/billing/payment/success?card=saved', 'success', {
      hostel: null,
    });
    settle(10_000);

    expect(live(el)).toContain('hostPayment.missingHostelTitle');
    expect(action(el, 'go-to-hostels')?.getAttribute('href')).toBe('/en/host');
    expect(fetch).not.toHaveBeenCalled();
  });
});
