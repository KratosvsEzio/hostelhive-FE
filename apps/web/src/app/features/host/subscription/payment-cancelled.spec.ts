import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import type {
  ApiError,
  BillingInvoice,
  BillingPayment,
} from '@hostelhive/data-access';
import { BillingApi } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { PaymentCancelled } from './payment-cancelled';
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
    initiated_by: 'customer',
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

describe('PaymentCancelled', () => {
  let fixture: ComponentFixture<PaymentCancelled>;
  let fetch: Mock<() => Observable<BillingInvoice>>;
  let checkout: {
    start: Mock<() => Observable<void>>;
    returnHostel: Mock<() => string | null>;
    billingCommands: Mock<() => string[]>;
    clearReturn: Mock<() => void>;
    restored$: Subject<void>;
  };

  async function open(
    url = '/billing/payment/cancel?invoice=inv1',
    served: Observable<BillingInvoice> = of(invoice()),
  ): Promise<HTMLElement> {
    fetch = vi.fn<() => Observable<BillingInvoice>>(() => served);
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
        { provide: BillingApi, useValue: { invoice: fetch } },
        { provide: SafepayCheckout, useValue: checkout },
      ],
    });
    // The page reads ?invoice= from the root route, which a real navigation fills in.
    await TestBed.inject(Router).navigateByUrl(url);
    fixture = TestBed.createComponent(PaymentCancelled);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: HTMLElement) => el.textContent ?? '';
  const action = (el: HTMLElement, name: string) =>
    el.querySelector<HTMLElement>(`[data-action="${name}"]`);
  const note = (el: HTMLElement) =>
    el.querySelector('[data-field="retry-note"]')?.textContent ?? '';

  function clickTryAgain(el: HTMLElement): void {
    action(el, 'try-again')?.click();
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  it.each(['/billing/payment/cancel', '/billing/payment/cancel?invoice='])(
    'says the link is missing its invoice at %s, and asks for nothing',
    async (url) => {
      const el = await open(url);

      expect(text(el)).toContain('hostPayment.missingInvoiceTitle');
      expect(action(el, 'go-to-billing')?.getAttribute('href')).toBe(
        '/en/host/h1/subscription',
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('drops the tracker Safepay appends to the return link', async () => {
    await open('/billing/payment/cancel?invoice=inv1?tracker=track_1');

    expect(fetch).toHaveBeenCalledWith('inv1');
    expect(checkout.billingCommands).toHaveBeenCalledWith('inv1');
  });

  it('offers an open invoice again, reading it once', async () => {
    const el = await open();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('inv1');
    expect(text(el)).toContain('hostPayment.cancelTitle');
    expect(text(el)).toContain('hostPayment.cancelMessage');
    expect(text(el)).toContain('hostBilling.invoiceNumber');
    expect(el.querySelector('hh-invoice-summary')).not.toBeNull();
    expect(action(el, 'try-again')).not.toBeNull();
    expect(action(el, 'back-to-billing')?.getAttribute('href')).toBe(
      '/en/host/h1/subscription',
    );
    expect(text(el)).not.toContain('hostPayment.successTitle');
  });

  it('never shows why an earlier attempt failed', async () => {
    const el = await open(
      undefined,
      of(invoice('open', [payment('failed', REFUND_WORDING)])),
    );

    expect(el.innerHTML.toLowerCase()).not.toContain('refund');
    expect(el.innerHTML).not.toContain('trk_9f2');
    expect(el.innerHTML).not.toContain('gw_secret_ref');
  });

  it('shows the payment as received when the invoice was paid meanwhile', async () => {
    const el = await open(
      undefined,
      of(invoice('paid', [payment('succeeded')])),
    );

    expect(text(el)).toContain('hostPayment.successTitle');
    expect(text(el)).toContain('hostPayment.paidPill');
    expect(action(el, 'go-to-billing')).not.toBeNull();
    expect(action(el, 'try-again')).toBeNull();
    expect(checkout.clearReturn).toHaveBeenCalled();
  });

  it('offers a new plan choice for a void invoice', async () => {
    const el = await open(undefined, of(invoice('void')));

    expect(text(el)).toContain('hostPayment.voidTitle');
    expect(text(el)).toContain('hostPayment.voidMessage');
    expect(action(el, 'choose-plan-again')?.getAttribute('href')).toBe(
      '/en/host/h1/subscription',
    );
    expect(action(el, 'try-again')).toBeNull();
    expect(checkout.clearReturn).toHaveBeenCalled();
  });

  it.each([
    [403, 'hostBilling.noAccessTitle'],
    [404, 'hostPayment.notFoundTitle'],
  ])('says why on a %i, never in the server words', async (status, title) => {
    const el = await open(
      undefined,
      throwError(() => apiError(status, ['Server says no'])),
    );

    expect(text(el)).toContain(title);
    expect(text(el)).not.toContain('Server says no');
    expect(action(el, 'go-to-billing')).not.toBeNull();
  });

  it('offers a retry when the invoice could not be read', async () => {
    const el = await open(
      undefined,
      throwError(() => apiError(500)),
    );
    expect(text(el)).toContain('hostBilling.invoiceLoadError');

    fetch.mockReturnValue(of(invoice()));
    el.querySelector<HTMLButtonElement>('hh-error-state button')?.click();
    fixture.detectChanges();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(text(el)).toContain('hostPayment.cancelTitle');
  });

  describe('Try again', () => {
    it('sends the payer back to Safepay once, however often it is clicked', async () => {
      const el = await open();

      action(el, 'try-again')?.click();
      action(el, 'try-again')?.click();
      fixture.detectChanges();

      expect(checkout.start).toHaveBeenCalledTimes(1);
      expect(checkout.start).toHaveBeenCalledWith('inv1', 'h1');
      expect(action(el, 'try-again')?.getAttribute('aria-busy')).toBe('true');
      expect(text(el)).toContain('hostPayment.redirecting');
    });

    it("looks up the hostel for this page's invoice and starts checkout for that hostel", async () => {
      const el = await open();
      checkout.returnHostel.mockReturnValue('h7');

      clickTryAgain(el);

      expect(checkout.returnHostel).toHaveBeenCalledWith('inv1');
      expect(checkout.start).toHaveBeenCalledWith('inv1', 'h7');
    });

    it('is reset, and the invoice read again, when the page comes back from the back-forward cache', async () => {
      const el = await open();
      clickTryAgain(el);

      checkout.restored$.next();
      fixture.detectChanges();

      expect(action(el, 'try-again')?.getAttribute('aria-busy')).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('shows an expired refusal with Choose a plan again, without reading the invoice again', async () => {
      const el = await open();
      checkout.start.mockReturnValue(
        throwError(() => apiError(422, ['This invoice has expired'])),
      );

      clickTryAgain(el);

      expect(text(el)).toContain('This invoice has expired');
      expect(action(el, 'choose-plan-again')).not.toBeNull();
      expect(action(el, 'try-again')).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);

      checkout.restored$.next();
      fixture.detectChanges();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('reads the invoice again when the refusal says it was settled meanwhile', async () => {
      const el = await open();
      checkout.start.mockReturnValue(
        throwError(() => apiError(422, ['Invoice HH-2026-0042 is paid'])),
      );
      fetch.mockReturnValue(of(invoice('paid', [payment('succeeded')])));

      clickTryAgain(el);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(text(el)).toContain('hostPayment.successTitle');
    });

    it('shows an unpayable refusal and takes Try again away', async () => {
      const el = await open();
      checkout.start.mockReturnValue(
        throwError(() =>
          apiError(422, ['There is nothing to pay on invoice HH-2026-0042']),
        ),
      );

      clickTryAgain(el);

      expect(note(el)).toContain('There is nothing to pay on invoice');
      expect(action(el, 'try-again')).toBeNull();
      expect(action(el, 'back-to-billing')).not.toBeNull();
    });

    it('shows any other refusal verbatim and lets the payer try again', async () => {
      const el = await open();
      checkout.start.mockReturnValue(
        throwError(() =>
          apiError(422, [
            'Online payment is unavailable right now, please try again (timeout)',
          ]),
        ),
      );

      clickTryAgain(el);

      expect(note(el)).toContain(
        'Online payment is unavailable right now, please try again (timeout)',
      );
      expect(action(el, 'try-again')?.getAttribute('aria-busy')).toBeNull();

      checkout.start.mockReturnValue(new Subject<void>());
      clickTryAgain(el);
      expect(checkout.start).toHaveBeenCalledTimes(2);
    });

    it('replaces the server text of a 403 with our own and takes Try again away', async () => {
      const el = await open();
      checkout.start.mockReturnValue(
        throwError(() => apiError(403, ['You are not authorized'])),
      );

      clickTryAgain(el);

      expect(note(el)).toContain('hostPayment.payForbidden');
      expect(text(el)).not.toContain('You are not authorized');
      expect(action(el, 'try-again')).toBeNull();
      expect(action(el, 'back-to-billing')).not.toBeNull();
    });

    it('shows the not-found state on a 404', async () => {
      const el = await open();
      checkout.start.mockReturnValue(throwError(() => apiError(404)));

      clickTryAgain(el);

      expect(text(el)).toContain('hostPayment.notFoundTitle');
      expect(action(el, 'try-again')).toBeNull();
    });

    it.each([
      ['a server error', apiError(500)],
      ['no connection', apiError(0)],
      ['an unusable checkout page', apiError(-1)],
    ])('says it could not start after %s', async (_label, error) => {
      const el = await open();
      checkout.start.mockReturnValue(throwError(() => error));

      clickTryAgain(el);

      expect(note(el)).toContain('hostPayment.startFailed');
      expect(action(el, 'try-again')?.getAttribute('aria-busy')).toBeNull();
    });
  });
});
