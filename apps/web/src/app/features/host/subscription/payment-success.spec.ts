import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import type {
  ApiError,
  BillingInvoice,
  BillingPayment,
} from '@hostelhive/data-access';
import { BillingApi } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { PaymentSuccess } from './payment-success';
import { SafepayCheckout } from './safepay-checkout';

const REFUND_WORDING =
  'Charged at Safepay but the invoice was void; refund it from the Safepay dashboard (tracker trk_9f2)';

function payment(slug: string, failure: string | null = null): BillingPayment {
  return {
    id: 'pay1',
    status: { id: 1, name: slug, slug, color: null },
    payment_method: 'safepay',
    amount: '5000.00',
    currency: 'PKR',
    reference: null,
    gateway_reference: 'gw_secret_ref',
    failure_reason: failure,
    proof_url: null,
    verified_at: null,
    succeeded_at: null,
    created_at: '2026-10-11T10:00:00.000+05:00',
    invoice_id: 'inv1',
  };
}

function invoice(
  slug = 'open',
  payments: BillingPayment[] = [payment('pending')],
): BillingInvoice {
  return {
    id: 'inv1',
    number: 'HH-2026-0042',
    kind: 'new',
    currency: 'PKR',
    total: '5000.00',
    period_start: '2026-10-12T00:00:00.000+05:00',
    period_end: '2026-11-12T00:00:00.000+05:00',
    expires_at: null,
    paid_at: slug === 'paid' ? '2026-10-11T10:05:00.000+05:00' : null,
    voided_at: null,
    created_at: '2026-10-11T10:00:00.000+05:00',
    invoice_pdf_url: null,
    plan: { id: 'p1', name: 'Growth' } as BillingInvoice['plan'],
    lines: [],
    status: { id: 1, name: slug, slug, color: null },
    payments,
  };
}

function apiError(status: number, serverMessages?: string[]): ApiError {
  return { status, code: 'x', message: '', serverMessages };
}

describe('PaymentSuccess', () => {
  let fixture: ComponentFixture<PaymentSuccess>;
  let fetch: Mock<() => Observable<BillingInvoice>>;
  let checkout: {
    start: Mock<() => Observable<void>>;
    returnHostel: Mock<() => string | null>;
    billingCommands: Mock<() => string[]>;
    clearReturn: Mock<() => void>;
    restored$: Subject<void>;
  };

  async function open(url: string): Promise<HTMLElement> {
    fetch = vi.fn<() => Observable<BillingInvoice>>(() => of(invoice()));
    checkout = {
      start: vi.fn<() => Observable<void>>(() => new Subject<void>()),
      returnHostel: vi.fn<() => string | null>(() => 'h1'),
      billingCommands: vi.fn<() => string[]>(() => [
        '/host',
        'h1',
        'subscription',
      ]),
      clearReturn: vi.fn<() => void>(),
      restored$: new Subject<void>(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        provideI18nTesting(),
        { provide: BillingApi, useValue: { refreshInvoicePayments: fetch } },
        { provide: SafepayCheckout, useValue: checkout },
      ],
    });
    // The page reads ?invoice= from the root route, which a real navigation fills in.
    await TestBed.inject(Router).navigateByUrl(url);
    vi.useFakeTimers();
    fixture = TestBed.createComponent(PaymentSuccess);
    return fixture.nativeElement as HTMLElement;
  }

  function settle(ms = 0): void {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  const text = (el: HTMLElement) => el.textContent ?? '';
  const action = (el: HTMLElement, name: string) =>
    el.querySelector<HTMLElement>(`[data-action="${name}"]`);

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('without an invoice in the link', () => {
    it.each(['/billing/payment/success', '/billing/payment/success?invoice='])(
      'says so at %s and asks for nothing',
      async (url) => {
        const el = await open(url);
        settle(10_000);

        expect(text(el)).toContain('hostPayment.missingInvoiceTitle');
        expect(text(el)).toContain('hostPayment.missingInvoiceMessage');
        expect(action(el, 'go-to-billing')?.getAttribute('href')).toBe(
          '/en/host/h1/subscription',
        );
        expect(fetch).not.toHaveBeenCalled();
      },
    );
  });

  it('reads the invoice named in the link, trimmed of surrounding whitespace', async () => {
    await open('/billing/payment/success?invoice=%20inv1%20');
    settle(0);

    expect(fetch).toHaveBeenCalledWith('inv1');
  });

  describe('while the invoice is open', () => {
    it('confirms, shows the invoice once loaded and polls every 2.5 s', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      settle(0);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(text(el)).toContain('hostPayment.confirmingTitle');
      expect(el.querySelector('hh-invoice-summary')).not.toBeNull();
      expect(text(el)).toContain('hostBilling.invoiceNumber');

      settle(5000);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('never claims success before the invoice reads paid', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      settle(30_000);

      expect(text(el)).not.toContain('hostPayment.successTitle');
      expect(text(el)).not.toContain('hostPayment.paidPill');
    });

    it('keeps polling through a transient error', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      fetch
        .mockReturnValueOnce(throwError(() => apiError(500)))
        .mockReturnValueOnce(throwError(() => apiError(0)));
      settle(5000);

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(text(el)).toContain('hostPayment.confirmingTitle');
    });
  });

  it('shows the payment as received once the invoice is paid, and stops', async () => {
    const el = await open('/billing/payment/success?invoice=inv1');
    fetch
      .mockReturnValueOnce(of(invoice()))
      .mockReturnValueOnce(of(invoice('paid', [payment('succeeded')])));
    settle(2500);

    expect(text(el)).toContain('hostPayment.successTitle');
    expect(text(el)).toContain('hostPayment.successMessage');
    expect(text(el)).toContain('hostPayment.paidPill');
    expect(el.querySelector('[data-field="paid-on"]')).not.toBeNull();
    expect(el.querySelector('hh-invoice-summary')).not.toBeNull();
    expect(action(el, 'go-to-billing')?.getAttribute('href')).toBe(
      '/en/host/h1/subscription',
    );
    expect(checkout.clearReturn).toHaveBeenCalled();

    settle(30_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shows the void-after-payment state with Contact us, and stops', async () => {
    const el = await open('/billing/payment/success?invoice=inv1');
    fetch.mockReturnValue(of(invoice('void')));
    settle(0);

    expect(text(el)).toContain('hostPayment.voidAfterPayTitle');
    expect(text(el)).toContain('hostPayment.voidAfterPayMessage');
    expect(action(el, 'contact-us')?.getAttribute('href')).toBe('/en/contact');
    expect(action(el, 'go-to-billing')).not.toBeNull();
    expect(text(el)).not.toContain('hostPayment.successTitle');
    expect(checkout.clearReturn).toHaveBeenCalled();

    settle(10_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  describe('when the latest Safepay attempt failed', () => {
    it('says it did not go through, offers Try again and stops', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      fetch.mockReturnValue(
        of(invoice('open', [payment('failed', 'Declined by issuer')])),
      );
      settle(0);

      expect(text(el)).toContain('hostPayment.failedTitle');
      expect(text(el)).toContain('hostPayment.failedMessage');
      expect(action(el, 'try-again')).not.toBeNull();
      expect(text(el)).not.toContain('Declined by issuer');

      settle(10_000);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('asks a payer who was charged to contact us, never showing the reason', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      fetch.mockReturnValue(
        of(invoice('open', [payment('failed', REFUND_WORDING)])),
      );
      settle(0);

      expect(text(el)).toContain('hostPayment.chargedNotApplied');
      expect(text(el)).not.toContain('hostPayment.failedMessage');
      expect(action(el, 'contact-us')).not.toBeNull();
      expect(el.innerHTML.toLowerCase()).not.toContain('refund');
      expect(el.innerHTML).not.toContain('trk_9f2');
      expect(el.innerHTML).not.toContain('gw_secret_ref');
    });

    it('sends the payer back to Safepay once per click', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      fetch.mockReturnValue(of(invoice('open', [payment('failed')])));
      settle(0);

      action(el, 'try-again')?.click();
      action(el, 'try-again')?.click();
      fixture.detectChanges();

      expect(checkout.start).toHaveBeenCalledTimes(1);
      expect(checkout.start).toHaveBeenCalledWith('inv1', 'h1');
      expect(action(el, 'try-again')?.getAttribute('aria-busy')).toBe('true');
      expect(text(el)).toContain('hostPayment.redirecting');
    });

    it('re-enables Try again when the page comes back from the back-forward cache', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      fetch.mockReturnValue(of(invoice('open', [payment('failed')])));
      settle(0);
      action(el, 'try-again')?.click();
      fixture.detectChanges();

      checkout.restored$.next();
      settle(0);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(action(el, 'try-again')).not.toBeNull();
      expect(action(el, 'try-again')?.getAttribute('aria-busy')).toBeNull();
    });

    it('confirms again from a fresh read when the page comes back from the back-forward cache', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      fetch.mockReturnValue(of(invoice('open', [payment('failed')])));
      settle(0);
      action(el, 'try-again')?.click();
      fixture.detectChanges();
      expect(fetch).toHaveBeenCalledTimes(1);

      fetch
        .mockReturnValueOnce(of(invoice()))
        .mockReturnValue(of(invoice('paid', [payment('succeeded')])));
      checkout.restored$.next();
      settle(0);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(text(el)).toContain('hostPayment.confirmingTitle');
      expect(text(el)).not.toContain('hostPayment.failedTitle');

      settle(2500);

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(text(el)).toContain('hostPayment.successTitle');
      expect(checkout.clearReturn).toHaveBeenCalled();
    });

    it('shows an expired refusal with Choose a plan again, without polling again', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      fetch.mockReturnValue(of(invoice('open', [payment('failed')])));
      settle(0);
      checkout.start.mockReturnValue(
        throwError(() => apiError(422, ['This invoice has expired'])),
      );

      action(el, 'try-again')?.click();
      settle(10_000);

      expect(text(el)).toContain('This invoice has expired');
      expect(action(el, 'choose-plan-again')).not.toBeNull();
      expect(action(el, 'try-again')).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);

      checkout.restored$.next();
      settle(10_000);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(text(el)).toContain('This invoice has expired');
    });

    it('polls again when the refusal says the invoice was settled meanwhile', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      fetch.mockReturnValueOnce(of(invoice('open', [payment('failed')])));
      settle(0);
      checkout.start.mockReturnValue(
        throwError(() => apiError(422, ['Invoice HH-2026-0042 is paid'])),
      );
      fetch.mockReturnValue(of(invoice('paid', [payment('succeeded')])));

      action(el, 'try-again')?.click();
      settle(0);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(text(el)).toContain('hostPayment.successTitle');
    });

    it('shows any other refusal verbatim and lets the payer try again', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      fetch.mockReturnValue(of(invoice('open', [payment('failed')])));
      settle(0);
      checkout.start.mockReturnValue(
        throwError(() =>
          apiError(422, ['Online payment is unavailable right now (timeout)']),
        ),
      );

      action(el, 'try-again')?.click();
      fixture.detectChanges();

      expect(
        el.querySelector('[data-field="retry-note"]')?.textContent,
      ).toContain('Online payment is unavailable right now (timeout)');
      expect(action(el, 'try-again')?.getAttribute('aria-busy')).toBeNull();
    });

    it('replaces the server text of a 403 with our own and takes Try again away', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      fetch.mockReturnValue(of(invoice('open', [payment('failed')])));
      settle(0);
      checkout.start.mockReturnValue(
        throwError(() => apiError(403, ['You are not authorized'])),
      );

      action(el, 'try-again')?.click();
      fixture.detectChanges();

      expect(
        el.querySelector('[data-field="retry-note"]')?.textContent,
      ).toContain('hostPayment.payForbidden');
      expect(text(el)).not.toContain('You are not authorized');
      expect(action(el, 'try-again')).toBeNull();
      expect(action(el, 'go-to-billing')).not.toBeNull();
    });
  });

  it.each([
    [403, 'hostBilling.noAccessTitle', 'hostBilling.noAccessMessage'],
    [404, 'hostPayment.notFoundTitle', 'hostPayment.notFoundMessage'],
  ])('stops on a %i and says why', async (status, title, message) => {
    const el = await open('/billing/payment/success?invoice=inv1');
    fetch.mockReturnValue(
      throwError(() => apiError(status, ['Server says no'])),
    );
    settle(0);

    expect(text(el)).toContain(title);
    expect(text(el)).toContain(message);
    expect(text(el)).not.toContain('Server says no');
    expect(action(el, 'go-to-billing')).not.toBeNull();

    settle(10_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  describe('when the server has not decided within a minute', () => {
    it('says it is still confirming, without failing the payment', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      settle(60_000);

      expect(fetch).toHaveBeenCalledTimes(24);
      expect(text(el)).toContain('hostPayment.slowTitle');
      expect(text(el)).toContain('hostPayment.slowMessage');
      expect(el.querySelector('[data-field="network-hint"]')).toBeNull();
      expect(action(el, 'check-again')).not.toBeNull();
      expect(action(el, 'go-to-billing')).not.toBeNull();
      expect(action(el, 'try-again')).toBeNull();
      expect(text(el)).not.toContain('hostPayment.failedTitle');

      settle(10_000);
      expect(fetch).toHaveBeenCalledTimes(24);
    });

    it('adds the network hint when the last check never reached the server', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      fetch.mockReturnValue(throwError(() => apiError(0)));
      settle(60_000);

      expect(text(el)).toContain('hostPayment.slowTitle');
      expect(el.querySelector('[data-field="network-hint"]')).not.toBeNull();
    });

    it('leaves the network hint out when the last check was a server error', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      fetch.mockReturnValue(throwError(() => apiError(503)));
      settle(60_000);

      expect(el.querySelector('[data-field="network-hint"]')).toBeNull();
    });

    it('polls again on Check again', async () => {
      const el = await open('/billing/payment/success?invoice=inv1');
      settle(60_000);
      expect(fetch).toHaveBeenCalledTimes(24);

      action(el, 'check-again')?.click();
      fixture.detectChanges();
      expect(text(el)).toContain('hostPayment.confirmingTitle');

      fetch.mockReturnValue(of(invoice('paid', [payment('succeeded')])));
      settle(0);

      expect(fetch).toHaveBeenCalledTimes(25);
      expect(text(el)).toContain('hostPayment.successTitle');
    });
  });

  it('asks for nothing more once the page is gone', async () => {
    await open('/billing/payment/success?invoice=inv1');
    settle(5000);
    const calls = fetch.mock.calls.length;

    fixture.destroy();
    vi.advanceTimersByTime(60_000);

    expect(fetch).toHaveBeenCalledTimes(calls);
  });
});
