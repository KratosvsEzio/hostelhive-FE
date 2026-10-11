import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import type {
  ApiError,
  BillingInvoice,
  BillingPayment,
} from '@hostelhive/data-access';
import { BillingApi, HostPropertyStore } from '@services';
import { API_CONFIG } from '@core/api-config';
import { SessionStore } from '@core/auth/session-store';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { PaymentStep } from './payment-step';
import { SafepayCheckout } from './safepay-checkout';

const PAY_PERMISSION = 'core:Invoice:create_payment';

// Only the keys whose parameters a test reads carry copy; the rest resolve to their key.
const COPY = {
  hostBilling: {
    invoiceNumber: 'Invoice {{number}}',
  },
  hostPayment: {
    payAmount: 'Pay {{amount}}',
    paidPill: 'Paid',
    paidOn: 'Paid on {{date}}',
    chargedNotApplied: 'Contact us and quote invoice {{number}}.',
  },
};

const REFUND_WORDING =
  'Charged at Safepay but invoice was void; refund it from the Safepay dashboard';

function status(slug: string, name = slug) {
  return { id: 1, name, slug, color: null };
}

function payment(over: Partial<BillingPayment> = {}): BillingPayment {
  return {
    id: 'pay1',
    status: status('failed', 'Failed'),
    payment_method: 'safepay',
    amount: '5000',
    currency: 'PKR',
    reference: null,
    gateway_reference: 'trk_SECRET_GATEWAY_REF',
    failure_reason: 'Declined by issuer',
    proof_url: null,
    verified_at: null,
    succeeded_at: null,
    created_at: '2026-10-11T09:05:00+05:00',
    invoice_id: 'inv0Ab',
    ...over,
  };
}

function invoice(over: Partial<BillingInvoice> = {}): BillingInvoice {
  return {
    id: 'inv0Ab',
    number: 'HH-2026-0007',
    kind: 'new',
    currency: 'PKR',
    total: '5000',
    period_start: '2026-10-11T09:00:00+05:00',
    period_end: '2026-11-11T09:00:00+05:00',
    expires_at: '2026-11-01T10:30:00+05:00',
    paid_at: null,
    voided_at: null,
    created_at: '2026-10-11T09:00:00+05:00',
    invoice_pdf_url: null,
    plan: { id: 'pBasic', code: 'basic', name: 'Basic', features: [] },
    lines: [{ description: 'Basic plan', amount: '5000' }],
    status: status('open', 'Open'),
    payments: [],
    ...over,
  };
}

function apiError(status: number, serverMessages?: string[]): ApiError {
  return { status, code: 'error', message: 'internal', serverMessages };
}

/** Drops the Unicode isolates the page wraps amounts in, so assertions read as plain text. */
function plain(text: string | null | undefined): string {
  return (text ?? '').replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim();
}

describe('PaymentStep', () => {
  let harness: RouterTestingHarness;
  let loads: Subject<BillingInvoice>[];
  let starts: Subject<void>[];
  let restored: Subject<void>;
  let api: { invoice: ReturnType<typeof vi.fn> };
  let checkout: {
    start: ReturnType<typeof vi.fn>;
    restored$: Subject<void>;
  };

  async function open(
    opts: {
      permissions?: readonly string[];
      state?: Record<string, unknown>;
    } = {},
  ): Promise<HTMLElement> {
    loads = [];
    starts = [];
    restored = new Subject<void>();
    api = {
      invoice: vi.fn(() => {
        const s = new Subject<BillingInvoice>();
        loads.push(s);
        return s.asObservable();
      }),
    };
    checkout = {
      start: vi.fn(() => {
        const s = new Subject<void>();
        starts.push(s);
        return s.asObservable();
      }),
      restored$: restored,
    };
    const granted = new Set(opts.permissions ?? [PAY_PERMISSION]);
    TestBed.configureTestingModule({
      providers: [
        // The hostel id lives two routes above the page, as in the real tree.
        provideRouter([
          {
            path: 'host/:hostelId',
            children: [
              {
                path: 'subscription',
                children: [{ path: 'pay/:invoiceId', component: PaymentStep }],
              },
            ],
          },
        ]),
        provideI18nTesting(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '' } },
        { provide: BillingApi, useValue: api },
        { provide: SafepayCheckout, useValue: checkout },
        {
          provide: SessionStore,
          useValue: { hasPermission: (f: string) => granted.has(f) },
        },
        {
          provide: HostPropertyStore,
          useValue: { selected: signal('nHelLt') },
        },
      ],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    // The page reads the browser's history.state, which a real navigation writes before the
    // page is created. TestBed's fake platform location never touches it, so seed it here.
    window.history.replaceState(opts.state ?? null, '');
    harness = await RouterTestingHarness.create();
    await TestBed.inject(Router).navigateByUrl(
      '/host/nHelLt/subscription/pay/inv0Ab',
      { state: opts.state },
    );
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  async function openWith(
    inv: BillingInvoice,
    permissions?: readonly string[],
  ): Promise<HTMLElement> {
    const el = await open({ permissions });
    respond(inv);
    return el;
  }

  function respond(inv: BillingInvoice, index = loads.length - 1): void {
    loads[index].next(inv);
    loads[index].complete();
    harness.detectChanges();
  }

  function failLoad(err: ApiError, index = loads.length - 1): void {
    loads[index].error(err);
    harness.detectChanges();
  }

  function failStart(err: unknown, index = starts.length - 1): void {
    starts[index].error(err);
    harness.detectChanges();
  }

  function byTestId(el: HTMLElement, id: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${id}"]`);
  }

  function payButton(el: HTMLElement): HTMLButtonElement | null {
    return el.querySelector('button[data-testid="pay"]');
  }

  function hrefs(el: HTMLElement): string[] {
    return Array.from(el.querySelectorAll('a')).map(
      (a) => a.getAttribute('href') ?? '',
    );
  }

  afterEach(() => {
    window.history.replaceState(null, '');
    TestBed.resetTestingModule();
  });

  describe('loading', () => {
    it('shows a skeleton until the invoice arrives', async () => {
      const el = await open();

      expect(byTestId(el, 'pay-loading')).not.toBeNull();
      expect(el.querySelector('hh-invoice-summary')).toBeNull();
      expect(api.invoice).toHaveBeenCalledWith('inv0Ab');

      respond(invoice());

      expect(byTestId(el, 'pay-loading')).toBeNull();
      expect(el.querySelector('hh-invoice-summary')).not.toBeNull();
    });

    it('renders a handed-over invoice at once and still reads it from the server', async () => {
      const el = await open({ state: { invoice: invoice() } });

      expect(byTestId(el, 'pay-loading')).toBeNull();
      expect(plain(payButton(el)?.textContent)).toBe('Pay PKR 5,000');
      expect(api.invoice).toHaveBeenCalledTimes(1);

      respond(invoice({ total: '6000' }));

      expect(plain(payButton(el)?.textContent)).toBe('Pay PKR 6,000');
    });

    it('ignores navigation state that belongs to another invoice', async () => {
      const el = await open({ state: { invoice: invoice({ id: 'other1' }) } });

      expect(byTestId(el, 'pay-loading')).not.toBeNull();
    });

    it('keeps a handed-over invoice on screen when the refresh fails', async () => {
      const el = await open({ state: { invoice: invoice() } });

      failLoad(apiError(500));

      expect(el.querySelector('hh-error-state')).toBeNull();
      expect(payButton(el)).not.toBeNull();
    });
  });

  describe('load errors', () => {
    it('shows its own no-access copy on a 403', async () => {
      const el = await open();
      failLoad(
        apiError(403, ['You are not authorized to perform this action']),
      );

      const state = byTestId(el, 'pay-forbidden-load');
      expect(state?.textContent).toContain('hostBilling.noAccessTitle');
      expect(state?.textContent).toContain('hostBilling.noAccessMessage');
      expect(el.textContent).not.toContain('not authorized');
      expect(payButton(el)).toBeNull();
    });

    it('shows the not-found state with a way back on a 404', async () => {
      const el = await open();
      failLoad(apiError(404));

      const state = byTestId(el, 'pay-not-found');
      expect(state?.textContent).toContain('hostPayment.notFoundTitle');
      expect(state?.textContent).toContain('hostPayment.notFoundMessage');
      expect(
        hrefs(el).some((h) => h.endsWith('/host/nHelLt/subscription')),
      ).toBe(true);
    });

    it('shows an inline error with a retry that refetches', async () => {
      const el = await open();
      failLoad(apiError(500));

      const error = byTestId(el, 'pay-load-error');
      expect(error?.textContent).toContain('hostBilling.invoiceLoadError');
      expect(
        hrefs(el).some((h) => h.endsWith('/host/nHelLt/subscription')),
      ).toBe(true);

      const retry = Array.from(error?.querySelectorAll('button') ?? []).find(
        (b) => b.textContent?.includes('common.tryAgain'),
      );
      retry?.click();
      harness.detectChanges();

      expect(api.invoice).toHaveBeenCalledTimes(2);
      expect(byTestId(el, 'pay-loading')).not.toBeNull();
      respond(invoice());
      expect(payButton(el)).not.toBeNull();
    });
  });

  describe('an open invoice', () => {
    it('shows the number without a status pill, the summary, the deadline and the provider notes', async () => {
      const el = await openWith(invoice());

      expect(el.querySelector('[data-field="header"]')?.textContent).toContain(
        'Invoice HH-2026-0007',
      );
      expect(byTestId(el, 'status-pill')).toBeNull();
      expect(el.querySelector('hh-invoice-summary')).not.toBeNull();
      expect(el.querySelector('[data-field="pay-by"]')?.textContent).toContain(
        'hostBilling.payBy',
      );
      const provider = byTestId(el, 'provider-notice')?.textContent ?? '';
      expect(provider).toContain('hostPayment.providerNotice');
      expect(provider).toContain('hostPayment.providerAmountOnly');
      expect(byTestId(el, 'attempt-notice')).toBeNull();
    });

    it('offers one Pay button quoting the server total, isolated for bidi text', async () => {
      const el = await openWith(invoice());

      const buttons = el.querySelectorAll('button[data-testid="pay"]');
      expect(buttons.length).toBe(1);
      const label = buttons[0].textContent ?? '';
      expect(label).toContain('⁨PKR 5,000⁩');
      expect(plain(label)).toBe('Pay PKR 5,000');
    });

    it('links back to the hostel billing page found on an ancestor route', async () => {
      const el = await openWith(invoice());

      expect(byTestId(el, 'back-to-billing')?.getAttribute('href')).toMatch(
        /\/host\/nHelLt\/subscription$/,
      );
    });

    it('keeps the billing link inside the active language', async () => {
      const el = await openWith(invoice());
      TestBed.inject(LocaleStore).apply('ur');

      try {
        harness.detectChanges();
        expect(byTestId(el, 'back-to-billing')?.getAttribute('href')).toBe(
          '/ur/host/nHelLt/subscription',
        );
      } finally {
        TestBed.inject(LocaleStore).apply('en');
      }
    });

    it('still offers Pay when the deadline has passed by the browser clock', async () => {
      const el = await openWith(
        invoice({ expires_at: '2020-01-01T00:00:00+05:00' }),
      );

      expect(plain(payButton(el)?.textContent)).toBe('Pay PKR 5,000');
      expect(payButton(el)?.hasAttribute('disabled')).toBe(false);
      expect(byTestId(el, 'choose-plan-again')).toBeNull();
    });

    it('hides Pay and explains why without the payment permission', async () => {
      const el = await openWith(invoice(), ['core:Invoice:create']);

      expect(payButton(el)).toBeNull();
      expect(byTestId(el, 'pay-forbidden')?.textContent).toContain(
        'hostPayment.payForbidden',
      );
    });
  });

  describe('the latest payment attempt', () => {
    it('says a pending Safepay attempt may still be confirming, and keeps Pay', async () => {
      const el = await openWith(
        invoice({
          payments: [
            payment({ status: status('pending'), failure_reason: null }),
          ],
        }),
      );

      const notice = byTestId(el, 'attempt-notice');
      expect(notice?.textContent).toContain('hostPayment.pendingNotice');
      expect(notice?.getAttribute('data-tone')).toBe('neutral');
      expect(payButton(el)).not.toBeNull();
    });

    it('says the last attempt failed without quoting its reason', async () => {
      const el = await openWith(invoice({ payments: [payment()] }));

      const notice = byTestId(el, 'attempt-notice');
      expect(notice?.textContent).toContain('hostPayment.lastAttemptFailed');
      expect(notice?.getAttribute('data-tone')).toBe('warn');
      expect(byTestId(el, 'contact-us')).toBeNull();
      expect(el.textContent).not.toContain('Declined by issuer');
      expect(payButton(el)).not.toBeNull();
    });

    it('asks a payer charged but not applied to contact us, quoting the invoice', async () => {
      const el = await openWith(
        invoice({ payments: [payment({ failure_reason: REFUND_WORDING })] }),
      );

      const notice = byTestId(el, 'attempt-notice');
      expect(notice?.textContent).toContain(
        'Contact us and quote invoice HH-2026-0007.',
      );
      expect(notice?.getAttribute('data-tone')).toBe('danger');
      expect(byTestId(el, 'contact-us')?.getAttribute('href')).toMatch(
        /\/contact$/,
      );
    });

    it('never puts internal failure wording or the gateway reference in the page', async () => {
      const el = await openWith(
        invoice({ payments: [payment({ failure_reason: REFUND_WORDING })] }),
      );

      const html = el.innerHTML;
      expect(html).not.toContain('refund it from the Safepay dashboard');
      expect(html).not.toContain('Charged at Safepay');
      expect(html).not.toContain('trk_SECRET_GATEWAY_REF');
    });
  });

  describe('paying', () => {
    it('starts Safepay for this invoice and hostel, and keeps the spinner once it has left', async () => {
      const el = await openWith(invoice());

      payButton(el)?.click();
      harness.detectChanges();

      expect(checkout.start).toHaveBeenCalledWith('inv0Ab', 'nHelLt');
      expect(payButton(el)?.textContent).toContain('hostPayment.redirecting');
      expect(payButton(el)?.hasAttribute('disabled')).toBe(true);
      expect(payButton(el)?.getAttribute('aria-busy')).toBe('true');

      starts[0].next();
      starts[0].complete();
      harness.detectChanges();

      expect(payButton(el)?.textContent).toContain('hostPayment.redirecting');
      expect(payButton(el)?.hasAttribute('disabled')).toBe(true);
    });

    it('starts only once on a double click', async () => {
      const el = await openWith(invoice());

      const button = payButton(el);
      button?.click();
      button?.click();
      harness.detectChanges();
      payButton(el)?.click();

      expect(checkout.start).toHaveBeenCalledTimes(1);
    });

    it('resets the button and reads the invoice again when the page comes back from the cache', async () => {
      const el = await openWith(invoice());
      payButton(el)?.click();
      starts[0].next();
      starts[0].complete();
      harness.detectChanges();

      restored.next();
      harness.detectChanges();

      expect(payButton(el)?.hasAttribute('disabled')).toBe(false);
      expect(plain(payButton(el)?.textContent)).toBe('Pay PKR 5,000');
      expect(api.invoice).toHaveBeenCalledTimes(2);

      respond(
        invoice({
          status: status('paid', 'Paid'),
          paid_at: '2026-10-11T10:00:00+05:00',
        }),
      );
      expect(payButton(el)).toBeNull();
      expect(byTestId(el, 'status-pill')?.textContent?.trim()).toBe('Paid');
    });
  });

  describe('a refused start', () => {
    async function clickPay(): Promise<HTMLElement> {
      const el = await openWith(invoice());
      payButton(el)?.click();
      harness.detectChanges();
      return el;
    }

    it('expired: shows the server message, offers a new plan choice and does not refetch', async () => {
      const el = await clickPay();
      failStart(apiError(422, ['This invoice has expired']));

      expect(byTestId(el, 'pay-message')?.textContent?.trim()).toBe(
        'This invoice has expired',
      );
      expect(payButton(el)).toBeNull();
      expect(el.querySelector('[data-field="pay-by"]')).toBeNull();
      const choose = byTestId(el, 'choose-plan-again');
      expect(choose?.textContent).toContain('hostPayment.choosePlanAgain');
      expect(choose?.getAttribute('href')).toMatch(
        /\/host\/nHelLt\/subscription$/,
      );
      expect(api.invoice).toHaveBeenCalledTimes(1);
    });

    it('expired: a page restored from the cache does not read the invoice again', async () => {
      const el = await clickPay();
      failStart(apiError(422, ['This invoice has expired']));

      restored.next();
      harness.detectChanges();

      expect(api.invoice).toHaveBeenCalledTimes(1);
      expect(payButton(el)).toBeNull();
      expect(byTestId(el, 'choose-plan-again')?.textContent).toContain(
        'hostPayment.choosePlanAgain',
      );
      expect(byTestId(el, 'pay-message')?.textContent?.trim()).toBe(
        'This invoice has expired',
      );
    });

    it('settled: shows the server message and reads the invoice again', async () => {
      const el = await clickPay();
      failStart(apiError(422, ['Invoice HH-2026-0007 is paid']));

      expect(byTestId(el, 'pay-message')?.textContent?.trim()).toBe(
        'Invoice HH-2026-0007 is paid',
      );
      expect(api.invoice).toHaveBeenCalledTimes(2);

      respond(
        invoice({
          status: status('paid', 'Paid'),
          paid_at: '2026-10-11T10:00:00+05:00',
        }),
      );

      expect(payButton(el)).toBeNull();
      expect(byTestId(el, 'go-to-billing')).not.toBeNull();
    });

    it('unpayable: shows the server message and hides Pay', async () => {
      const el = await clickPay();
      failStart(apiError(422, ['There is nothing to pay on this invoice']));

      expect(byTestId(el, 'pay-message')?.textContent?.trim()).toBe(
        'There is nothing to pay on this invoice',
      );
      expect(payButton(el)).toBeNull();
      expect(api.invoice).toHaveBeenCalledTimes(1);
    });

    it('retry: shows the server message verbatim and lets the payer try again', async () => {
      const el = await clickPay();
      const message =
        'Online payment is unavailable right now (Safepay: upstream timeout)';
      failStart(apiError(422, [message]));

      expect(byTestId(el, 'pay-message')?.textContent?.trim()).toBe(message);
      expect(payButton(el)?.hasAttribute('disabled')).toBe(false);
      expect(plain(payButton(el)?.textContent)).toBe('Pay PKR 5,000');

      payButton(el)?.click();
      expect(checkout.start).toHaveBeenCalledTimes(2);
    });

    it('forbidden: shows its own permission copy, never the server text, and hides Pay', async () => {
      const el = await clickPay();
      failStart(
        apiError(403, ['You are not authorized to perform this action']),
      );

      expect(byTestId(el, 'pay-forbidden')?.textContent).toContain(
        'hostPayment.payForbidden',
      );
      expect(el.textContent).not.toContain('not authorized');
      expect(byTestId(el, 'pay-message')).toBeNull();
      expect(payButton(el)).toBeNull();
    });

    it('notFound: shows the not-found state', async () => {
      const el = await clickPay();
      failStart(apiError(404));

      const state = byTestId(el, 'pay-not-found');
      expect(state?.textContent).toContain('hostPayment.notFoundTitle');
      expect(state?.textContent).toContain('hostPayment.notFoundMessage');
      expect(payButton(el)).toBeNull();
      expect(byTestId(el, 'back-to-billing')).not.toBeNull();
    });

    it.each([
      ['a server error', apiError(500)],
      ['a network failure', apiError(0)],
      [
        'an unusable checkout page',
        { status: -1, code: 'bad_checkout_url', message: '' },
      ],
      ['a 422 with nothing to show', apiError(422, [])],
    ])(
      'failed (%s): shows our generic copy and re-enables Pay',
      async (_label, err) => {
        const el = await clickPay();
        failStart(err);

        expect(byTestId(el, 'start-failed')?.textContent).toContain(
          'hostPayment.startFailed',
        );
        expect(byTestId(el, 'pay-message')).toBeNull();
        expect(payButton(el)?.hasAttribute('disabled')).toBe(false);
      },
    );

    it('clears the previous refusal when the payer tries again', async () => {
      const el = await clickPay();
      failStart(apiError(500));

      payButton(el)?.click();
      harness.detectChanges();

      expect(byTestId(el, 'start-failed')).toBeNull();
    });
  });

  describe('a settled invoice', () => {
    it('paid: shows the Paid pill, the payment date and Go to billing, without Pay', async () => {
      const el = await openWith(
        invoice({
          status: status('paid', 'Paid'),
          paid_at: '2026-10-11T10:00:00+05:00',
          payments: [
            payment({ status: status('succeeded'), failure_reason: null }),
          ],
        }),
      );

      expect(byTestId(el, 'status-pill')?.textContent?.trim()).toBe('Paid');
      // Date only: the time of day is never part of the line.
      expect(
        el.querySelector('[data-field="paid-on"]')?.textContent?.trim(),
      ).toMatch(/^Paid on \d{1,2} Oct 2026$/);
      expect(byTestId(el, 'go-to-billing')?.getAttribute('href')).toMatch(
        /\/host\/nHelLt\/subscription$/,
      );
      expect(payButton(el)).toBeNull();
      expect(byTestId(el, 'provider-notice')).toBeNull();
      expect(el.querySelector('[data-field="pay-by"]')).toBeNull();
    });

    it('void: explains it can no longer be paid and offers a new plan choice', async () => {
      const el = await openWith(
        invoice({
          status: status('void', 'Void'),
          voided_at: '2026-10-12T10:00:00+05:00',
        }),
      );

      expect(byTestId(el, 'status-pill')?.textContent?.trim()).toBe('Void');
      const notice = byTestId(el, 'void-notice')?.textContent ?? '';
      expect(notice).toContain('hostPayment.voidTitle');
      expect(notice).toContain('hostPayment.voidMessage');
      expect(byTestId(el, 'choose-plan-again')?.textContent).toContain(
        'hostPayment.choosePlanAgain',
      );
      expect(payButton(el)).toBeNull();
    });

    it('an unknown status: shows its name in a neutral pill and no Pay', async () => {
      const el = await openWith(invoice({ status: status('draft', 'Draft') }));

      const pill = byTestId(el, 'status-pill');
      expect(pill?.textContent?.trim()).toBe('Draft');
      expect(pill?.className).toContain('bg-ink-100');
      expect(payButton(el)).toBeNull();
      expect(byTestId(el, 'back-to-billing')).not.toBeNull();
    });
  });
});
