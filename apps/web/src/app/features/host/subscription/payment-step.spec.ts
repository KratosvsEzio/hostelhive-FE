import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import type {
  ApiError,
  BillingInvoice,
  BillingPayment,
  BillingSubscription,
  HostBilling,
  SavedCard,
  StartedPayment,
} from '@hostelhive/data-access';
import { BillingApi, HostBillingStore, HostPropertyStore } from '@services';
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
    payWithCard: 'Pay {{amount}} with {{card}}',
    saveCardReplace: 'Save this card instead of {{card}}',
    chargeConfirmTitle: 'Charge {{amount}} to {{card}}?',
    paidOn: 'Paid on {{date}}',
    chargedNotApplied: 'Contact us and quote invoice {{number}}.',
  },
  hostBillingHistory: {
    statusOpen: 'Unpaid',
    statusPaid: 'Paid',
    statusVoid: 'Closed',
    viewInvoice: 'View invoice',
  },
};

const INVOICE_HREF = /\/host\/nHelLt\/subscription\/invoices\/inv0Ab$/;

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
    initiated_by: 'customer',
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

const CARD: SavedCard = { label: 'Visa •••• 4242', expires_on: '2027-12-31' };

const DECLINE = 'Your card was declined: Insufficient funds';

function paidInvoice(over: Partial<BillingInvoice> = {}): BillingInvoice {
  return invoice({
    status: status('paid', 'Paid'),
    paid_at: '2026-10-11T10:00:00+05:00',
    payments: [payment({ status: status('succeeded'), failure_reason: null })],
    ...over,
  });
}

function pendingPayment(over: Partial<BillingPayment> = {}): BillingPayment {
  return payment({ status: status('pending'), failure_reason: null, ...over });
}

function subscription(
  over: Partial<BillingSubscription> = {},
): BillingSubscription {
  return {
    id: 'sub1',
    status: status('active', 'Active'),
    currency: 'PKR',
    plan: { id: 'pBasic', code: 'basic', name: 'Basic', features: [] },
    current_period_start: '2026-10-11T09:00:00+05:00',
    current_period_end: '2026-11-11T09:00:00+05:00',
    grace_until: null,
    scheduled_plan: null,
    cancel_at_period_end: false,
    billed_by: 'invoice',
    safepay_status: null,
    ...over,
  };
}

function billing(over: Partial<HostBilling> = {}): HostBilling {
  return {
    currency: 'PKR',
    country_code: 'PK',
    payment_methods: ['safepay'],
    auto_renew: false,
    saved_card: null,
    subscription: subscription(),
    features: [],
    open_invoice: null,
    plans: [],
    ...over,
  };
}

/** Billing for a hostel with a card on file, which the server then offers to charge. */
function withCard(over: Partial<HostBilling> = {}): HostBilling {
  return billing({
    payment_methods: ['safepay', 'saved_card'],
    saved_card: CARD,
    auto_renew: true,
    ...over,
  });
}

function started(inv: BillingInvoice, pay: BillingPayment): StartedPayment {
  return { payment: pay, checkout_url: null, invoice: inv };
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
  let charges: Subject<StartedPayment>[];
  let cardSaves: Subject<void>[];
  // What each refresh of the invoice's payments answers, in turn; the last one repeats.
  let refreshes: (BillingInvoice | ApiError)[];
  let api: {
    invoice: ReturnType<typeof vi.fn>;
    payWithSavedCard: ReturnType<typeof vi.fn>;
    refreshInvoicePayments: ReturnType<typeof vi.fn>;
  };
  let checkout: {
    start: ReturnType<typeof vi.fn>;
    startCardSave: ReturnType<typeof vi.fn>;
    restored$: Subject<void>;
  };
  let store: {
    hostelId: WritableSignal<string>;
    billing: WritableSignal<HostBilling | null>;
    refresh: ReturnType<typeof vi.fn>;
  };

  async function open(
    opts: {
      permissions?: readonly string[];
      state?: Record<string, unknown>;
      withoutHostel?: boolean;
      billing?: HostBilling | null;
      billingHostel?: string;
    } = {},
  ): Promise<HTMLElement> {
    loads = [];
    starts = [];
    charges = [];
    cardSaves = [];
    refreshes = [];
    restored = new Subject<void>();
    api = {
      invoice: vi.fn(() => {
        const s = new Subject<BillingInvoice>();
        loads.push(s);
        return s.asObservable();
      }),
      payWithSavedCard: vi.fn(() => {
        const s = new Subject<StartedPayment>();
        charges.push(s);
        return s.asObservable();
      }),
      refreshInvoicePayments: vi.fn(() => {
        const next =
          refreshes.length > 1 ? refreshes.shift() : refreshes[0];
        if (!next) return of(invoice({ payments: [pendingPayment()] }));
        return 'status' in next && typeof next.status === 'number'
          ? throwError(() => next)
          : of(next as BillingInvoice);
      }),
    };
    checkout = {
      start: vi.fn(() => {
        const s = new Subject<void>();
        starts.push(s);
        return s.asObservable();
      }),
      startCardSave: vi.fn(() => {
        const s = new Subject<void>();
        cardSaves.push(s);
        return s.asObservable();
      }),
      restored$: restored,
    };
    store = {
      hostelId: signal(opts.billingHostel ?? 'nHelLt'),
      billing: signal(opts.billing ?? null),
      refresh: vi.fn(),
    };
    const granted = new Set(opts.permissions ?? [PAY_PERMISSION]);
    TestBed.configureTestingModule({
      providers: [
        // The hostel id lives two routes above the page, as in the real tree.
        provideRouter(
          opts.withoutHostel
            ? [{ path: 'pay/:invoiceId', component: PaymentStep }]
            : [
                {
                  path: 'host/:hostelId',
                  children: [
                    {
                      path: 'subscription',
                      children: [
                        { path: 'pay/:invoiceId', component: PaymentStep },
                      ],
                    },
                  ],
                },
              ],
        ),
        provideI18nTesting(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '' } },
        { provide: BillingApi, useValue: api },
        { provide: SafepayCheckout, useValue: checkout },
        { provide: HostBillingStore, useValue: store },
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
      opts.withoutHostel
        ? '/pay/inv0Ab'
        : '/host/nHelLt/subscription/pay/inv0Ab',
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

  async function openBilled(
    hostBilling: HostBilling | null,
    inv: BillingInvoice = invoice(),
    billingHostel?: string,
  ): Promise<HTMLElement> {
    const el = await open({ billing: hostBilling, billingHostel });
    respond(inv);
    return el;
  }

  function wait(ms: number): void {
    vi.advanceTimersByTime(ms);
    harness.detectChanges();
  }

  function answerCharge(value: StartedPayment, index = charges.length - 1): void {
    charges[index].next(value);
    charges[index].complete();
    harness.detectChanges();
  }

  function refuseCharge(err: unknown, index = charges.length - 1): void {
    charges[index].error(err);
    harness.detectChanges();
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

  function savedCardButton(el: HTMLElement): HTMLButtonElement | null {
    return el.querySelector('button[data-testid="pay-saved-card"]');
  }

  function saveCardBox(el: HTMLElement): HTMLInputElement | null {
    return el.querySelector('input[data-testid="save-card"]');
  }

  function confirmButtons(el: HTMLElement): HTMLButtonElement[] {
    const modal = byTestId(el, 'charge-confirm');
    return Array.from(
      modal?.querySelectorAll<HTMLButtonElement>('div.flex.gap-3 button') ?? [],
    );
  }

  /** Clicks the saved-card button and confirms the dialog it opens. */
  function chargeCard(el: HTMLElement): void {
    savedCardButton(el)?.click();
    harness.detectChanges();
    confirmButtons(el).at(-1)?.click();
    harness.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
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

      expect(checkout.start).toHaveBeenCalledWith('inv0Ab', 'nHelLt', {
        saveCard: false,
      });
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

    it('paid: links to the invoice in the billing history', async () => {
      const el = await openWith(
        invoice({
          status: status('paid', 'Paid'),
          paid_at: '2026-10-11T10:00:00+05:00',
        }),
      );

      const link = byTestId(el, 'view-invoice');
      expect(link?.tagName).toBe('A');
      expect(link?.textContent?.trim()).toBe('View invoice');
      expect(link?.getAttribute('href')).toMatch(INVOICE_HREF);
      // Go to billing stays the main action.
      expect(byTestId(el, 'go-to-billing')?.getAttribute('color')).toBe(
        'primary',
      );
    });

    it('void: explains it can no longer be paid and offers a new plan choice', async () => {
      const el = await openWith(
        invoice({
          status: status('void', 'Void'),
          voided_at: '2026-10-12T10:00:00+05:00',
        }),
      );

      expect(byTestId(el, 'status-pill')?.textContent?.trim()).toBe('Closed');
      const notice = byTestId(el, 'void-notice')?.textContent ?? '';
      expect(notice).toContain('hostPayment.voidTitle');
      expect(notice).toContain('hostPayment.voidMessage');
      expect(byTestId(el, 'choose-plan-again')?.textContent).toContain(
        'hostPayment.choosePlanAgain',
      );
      expect(payButton(el)).toBeNull();
    });

    it('void: offers the invoice as a secondary link after the new plan choice', async () => {
      const el = await openWith(
        invoice({
          status: status('void', 'Void'),
          voided_at: '2026-10-12T10:00:00+05:00',
        }),
      );

      const link = byTestId(el, 'view-invoice');
      const choose = byTestId(el, 'choose-plan-again');
      expect(link?.textContent?.trim()).toBe('View invoice');
      expect(link?.getAttribute('href')).toMatch(INVOICE_HREF);
      expect(link?.getAttribute('variant')).toBe('outlined');
      expect(choose?.getAttribute('color')).toBe('primary');
      expect(
        choose &&
          link &&
          choose.compareDocumentPosition(link) &
            Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('keeps the View invoice link inside the active language', async () => {
      const el = await openWith(
        invoice({
          status: status('paid', 'Paid'),
          paid_at: '2026-10-11T10:00:00+05:00',
        }),
      );
      TestBed.inject(LocaleStore).apply('ur');

      try {
        harness.detectChanges();
        expect(byTestId(el, 'view-invoice')?.getAttribute('href')).toBe(
          '/ur/host/nHelLt/subscription/invoices/inv0Ab',
        );
      } finally {
        TestBed.inject(LocaleStore).apply('en');
      }
    });

    it.each([
      ['an open', invoice()],
      ['an unknown', invoice({ status: status('draft', 'Draft') })],
    ])('offers no View invoice link on %s invoice', async (_label, inv) => {
      const el = await openWith(inv);

      expect(byTestId(el, 'view-invoice')).toBeNull();
    });

    it.each([
      ['paid', status('paid', 'Paid')],
      ['void', status('void', 'Void')],
    ])(
      'offers no View invoice link on a %s invoice when no hostel id is in the path',
      async (_label, st) => {
        const el = await open({ withoutHostel: true });
        respond(invoice({ status: st }));

        expect(byTestId(el, 'status-pill')).not.toBeNull();
        expect(byTestId(el, 'view-invoice')).toBeNull();
      },
    );

    it('an unknown status: shows its name in a neutral pill and no Pay', async () => {
      const el = await openWith(invoice({ status: status('draft', 'Draft') }));

      const pill = byTestId(el, 'status-pill');
      expect(pill?.textContent?.trim()).toBe('Draft');
      expect(pill?.className).toContain('bg-ink-100');
      expect(payButton(el)).toBeNull();
      expect(byTestId(el, 'back-to-billing')).not.toBeNull();
    });
  });

  describe('the status pill', () => {
    it.each([
      ['paid', 'Settled', 'Paid', 'bg-ok'],
      ['void', 'Voided', 'Closed', 'bg-ink-100'],
      ['draft', 'Draft', 'Draft', 'bg-ink-100'],
    ])(
      '%s (server name "%s") reads "%s"',
      async (slug, name, label, toneClass) => {
        const el = await openWith(invoice({ status: status(slug, name) }));

        const pill = byTestId(el, 'status-pill');
        expect(pill?.textContent?.trim()).toBe(label);
        expect(pill?.className).toContain(toneClass);
      },
    );

    it('is not shown for an open invoice, whose Pay button says it all', async () => {
      const el = await openWith(invoice({ status: status('open', 'Open') }));

      expect(byTestId(el, 'status-pill')).toBeNull();
      expect(el.textContent).not.toContain('Unpaid');
    });
  });

  describe('saving the card at checkout', () => {
    it('is not offered before the hostel billing is known, so the step reads as before', async () => {
      const el = await openBilled(null);

      expect(saveCardBox(el)).toBeNull();
      expect(byTestId(el, 'save-card-locked')).toBeNull();
      expect(savedCardButton(el)).toBeNull();
      expect(plain(payButton(el)?.textContent)).toBe('Pay PKR 5,000');
      expect(byTestId(el, 'provider-notice')?.textContent).toContain(
        'hostPayment.providerNotice',
      );
    });

    it('is not offered from billing that belongs to another hostel', async () => {
      const el = await openBilled(billing(), invoice(), 'other');

      expect(saveCardBox(el)).toBeNull();
    });

    it('offers an unticked box, with its hint, beside the usual Pay when there is no card', async () => {
      const el = await openBilled(billing());

      const box = saveCardBox(el);
      expect(box).not.toBeNull();
      expect(box?.checked).toBe(false);
      expect(byTestId(el, 'save-card-label')?.textContent).toContain(
        'hostPayment.saveCard',
      );
      const hintId = box?.getAttribute('aria-describedby') ?? '';
      expect(hintId).not.toBe('');
      expect(el.querySelector(`[id="${hintId}"]`)?.textContent).toContain(
        'hostPayment.saveCardHint',
      );
      expect(plain(payButton(el)?.textContent)).toBe('Pay PKR 5,000');
      expect(savedCardButton(el)).toBeNull();
      expect(byTestId(el, 'provider-notice')?.textContent).toContain(
        'hostPayment.providerNotice',
      );
    });

    it('names the card it would replace when one is saved', async () => {
      const el = await openBilled(withCard());

      expect(plain(byTestId(el, 'save-card-label')?.textContent)).toBe(
        'Save this card instead of Visa •••• 4242',
      );
    });

    it('is not offered when Safepay is not a way to pay this hostel', async () => {
      const el = await openBilled(billing({ payment_methods: ['bank_transfer'] }));

      expect(saveCardBox(el)).toBeNull();
      expect(byTestId(el, 'save-card-locked')).toBeNull();
    });

    it('is not offered while Safepay Subscriptions bills the plan', async () => {
      const el = await openBilled(
        withCard({
          subscription: subscription({ billed_by: 'safepay_subscription' }),
        }),
      );

      expect(saveCardBox(el)).toBeNull();
      expect(savedCardButton(el)).toBeNull();
      expect(plain(payButton(el)?.textContent)).toBe('Pay PKR 5,000');
    });

    it('is offered again once a Safepay-billed plan is no longer live', async () => {
      const el = await openBilled(
        billing({
          subscription: subscription({
            billed_by: 'safepay_subscription',
            status: status('expired', 'Expired'),
          }),
        }),
      );

      expect(saveCardBox(el)).not.toBeNull();
    });

    it('is replaced by a note when a Safepay checkout for this invoice is already open', async () => {
      const el = await openBilled(
        billing(),
        invoice({ payments: [pendingPayment()] }),
      );

      expect(saveCardBox(el)).toBeNull();
      expect(byTestId(el, 'save-card-locked')?.textContent).toContain(
        'hostPayment.saveCardLocked',
      );
      expect(payButton(el)).not.toBeNull();
    });

    it('sends the tick to the checkout start', async () => {
      const el = await openBilled(billing());

      saveCardBox(el)?.click();
      harness.detectChanges();
      expect(saveCardBox(el)?.checked).toBe(true);

      payButton(el)?.click();
      harness.detectChanges();

      expect(checkout.start).toHaveBeenCalledWith('inv0Ab', 'nHelLt', {
        saveCard: true,
      });
      expect(saveCardBox(el)?.disabled).toBe(true);
    });

    it('sends no tick once the invoice turns out to have an open checkout', async () => {
      const el = await openBilled(billing());
      saveCardBox(el)?.click();
      harness.detectChanges();

      restored.next();
      harness.detectChanges();
      respond(invoice({ payments: [pendingPayment()] }));
      payButton(el)?.click();

      expect(checkout.start).toHaveBeenCalledWith('inv0Ab', 'nHelLt', {
        saveCard: false,
      });
    });
  });

  describe('paying with the saved card', () => {
    it('offers the card by name with the amount, and another card as the secondary way', async () => {
      const el = await openBilled(withCard());

      const button = savedCardButton(el);
      expect(button?.textContent).toContain('⁨PKR 5,000⁩');
      expect(button?.textContent).toContain('⁨Visa •••• 4242⁩');
      expect(plain(button?.textContent)).toBe(
        'Pay PKR 5,000 with Visa •••• 4242',
      );
      expect(button?.getAttribute('color')).toBe('primary');
      expect(payButton(el)?.textContent).toContain('hostPayment.payAnotherCard');
      expect(payButton(el)?.getAttribute('variant')).toBe('text');

      const provider = byTestId(el, 'provider-notice')?.textContent ?? '';
      expect(provider).toContain('hostPayment.savedCardNotice');
      expect(provider).not.toContain('hostPayment.providerNotice');
    });

    it('is not offered when the server does not list the saved card as a way to pay', async () => {
      const el = await openBilled(
        withCard({ payment_methods: ['safepay'] }),
      );

      expect(savedCardButton(el)).toBeNull();
      expect(plain(payButton(el)?.textContent)).toBe('Pay PKR 5,000');
    });

    it('is not offered without the payment permission', async () => {
      const el = await open({
        billing: withCard(),
        permissions: ['core:Invoice:create'],
      });
      respond(invoice());

      expect(savedCardButton(el)).toBeNull();
      expect(byTestId(el, 'pay-forbidden')).not.toBeNull();
    });

    it('asks first, quoting the amount and the card, and charges nothing on cancel', async () => {
      const el = await openBilled(withCard());

      savedCardButton(el)?.click();
      harness.detectChanges();

      const modal = byTestId(el, 'charge-confirm');
      expect(plain(modal?.querySelector('h2')?.textContent)).toBe(
        'Charge PKR 5,000 to Visa •••• 4242?',
      );
      expect(api.payWithSavedCard).not.toHaveBeenCalled();

      confirmButtons(el)[0].click();
      harness.detectChanges();

      expect(byTestId(el, 'charge-confirm')).toBeNull();
      expect(api.payWithSavedCard).not.toHaveBeenCalled();
    });

    it('charges once on confirm and holds every button while the charge is in flight', async () => {
      const el = await openBilled(withCard());

      chargeCard(el);

      expect(byTestId(el, 'charge-confirm')).toBeNull();
      expect(api.payWithSavedCard).toHaveBeenCalledWith('inv0Ab');
      const button = savedCardButton(el);
      expect(button?.textContent).toContain('hostPayment.charging');
      expect(button?.hasAttribute('disabled')).toBe(true);
      expect(button?.getAttribute('aria-busy')).toBe('true');
      expect(payButton(el)?.hasAttribute('disabled')).toBe(true);
      expect(saveCardBox(el)?.disabled).toBe(true);

      savedCardButton(el)?.click();
      payButton(el)?.click();
      harness.detectChanges();

      expect(byTestId(el, 'charge-confirm')).toBeNull();
      expect(api.payWithSavedCard).toHaveBeenCalledTimes(1);
      expect(checkout.start).not.toHaveBeenCalled();
    });

    it('succeeded: shows the returned invoice as paid and refreshes the billing', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);

      answerCharge(
        started(
          paidInvoice(),
          payment({ status: status('succeeded'), failure_reason: null }),
        ),
      );

      expect(byTestId(el, 'status-pill')?.textContent?.trim()).toBe('Paid');
      expect(byTestId(el, 'go-to-billing')).not.toBeNull();
      expect(savedCardButton(el)).toBeNull();
      expect(store.refresh).toHaveBeenCalledTimes(1);
      expect(api.refreshInvoicePayments).not.toHaveBeenCalled();
    });

    it('pending: keeps charging while it polls, and shows paid only once the invoice reads paid', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);
      vi.useFakeTimers();
      refreshes = [invoice({ payments: [pendingPayment()] }), paidInvoice()];

      answerCharge(
        started(invoice({ payments: [pendingPayment()] }), pendingPayment()),
      );
      wait(0);

      expect(api.refreshInvoicePayments).toHaveBeenCalledWith('inv0Ab');
      expect(savedCardButton(el)?.textContent).toContain('hostPayment.charging');
      expect(byTestId(el, 'status-pill')).toBeNull();
      expect(store.refresh).not.toHaveBeenCalled();

      wait(2500);

      expect(byTestId(el, 'status-pill')?.textContent?.trim()).toBe('Paid');
      expect(store.refresh).toHaveBeenCalledTimes(1);
    });

    it('pending: says it is still confirming when the wait runs out, never paid, and checks again', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);
      vi.useFakeTimers();
      refreshes = [invoice({ payments: [pendingPayment()] })];

      answerCharge(
        started(invoice({ payments: [pendingPayment()] }), pendingPayment()),
      );
      wait(60_000);

      expect(byTestId(el, 'charge-slow')?.textContent).toContain(
        'hostPayment.savedCardSlow',
      );
      expect(byTestId(el, 'status-pill')).toBeNull();
      expect(store.refresh).not.toHaveBeenCalled();
      expect(savedCardButton(el)?.hasAttribute('disabled')).toBe(false);

      const calls = api.refreshInvoicePayments.mock.calls.length;
      refreshes = [paidInvoice()];
      byTestId(el, 'check-charge')?.click();
      wait(0);

      expect(api.refreshInvoicePayments.mock.calls.length).toBe(calls + 1);
      expect(byTestId(el, 'charge-slow')).toBeNull();
      expect(byTestId(el, 'status-pill')?.textContent?.trim()).toBe('Paid');
    });

    it('pending: a charge that then fails is told by the attempt notice, not as paid', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);
      vi.useFakeTimers();
      refreshes = [invoice({ payments: [payment()] })];

      answerCharge(
        started(invoice({ payments: [pendingPayment()] }), pendingPayment()),
      );
      wait(0);

      expect(byTestId(el, 'attempt-notice')?.textContent).toContain(
        'hostPayment.lastAttemptFailed',
      );
      expect(byTestId(el, 'status-pill')).toBeNull();
      expect(savedCardButton(el)?.hasAttribute('disabled')).toBe(false);
      expect(store.refresh).not.toHaveBeenCalled();
    });

    it('declined: shows the bank reason verbatim with Update card and Pay with another card', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);

      refuseCharge(apiError(422, [DECLINE]));

      expect(byTestId(el, 'pay-message')?.textContent?.trim()).toBe(DECLINE);
      expect(byTestId(el, 'update-card')?.textContent).toContain(
        'hostPayment.updateCard',
      );
      expect(byTestId(el, 'pay-another-card')?.textContent).toContain(
        'hostPayment.payAnotherCard',
      );
      // The alert carries the other-card action, so it is not offered twice.
      expect(payButton(el)).toBeNull();
      expect(savedCardButton(el)?.hasAttribute('disabled')).toBe(false);
    });

    it('declined: Update card saves a new card at Safepay and remembers this invoice', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);
      refuseCharge(apiError(422, [DECLINE]));

      byTestId(el, 'update-card')?.click();
      harness.detectChanges();

      expect(checkout.startCardSave).toHaveBeenCalledWith(
        'nHelLt',
        CARD,
        'inv0Ab',
      );
      expect(byTestId(el, 'update-card')?.getAttribute('aria-busy')).toBe(
        'true',
      );
      expect(byTestId(el, 'pay-message')?.textContent?.trim()).toBe(DECLINE);
    });

    it('declined: a refused card save is explained as any refused start', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);
      refuseCharge(apiError(422, [DECLINE]));
      byTestId(el, 'update-card')?.click();
      harness.detectChanges();

      cardSaves[0].error(apiError(500));
      harness.detectChanges();

      expect(byTestId(el, 'start-failed')).not.toBeNull();
      expect(byTestId(el, 'update-card')).toBeNull();
    });

    it('declined: Pay with another card leaves for Safepay as usual', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);
      refuseCharge(apiError(422, [DECLINE]));

      byTestId(el, 'pay-another-card')?.click();
      harness.detectChanges();

      expect(checkout.start).toHaveBeenCalledWith('inv0Ab', 'nHelLt', {
        saveCard: false,
      });
      expect(byTestId(el, 'pay-another-card')?.textContent).toContain(
        'hostPayment.redirecting',
      );
    });

    it('in progress: shows the server words and waits for the running charge', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);
      vi.useFakeTimers();
      refreshes = [paidInvoice()];
      const message =
        'A card payment for invoice HH-2026-0007 is already in progress';

      refuseCharge(apiError(422, [message]));

      expect(byTestId(el, 'pay-message')?.textContent?.trim()).toBe(message);
      expect(savedCardButton(el)?.textContent).toContain('hostPayment.charging');

      wait(0);

      expect(api.refreshInvoicePayments).toHaveBeenCalledWith('inv0Ab');
      expect(byTestId(el, 'status-pill')?.textContent?.trim()).toBe('Paid');
      expect(byTestId(el, 'pay-message')).toBeNull();
    });

    it('in progress from the Safepay button waits for the running charge too', async () => {
      const el = await openWith(invoice());
      vi.useFakeTimers();
      refreshes = [paidInvoice()];

      payButton(el)?.click();
      failStart(
        apiError(422, [
          'A card payment for invoice HH-2026-0007 is already in progress',
        ]),
      );
      wait(0);

      expect(api.refreshInvoicePayments).toHaveBeenCalledTimes(1);
      expect(byTestId(el, 'status-pill')?.textContent?.trim()).toBe('Paid');
    });

    it('pending: a 403 while waiting shows our permission copy and ends the wait', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);
      vi.useFakeTimers();
      refreshes = [apiError(403, ['You are not authorized to perform this action'])];

      answerCharge(
        started(invoice({ payments: [pendingPayment()] }), pendingPayment()),
      );
      wait(0);

      expect(byTestId(el, 'pay-forbidden')?.textContent).toContain(
        'hostPayment.payForbidden',
      );
      expect(el.textContent).not.toContain('not authorized');
      expect(payButton(el)).toBeNull();
      expect(byTestId(el, 'charge-slow')).toBeNull();
      expect(store.refresh).not.toHaveBeenCalled();

      const calls = api.refreshInvoicePayments.mock.calls.length;
      wait(60_000);
      expect(api.refreshInvoicePayments.mock.calls.length).toBe(calls);
    });

    it('pending: a 404 while waiting shows the not-found state and ends the wait', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);
      vi.useFakeTimers();
      refreshes = [apiError(404)];

      answerCharge(
        started(invoice({ payments: [pendingPayment()] }), pendingPayment()),
      );
      wait(0);

      const state = byTestId(el, 'pay-not-found');
      expect(state?.textContent).toContain('hostPayment.notFoundTitle');
      expect(payButton(el)).toBeNull();
      expect(savedCardButton(el)).toBeNull();
      expect(byTestId(el, 'charge-slow')).toBeNull();
      expect(store.refresh).not.toHaveBeenCalled();

      const calls = api.refreshInvoicePayments.mock.calls.length;
      wait(60_000);
      expect(api.refreshInvoicePayments.mock.calls.length).toBe(calls);
    });

    it('a server failure shows our generic copy and lets the payer try again', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);

      refuseCharge(apiError(500));

      expect(byTestId(el, 'start-failed')?.textContent).toContain(
        'hostPayment.startFailed',
      );
      expect(savedCardButton(el)?.hasAttribute('disabled')).toBe(false);

      chargeCard(el);
      expect(api.payWithSavedCard).toHaveBeenCalledTimes(2);
      expect(byTestId(el, 'start-failed')).toBeNull();
    });

    it('an expired invoice hides both ways to pay and offers a new plan choice', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);

      refuseCharge(apiError(422, ['This invoice has expired']));

      expect(savedCardButton(el)).toBeNull();
      expect(payButton(el)).toBeNull();
      expect(byTestId(el, 'choose-plan-again')).not.toBeNull();
    });

    it('a settled invoice reads the invoice again', async () => {
      const el = await openBilled(withCard());
      chargeCard(el);

      refuseCharge(apiError(422, ['Invoice HH-2026-0007 is paid']));

      expect(api.invoice).toHaveBeenCalledTimes(2);
      respond(paidInvoice());
      expect(byTestId(el, 'status-pill')?.textContent?.trim()).toBe('Paid');
    });
  });
});
