import { PLATFORM_ID, WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import type {
  ApiError,
  BillingInvoice,
  SafepayStart,
  SavedCard,
  StartedPayment,
} from '@hostelhive/data-access';
import { BillingApi, HostPropertyStore } from '@services';
import { ExternalNavigation } from '@core/browser/external-navigation';
import {
  SAFEPAY_RETURN_KEY,
  SafepayCheckout,
  isSafepayCheckoutUrl,
  payErrorOutcome,
  returnInvoiceId,
  returnParam,
} from './safepay-checkout';

const CHECKOUT =
  'https://sandbox.api.getsafepay.com/embedded/?tracker=track_1&tbt=x';
const CARD_PAGE =
  'https://sandbox.api.getsafepay.com/checkout/pay?tracker=track_2';
const SUBSCRIBE_PAGE =
  'https://sandbox.api.getsafepay.com/subscribe/?plan_id=plan_1';

const CARD: SavedCard = { label: 'Visa ending 1111', expires_on: '2028-12-31' };

/** A query map as the router hands one over, for the given params. */
function query(params: Record<string, string>): {
  get(name: string): string | null;
} {
  return { get: (name) => params[name] ?? null };
}

const INVOICE: BillingInvoice = {
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
  status: { id: 1, name: 'Open', slug: 'open', color: null },
  payments: [],
};

function started(checkoutUrl: string | null): StartedPayment {
  return {
    payment: {
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
      initiated_by: 'customer',
    },
    checkout_url: checkoutUrl,
    invoice: INVOICE,
  };
}

function apiError(status: number, serverMessages?: string[]): ApiError {
  return { status, code: 'unknown_error', message: '', serverMessages };
}

function pageshow(persisted: boolean): Event {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}

describe('isSafepayCheckoutUrl', () => {
  it("accepts an https page on Safepay's domain", () => {
    expect(isSafepayCheckoutUrl('https://getsafepay.com/embedded/?t=1')).toBe(
      true,
    );
  });

  it('accepts a Safepay sub-domain', () => {
    expect(isSafepayCheckoutUrl(CHECKOUT)).toBe(true);
  });

  it('refuses a page that is not https', () => {
    expect(isSafepayCheckoutUrl('http://getsafepay.com/embedded/')).toBe(false);
    expect(isSafepayCheckoutUrl('javascript:alert(1)')).toBe(false);
  });

  it('refuses a host that only looks like Safepay', () => {
    expect(isSafepayCheckoutUrl('https://evilgetsafepay.com/')).toBe(false);
    expect(isSafepayCheckoutUrl('https://getsafepay.com.evil.test/')).toBe(
      false,
    );
    expect(isSafepayCheckoutUrl('https://getsafepay.com@evil.test/')).toBe(
      false,
    );
  });

  it('refuses nothing at all, and text that is not a url', () => {
    expect(isSafepayCheckoutUrl(null)).toBe(false);
    expect(isSafepayCheckoutUrl(undefined)).toBe(false);
    expect(isSafepayCheckoutUrl('')).toBe(false);
    expect(isSafepayCheckoutUrl('getsafepay.com/embedded')).toBe(false);
  });
});

describe('returnInvoiceId', () => {
  it('keeps a plain id, trimmed', () => {
    expect(returnInvoiceId('CQcLFP')).toBe('CQcLFP');
    expect(returnInvoiceId(' CQcLFP ')).toBe('CQcLFP');
  });

  it('drops the tracker query Safepay appends after the id', () => {
    expect(
      returnInvoiceId('CQcLFP?tracker=track_c4156217-d42a-4772-8b71'),
    ).toBe('CQcLFP');
  });

  it('reads a missing or empty id as null', () => {
    expect(returnInvoiceId(null)).toBeNull();
    expect(returnInvoiceId('')).toBeNull();
    expect(returnInvoiceId('  ')).toBeNull();
    expect(returnInvoiceId('?tracker=track_1')).toBeNull();
  });
});

describe('returnParam', () => {
  it.each(['invoice', 'card', 'subscription'] as const)(
    'drops the tracker query Safepay appends to ?%s=',
    (name) => {
      expect(
        returnParam(query({ [name]: 'saved?tracker=track_c4156217' }), name),
      ).toBe('saved');
    },
  );

  it('reads only the param it is asked for', () => {
    const params = query({ card: 'saved', invoice: 'CQcLFP' });

    expect(returnParam(params, 'card')).toBe('saved');
    expect(returnParam(params, 'invoice')).toBe('CQcLFP');
    expect(returnParam(params, 'subscription')).toBeNull();
  });

  it('reads a missing, empty or tracker-only value as null', () => {
    expect(returnParam(query({}), 'card')).toBeNull();
    expect(returnParam(query({ card: ' ' }), 'card')).toBeNull();
    expect(
      returnParam(query({ subscription: '?tracker=track_1' }), 'subscription'),
    ).toBeNull();
  });
});

describe('SafepayCheckout', () => {
  let pay: Mock<
    (
      invoiceId: string,
      opts?: { saveCard?: boolean },
    ) => Observable<StartedPayment>
  >;
  let saveCard: Mock<
    (hostelId: string) => Observable<{ checkout_url: string | null }>
  >;
  let subscribeWithSafepay: Mock<
    (hostelId: string, planId: string) => Observable<SafepayStart>
  >;
  let assign: Mock<(url: string) => void>;
  let selected: WritableSignal<string>;

  function setUp(platform: 'browser' | 'server' = 'browser'): SafepayCheckout {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        {
          provide: BillingApi,
          useValue: { pay, saveCard, subscribeWithSafepay },
        },
        { provide: ExternalNavigation, useValue: { assign } },
        { provide: HostPropertyStore, useValue: { selected } },
      ],
    });
    return TestBed.inject(SafepayCheckout);
  }

  function stash(): unknown {
    const raw = sessionStorage.getItem(SAFEPAY_RETURN_KEY);
    return raw === null ? null : JSON.parse(raw);
  }

  beforeEach(() => {
    sessionStorage.clear();
    pay = vi.fn(() => of(started(CHECKOUT)));
    saveCard = vi.fn(() => of({ checkout_url: CARD_PAGE }));
    subscribeWithSafepay = vi.fn(() =>
      of({ checkout_url: SUBSCRIBE_PAGE, trial_days: 14 }),
    );
    assign = vi.fn();
    selected = signal('');
  });

  afterEach(() => sessionStorage.clear());

  describe('start', () => {
    it('pays the invoice and leaves for the checkout page, then emits once and completes', () => {
      const checkout = setUp();
      const emitted = vi.fn();
      const completed = vi.fn();

      checkout
        .start('inv1', 'nHelLt')
        .subscribe({ next: emitted, complete: completed });

      expect(pay).toHaveBeenCalledWith('inv1', {});
      expect(assign).toHaveBeenCalledOnce();
      expect(assign).toHaveBeenCalledWith(CHECKOUT);
      expect(emitted).toHaveBeenCalledOnce();
      expect(completed).toHaveBeenCalledOnce();
    });

    it('stashes the invoice and hostel before it leaves', () => {
      const checkout = setUp();
      let stashedAtLeaving: unknown = 'not read';
      assign.mockImplementation(() => (stashedAtLeaving = stash()));

      checkout.start('inv1', 'nHelLt').subscribe();

      expect(stashedAtLeaving).toEqual({
        kind: 'invoice',
        invoiceId: 'inv1',
        hostelId: 'nHelLt',
      });
    });

    it('stashes a missing hostel as null', () => {
      const checkout = setUp();

      checkout.start('inv1', null).subscribe();

      expect(stash()).toEqual({
        kind: 'invoice',
        invoiceId: 'inv1',
        hostelId: null,
      });
    });

    it('never leaves for a page that is not Safepay, and fails with status -1', () => {
      pay.mockReturnValue(of(started('https://evil.test/embedded/')));
      const checkout = setUp();
      let err: ApiError | undefined;
      const emitted = vi.fn();

      checkout
        .start('inv1', 'nHelLt')
        .subscribe({ next: emitted, error: (e: ApiError) => (err = e) });

      expect(assign).not.toHaveBeenCalled();
      expect(emitted).not.toHaveBeenCalled();
      expect(err).toEqual({
        status: -1,
        code: 'bad_checkout_url',
        message: '',
      });
      expect(stash()).toBeNull();
    });

    it('never leaves when the server gave no checkout page', () => {
      pay.mockReturnValue(of(started(null)));
      const checkout = setUp();
      let err: ApiError | undefined;

      checkout
        .start('inv1', 'nHelLt')
        .subscribe({ error: (e: ApiError) => (err = e) });

      expect(assign).not.toHaveBeenCalled();
      expect(err?.status).toBe(-1);
      expect(err?.code).toBe('bad_checkout_url');
    });

    it('passes the request failure on untouched, without leaving or stashing', () => {
      const failure = apiError(422, ['This invoice has expired']);
      pay.mockReturnValue(throwError(() => failure));
      const checkout = setUp();
      let err: unknown;

      checkout.start('inv1', 'nHelLt').subscribe({ error: (e) => (err = e) });

      expect(err).toBe(failure);
      expect(assign).not.toHaveBeenCalled();
      expect(stash()).toBeNull();
    });

    // Losing the stash only costs the way back; it must not cost the payment.
    it('still leaves when storage refuses the stash', () => {
      const checkout = setUp();
      const setItem = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });

      try {
        checkout.start('inv1', 'nHelLt').subscribe();
      } finally {
        setItem.mockRestore();
      }

      expect(assign).toHaveBeenCalledWith(CHECKOUT);
    });
  });

  describe('start with saveCard', () => {
    it('hands the save-card choice to the payment and stashes the invoice as usual', () => {
      const checkout = setUp();

      checkout.start('inv1', 'nHelLt', { saveCard: true }).subscribe();

      expect(pay).toHaveBeenCalledWith('inv1', { saveCard: true });
      expect(assign).toHaveBeenCalledWith(CHECKOUT);
      expect(stash()).toEqual({
        kind: 'invoice',
        invoiceId: 'inv1',
        hostelId: 'nHelLt',
      });
    });
  });

  describe('startCardSave', () => {
    it('asks for the card page, stashes the card on file, then leaves and completes', () => {
      const checkout = setUp();
      let stashedAtLeaving: unknown = 'not read';
      assign.mockImplementation(() => (stashedAtLeaving = stash()));
      const emitted = vi.fn();
      const completed = vi.fn();

      checkout
        .startCardSave('nHelLt', CARD)
        .subscribe({ next: emitted, complete: completed });

      expect(saveCard).toHaveBeenCalledWith('nHelLt');
      expect(pay).not.toHaveBeenCalled();
      expect(assign).toHaveBeenCalledWith(CARD_PAGE);
      expect(stashedAtLeaving).toStrictEqual({
        kind: 'card',
        hostelId: 'nHelLt',
        previous: CARD,
      });
      expect(emitted).toHaveBeenCalledOnce();
      expect(completed).toHaveBeenCalledOnce();
    });

    it('stashes no card on file as null, and the invoice it came from', () => {
      const checkout = setUp();

      checkout.startCardSave('nHelLt', null, 'inv1').subscribe();

      expect(stash()).toStrictEqual({
        kind: 'card',
        hostelId: 'nHelLt',
        previous: null,
        invoiceId: 'inv1',
      });
    });

    it('never leaves for a page that is not Safepay, and fails with status -1', () => {
      saveCard.mockReturnValue(of({ checkout_url: 'https://evil.test/' }));
      const checkout = setUp();
      let err: ApiError | undefined;

      checkout
        .startCardSave('nHelLt', null)
        .subscribe({ error: (e: ApiError) => (err = e) });

      expect(assign).not.toHaveBeenCalled();
      expect(err?.code).toBe('bad_checkout_url');
      expect(stash()).toBeNull();
    });

    it('passes the request failure on untouched, without leaving or stashing', () => {
      const failure = apiError(422, ['Choose a plan first']);
      saveCard.mockReturnValue(throwError(() => failure));
      const checkout = setUp();
      let err: unknown;

      checkout
        .startCardSave('nHelLt', null)
        .subscribe({ error: (e) => (err = e) });

      expect(err).toBe(failure);
      expect(assign).not.toHaveBeenCalled();
      expect(stash()).toBeNull();
    });
  });

  describe('startSubscribe', () => {
    it('asks for the subscribe page, stashes the plan, then leaves', () => {
      const checkout = setUp();
      let stashedAtLeaving: unknown = 'not read';
      assign.mockImplementation(() => (stashedAtLeaving = stash()));

      checkout.startSubscribe('nHelLt', 'qTFruf').subscribe();

      expect(subscribeWithSafepay).toHaveBeenCalledWith('nHelLt', 'qTFruf');
      expect(assign).toHaveBeenCalledWith(SUBSCRIBE_PAGE);
      expect(stashedAtLeaving).toStrictEqual({
        kind: 'subscription',
        hostelId: 'nHelLt',
        planId: 'qTFruf',
      });
    });

    it('never leaves when the server gave no page', () => {
      subscribeWithSafepay.mockReturnValue(
        of({ checkout_url: null, trial_days: null }),
      );
      const checkout = setUp();
      let err: ApiError | undefined;

      checkout
        .startSubscribe('nHelLt', 'qTFruf')
        .subscribe({ error: (e: ApiError) => (err = e) });

      expect(assign).not.toHaveBeenCalled();
      expect(err?.status).toBe(-1);
      expect(stash()).toBeNull();
    });
  });

  describe('returnStash', () => {
    function stored(value: unknown): void {
      sessionStorage.setItem(SAFEPAY_RETURN_KEY, JSON.stringify(value));
    }

    // A tab that left for Safepay before kinds existed still finds its way back.
    it('reads a stash with no kind as an invoice', () => {
      stored({ invoiceId: 'inv1', hostelId: 'nHelLt' });
      const checkout = setUp();

      expect(checkout.returnStash()).toStrictEqual({
        kind: 'invoice',
        invoiceId: 'inv1',
        hostelId: 'nHelLt',
      });
      expect(checkout.returnHostel('inv1')).toBe('nHelLt');
    });

    it('reads back each kind it writes', () => {
      const checkout = setUp();

      checkout.start('inv1', null).subscribe();
      expect(checkout.returnStash()).toStrictEqual({
        kind: 'invoice',
        invoiceId: 'inv1',
        hostelId: null,
      });

      checkout.startCardSave('nHelLt', CARD, 'inv1').subscribe();
      expect(checkout.returnStash()).toStrictEqual({
        kind: 'card',
        hostelId: 'nHelLt',
        previous: CARD,
        invoiceId: 'inv1',
      });

      checkout.startSubscribe('nHelLt', 'qTFruf').subscribe();
      expect(checkout.returnStash()).toStrictEqual({
        kind: 'subscription',
        hostelId: 'nHelLt',
        planId: 'qTFruf',
      });
    });

    it.each([
      ['an invoice with no id', { kind: 'invoice', hostelId: 'nHelLt' }],
      ['a legacy stash with no id', { hostelId: 'nHelLt' }],
      ['a card with no hostel', { kind: 'card', previous: null }],
      ['a subscription with no plan', { kind: 'subscription', hostelId: 'h' }],
      ['a subscription with no hostel', { kind: 'subscription', planId: 'p' }],
      ['an unknown kind', { kind: 'refund', hostelId: 'h', invoiceId: 'i' }],
      ['a bare value', 'inv1'],
      ['null', null],
    ])('ignores %s', (_label, value) => {
      stored(value);
      const checkout = setUp();

      expect(checkout.returnStash()).toBeNull();
    });

    it('reads an unreadable card on file as none, keeping the rest', () => {
      stored({ kind: 'card', hostelId: 'nHelLt', previous: { label: 7 } });
      const checkout = setUp();

      expect(checkout.returnStash()).toStrictEqual({
        kind: 'card',
        hostelId: 'nHelLt',
        previous: null,
      });
    });

    it('reads a card with no expiry', () => {
      stored({ kind: 'card', hostelId: 'nHelLt', previous: { label: 'Visa' } });
      const checkout = setUp();

      expect(checkout.returnStash()).toStrictEqual({
        kind: 'card',
        hostelId: 'nHelLt',
        previous: { label: 'Visa', expires_on: null },
      });
    });

    it('is null with nothing stashed, or on the server', () => {
      expect(setUp().returnStash()).toBeNull();

      TestBed.resetTestingModule();
      stored({ kind: 'subscription', hostelId: 'nHelLt', planId: 'qTFruf' });
      expect(setUp('server').returnStash()).toBeNull();
    });
  });

  describe('returnHostelFor', () => {
    it('returns the hostel stashed for a start of that kind', () => {
      selected.set('other');
      const checkout = setUp();

      checkout.startCardSave('nHelLt', null).subscribe();
      expect(checkout.returnHostelFor('card')).toBe('nHelLt');

      checkout.startSubscribe('subHostel', 'qTFruf').subscribe();
      expect(checkout.returnHostelFor('subscription')).toBe('subHostel');
    });

    it('falls back to the selected hostel for another kind, or nothing stashed', () => {
      selected.set('other');
      const checkout = setUp();

      expect(checkout.returnHostelFor('card')).toBe('other');

      checkout.startSubscribe('nHelLt', 'qTFruf').subscribe();
      expect(checkout.returnHostelFor('card')).toBe('other');
    });

    it('is null with no stash and no selected hostel', () => {
      expect(setUp().returnHostelFor('subscription')).toBeNull();
    });

    // A card saved from an invoice returns to ?card=, so the invoice pages never claim it.
    it('keeps returnHostel to invoice stashes only', () => {
      selected.set('other');
      const checkout = setUp();
      checkout.startCardSave('nHelLt', null, 'inv1').subscribe();

      expect(checkout.returnHostel('inv1')).toBe('other');
    });
  });

  describe('returnHostel', () => {
    it('returns the hostel the payer left from for this invoice', () => {
      selected.set('other');
      const checkout = setUp();
      checkout.start('inv1', 'nHelLt').subscribe();

      expect(checkout.returnHostel('inv1')).toBe('nHelLt');
    });

    it("falls back to the selected hostel for another invoice's return", () => {
      selected.set('other');
      const checkout = setUp();
      checkout.start('inv1', 'nHelLt').subscribe();

      expect(checkout.returnHostel('inv2')).toBe('other');
    });

    it('falls back to the selected hostel when nothing was stashed', () => {
      selected.set('other');
      const checkout = setUp();

      expect(checkout.returnHostel('inv1')).toBe('other');
      expect(checkout.returnHostel(null)).toBe('other');
    });

    it('falls back to the selected hostel when the stash had no hostel', () => {
      selected.set('other');
      const checkout = setUp();
      checkout.start('inv1', null).subscribe();

      expect(checkout.returnHostel('inv1')).toBe('other');
    });

    it('ignores a stash it cannot read', () => {
      sessionStorage.setItem(SAFEPAY_RETURN_KEY, '{not json');
      const checkout = setUp();

      expect(checkout.returnHostel('inv1')).toBeNull();
    });

    it('is null with no stash and no selected hostel', () => {
      const checkout = setUp();

      expect(checkout.returnHostel('inv1')).toBeNull();
    });

    it('reads no stash on the server', () => {
      sessionStorage.setItem(
        SAFEPAY_RETURN_KEY,
        JSON.stringify({ invoiceId: 'inv1', hostelId: 'nHelLt' }),
      );
      const checkout = setUp('server');

      expect(checkout.returnHostel('inv1')).toBeNull();
    });
  });

  describe('billingCommands', () => {
    it("points at the return hostel's billing screen", () => {
      const checkout = setUp();
      checkout.start('inv1', 'nHelLt').subscribe();

      expect(checkout.billingCommands('inv1')).toEqual([
        '/host',
        'nHelLt',
        'subscription',
      ]);
    });

    it('points at the console root when no hostel is known', () => {
      const checkout = setUp();

      expect(checkout.billingCommands('inv1')).toEqual(['/host']);
      expect(checkout.billingCommands(null)).toEqual(['/host']);
    });
  });

  describe('clearReturn', () => {
    it('forgets the stash', () => {
      selected.set('other');
      const checkout = setUp();
      checkout.start('inv1', 'nHelLt').subscribe();

      checkout.clearReturn();

      expect(stash()).toBeNull();
      expect(checkout.returnHostel('inv1')).toBe('other');
    });

    it('is harmless with nothing stashed', () => {
      const checkout = setUp();

      expect(() => checkout.clearReturn()).not.toThrow();
    });
  });

  describe('restored$', () => {
    it('emits when the page comes back from the back-forward cache', () => {
      const checkout = setUp();
      const restored = vi.fn();
      const sub = checkout.restored$.subscribe(restored);

      window.dispatchEvent(pageshow(true));
      sub.unsubscribe();

      expect(restored).toHaveBeenCalledOnce();
    });

    it('stays quiet on an ordinary page load', () => {
      const checkout = setUp();
      const restored = vi.fn();
      const sub = checkout.restored$.subscribe(restored);

      window.dispatchEvent(pageshow(false));
      sub.unsubscribe();

      expect(restored).not.toHaveBeenCalled();
    });

    it('stops listening once unsubscribed', () => {
      const checkout = setUp();
      const restored = vi.fn();
      checkout.restored$.subscribe(restored).unsubscribe();

      window.dispatchEvent(pageshow(true));

      expect(restored).not.toHaveBeenCalled();
    });

    it('never emits on the server', () => {
      const checkout = setUp('server');
      const restored = vi.fn();
      const completed = vi.fn();
      checkout.restored$.subscribe({ next: restored, complete: completed });

      window.dispatchEvent(pageshow(true));

      expect(restored).not.toHaveBeenCalled();
      expect(completed).toHaveBeenCalledOnce();
    });
  });
});

describe('payErrorOutcome', () => {
  it('treats an expired invoice as expired, message verbatim', () => {
    expect(
      payErrorOutcome(apiError(422, ['This invoice has expired'])),
    ).toEqual({ kind: 'expired', message: 'This invoice has expired' });
  });

  it('treats an invoice paid or voided meanwhile as settled', () => {
    expect(
      payErrorOutcome(apiError(422, ['Invoice HH-2026-000012 is paid'])),
    ).toEqual({ kind: 'settled', message: 'Invoice HH-2026-000012 is paid' });
    expect(
      payErrorOutcome(apiError(422, ['Invoice HH-2026-000012 is void'])),
    ).toEqual({ kind: 'settled', message: 'Invoice HH-2026-000012 is void' });
  });

  it('treats an invoice with nothing to pay as unpayable', () => {
    const message = 'There is nothing to pay on invoice HH-2026-000012';
    expect(payErrorOutcome(apiError(422, [message]))).toEqual({
      kind: 'unpayable',
      message,
    });
  });

  it('treats a method the currency does not allow as unpayable', () => {
    const message = "Safepay isn't available for USD invoices";
    expect(payErrorOutcome(apiError(422, [message]))).toEqual({
      kind: 'unpayable',
      message,
    });
  });

  it.each([
    "Card payments aren't available for USD invoices",
    'Card payments aren’t available for USD invoices',
    'Safepay isn’t available for USD invoices',
  ])('treats %j as unpayable', (message) => {
    expect(payErrorOutcome(apiError(422, [message]))).toEqual({
      kind: 'unpayable',
      message,
    });
  });

  it("treats a declined saved card as declined, the bank's reason verbatim", () => {
    const message = 'Your card was declined: Insufficient funds';
    expect(payErrorOutcome(apiError(422, [message]))).toEqual({
      kind: 'declined',
      message,
    });
  });

  it('treats a card payment already being processed as in progress', () => {
    const message =
      'A card payment for invoice HH-2026-000012 is already in progress';
    expect(payErrorOutcome(apiError(422, [message]))).toEqual({
      kind: 'inProgress',
      message,
    });
  });

  it('lets the payer retry any other refusal, its technical suffix kept', () => {
    const message =
      'Online payment is unavailable right now, please try again (Safepay request failed (503))';
    expect(payErrorOutcome(apiError(422, [message]))).toEqual({
      kind: 'retry',
      message,
    });
  });

  it('shows only the first server message', () => {
    expect(
      payErrorOutcome(apiError(422, ['This invoice has expired', 'second'])),
    ).toEqual({ kind: 'expired', message: 'This invoice has expired' });
  });

  it('falls back to the generic failure for a refusal with no message', () => {
    expect(payErrorOutcome(apiError(422))).toEqual({ kind: 'failed' });
    expect(payErrorOutcome(apiError(422, []))).toEqual({ kind: 'failed' });
  });

  it('maps a 403 to forbidden and a 404 to not found', () => {
    expect(payErrorOutcome(apiError(403, ['You are not authorized']))).toEqual({
      kind: 'forbidden',
    });
    expect(payErrorOutcome(apiError(404))).toEqual({ kind: 'notFound' });
  });

  it('maps everything else to the generic failure', () => {
    expect(payErrorOutcome(apiError(0))).toEqual({ kind: 'failed' });
    expect(payErrorOutcome(apiError(500, ['boom']))).toEqual({
      kind: 'failed',
    });
    expect(payErrorOutcome(apiError(-1))).toEqual({ kind: 'failed' });
    expect(payErrorOutcome(new Error('boom'))).toEqual({ kind: 'failed' });
    expect(payErrorOutcome(null)).toEqual({ kind: 'failed' });
    expect(payErrorOutcome(undefined)).toEqual({ kind: 'failed' });
  });
});
