import { PLATFORM_ID, WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import type {
  ApiError,
  BillingInvoice,
  StartedPayment,
} from '@hostelhive/data-access';
import { BillingApi, HostPropertyStore } from '@services';
import { ExternalNavigation } from '@core/browser/external-navigation';
import {
  SAFEPAY_RETURN_KEY,
  SafepayCheckout,
  isSafepayCheckoutUrl,
  payErrorOutcome,
} from './safepay-checkout';

const CHECKOUT =
  'https://sandbox.api.getsafepay.com/embedded/?tracker=track_1&tbt=x';

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

describe('SafepayCheckout', () => {
  let pay: Mock<(invoiceId: string) => Observable<StartedPayment>>;
  let assign: Mock<(url: string) => void>;
  let selected: WritableSignal<string>;

  function setUp(platform: 'browser' | 'server' = 'browser'): SafepayCheckout {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: BillingApi, useValue: { pay } },
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

      expect(pay).toHaveBeenCalledWith('inv1');
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
        invoiceId: 'inv1',
        hostelId: 'nHelLt',
      });
    });

    it('stashes a missing hostel as null', () => {
      const checkout = setUp();

      checkout.start('inv1', null).subscribe();

      expect(stash()).toEqual({ invoiceId: 'inv1', hostelId: null });
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
