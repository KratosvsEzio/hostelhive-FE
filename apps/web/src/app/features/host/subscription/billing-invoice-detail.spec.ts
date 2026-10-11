import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
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
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { BillingInvoiceDetail } from './billing-invoice-detail';

const PAY_PERMISSION = 'core:Invoice:create_payment';

const COPY = {
  hostBilling: {
    invoiceNumber: 'Invoice {{number}}',
    payBy: 'Pay by {{date}}',
    pay: 'Pay',
  },
  hostPayment: {
    paidOn: 'Paid on {{date}}',
    chargedNotApplied: 'Contact us and quote invoice {{number}}.',
    lastAttemptFailed: "Your last payment attempt didn't go through.",
    pendingNotice: "You've already started paying this invoice.",
  },
  hostBillingHistory: {
    issuedOn: 'Issued on {{date}}',
    closedOn: 'Closed on {{date}}',
    statusOpen: 'Unpaid',
    statusPaid: 'Paid',
    statusVoid: 'Closed',
  },
};

const REFUND_WORDING =
  'Charged at Safepay but invoice was void; refund it from the Safepay dashboard';

const PDF_URL = 'https://images.example/unprocessed/receipt-uuid.pdf';

@Component({ template: '' })
class Stub {}

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

function paid(over: Partial<BillingInvoice> = {}): BillingInvoice {
  return invoice({
    status: status('paid', 'Paid'),
    paid_at: '2026-10-12T14:00:00+05:00',
    payments: [
      payment({
        status: status('succeeded', 'Succeeded'),
        failure_reason: null,
      }),
    ],
    ...over,
  });
}

function apiError(code: number): ApiError {
  return { status: code, code: 'error', message: 'internal' };
}

function text(node: Element | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('BillingInvoiceDetail', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  let loads: Subject<BillingInvoice>[];
  let api: { invoice: ReturnType<typeof vi.fn> };

  async function open(
    opts: {
      permissions?: readonly string[];
      noFlags?: boolean;
      state?: Record<string, unknown>;
      url?: string;
    } = {},
  ): Promise<HTMLElement> {
    loads = [];
    api = {
      invoice: vi.fn(() => {
        const s = new Subject<BillingInvoice>();
        loads.push(s);
        return s.asObservable();
      }),
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
                children: [
                  { path: 'invoices', component: Stub },
                  {
                    path: 'invoices/:invoiceId',
                    component: BillingInvoiceDetail,
                  },
                ],
              },
            ],
          },
          { path: 'elsewhere', component: Stub },
        ]),
        provideI18nTesting(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '' } },
        { provide: BillingApi, useValue: api },
        // With noFlags the real store is used, so its own fail-open rule is what is under test.
        ...(opts.noFlags
          ? []
          : [
              {
                provide: SessionStore,
                useValue: {
                  hasPermission: (f: string) => granted.has(f),
                },
              },
            ]),
        {
          provide: HostPropertyStore,
          useValue: { selected: signal('nHelLt') },
        },
      ],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    await router.navigateByUrl(
      opts.url ?? '/host/nHelLt/subscription/invoices/inv0Ab',
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

  function fail(err: ApiError, index = loads.length - 1): void {
    loads[index].error(err);
    harness.detectChanges();
  }

  function tick(ms: number): void {
    vi.advanceTimersByTime(ms);
    harness.detectChanges();
  }

  function byTestId(el: HTMLElement, id: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${id}"]`);
  }

  function all(el: HTMLElement, id: string): HTMLElement[] {
    return Array.from(
      el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
    );
  }

  function field(el: HTMLElement, name: string): string | null {
    const node = el.querySelector(`[data-field="${name}"]`);
    return node ? text(node) : null;
  }

  function backHref(el: HTMLElement): string {
    return byTestId(el, 'back-to-history')?.getAttribute('href') ?? '';
  }

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('loading and errors', () => {
    it('shows a skeleton and the way back until the invoice arrives', async () => {
      const el = await open();

      expect(api.invoice).toHaveBeenCalledWith('inv0Ab');
      expect(byTestId(el, 'detail-loading')).not.toBeNull();
      expect(byTestId(el, 'back-to-history')).not.toBeNull();
      expect(el.querySelector('hh-invoice-summary')).toBeNull();

      respond(invoice());

      expect(byTestId(el, 'detail-loading')).toBeNull();
      expect(el.querySelector('hh-invoice-summary')).not.toBeNull();
    });

    it('frames the page as Billing', async () => {
      const el = await open();

      expect(el.querySelector('app-dashboard-layout')).not.toBeNull();
    });

    it('explains a 403 in our own words, without a retry', async () => {
      const el = await open();
      fail(apiError(403));

      const state = byTestId(el, 'detail-forbidden');
      expect(text(state)).toContain('hostBilling.noAccessTitle');
      expect(text(state)).toContain('hostBilling.noAccessMessage');
      expect(state?.querySelector('button')).toBeNull();
      expect(byTestId(el, 'back-to-history')).not.toBeNull();
    });

    it('says the invoice was not found on a 404', async () => {
      const el = await open();
      fail(apiError(404));

      const state = byTestId(el, 'detail-not-found');
      expect(text(state)).toContain('hostPayment.notFoundTitle');
      expect(state?.querySelector('button')).toBeNull();
      expect(byTestId(el, 'back-to-history')).not.toBeNull();
    });

    it('offers a retry for any other failure', async () => {
      const el = await open();
      fail(apiError(500));

      const state = byTestId(el, 'detail-load-error');
      expect(text(state)).toContain('hostBilling.invoiceLoadError');
      expect(byTestId(el, 'back-to-history')).not.toBeNull();

      state?.querySelector('button')?.click();
      harness.detectChanges();

      expect(api.invoice).toHaveBeenCalledTimes(2);
      expect(byTestId(el, 'detail-loading')).not.toBeNull();

      respond(invoice());

      expect(byTestId(el, 'detail-load-error')).toBeNull();
      expect(el.querySelector('hh-invoice-summary')).not.toBeNull();
    });
  });

  describe('header', () => {
    it('names an open invoice Unpaid with when it was issued and its deadline', async () => {
      const el = await openWith(invoice());
      const pill = byTestId(el, 'status-pill') as HTMLElement;

      expect(text(el.querySelector('h2'))).toBe('Invoice HH-2026-0007');
      expect(text(pill)).toBe('Unpaid');
      expect(pill.className).toContain('text-warn');
      expect(field(el, 'issued-on')).toBe('Issued on 11 Oct 2026');
      expect(field(el, 'pay-by')).toBe('Pay by 1 Nov 2026, 10:30 AM');
      expect(field(el, 'paid-on')).toBeNull();
      expect(field(el, 'closed-on')).toBeNull();
    });

    it('dates a paid invoice by its payment, date only', async () => {
      const el = await openWith(paid({ invoice_pdf_url: PDF_URL }));
      const pill = byTestId(el, 'status-pill') as HTMLElement;

      expect(text(pill)).toBe('Paid');
      expect(pill.className).toContain('text-ok');
      expect(field(el, 'issued-on')).toBe('Issued on 11 Oct 2026');
      expect(field(el, 'paid-on')).toBe('Paid on 12 Oct 2026');
      expect(field(el, 'pay-by')).toBeNull();
    });

    it('calls a void invoice Closed and dates its closing', async () => {
      const el = await openWith(
        invoice({
          status: status('void', 'Void'),
          voided_at: '2026-10-20T08:00:00+05:00',
        }),
      );
      const pill = byTestId(el, 'status-pill') as HTMLElement;

      expect(text(pill)).toBe('Closed');
      expect(pill.className).toContain('bg-ink-100');
      expect(field(el, 'closed-on')).toBe('Closed on 20 Oct 2026');
      expect(field(el, 'pay-by')).toBeNull();
      expect(el.textContent).not.toContain('Void');
    });

    it('leaves out the paid-on line when a paid invoice has no payment date', async () => {
      const el = await openWith(
        paid({ invoice_pdf_url: PDF_URL, paid_at: null }),
      );

      expect(field(el, 'paid-on')).toBeNull();
      expect(field(el, 'issued-on')).toBe('Issued on 11 Oct 2026');
      expect(el.textContent).not.toContain('Invalid date');
    });

    it('leaves out the closed-on line when a void invoice has no closing date', async () => {
      const el = await openWith(
        invoice({ status: status('void', 'Void'), voided_at: null }),
      );

      expect(field(el, 'closed-on')).toBeNull();
      expect(field(el, 'issued-on')).toBe('Issued on 11 Oct 2026');
      expect(el.textContent).not.toContain('Invalid date');
    });

    it("shows an unknown status by the server's name", async () => {
      const el = await openWith(
        invoice({ status: status('disputed', 'Under dispute') }),
      );
      const pill = byTestId(el, 'status-pill') as HTMLElement;

      expect(text(pill)).toBe('Under dispute');
      expect(pill.className).toContain('bg-ink-100');
      expect(field(el, 'issued-on')).toBe('Issued on 11 Oct 2026');
      expect(field(el, 'pay-by')).toBeNull();
    });
  });

  describe('open invoice', () => {
    it('links Pay to the payment step with the id as returned', async () => {
      const el = await openWith(invoice());

      const pay = byTestId(el, 'pay');
      expect(pay?.tagName).toBe('A');
      expect(text(pay)).toBe('Pay');
      expect(pay?.getAttribute('href')).toMatch(
        /\/host\/nHelLt\/subscription\/pay\/inv0Ab$/,
      );
      expect(byTestId(el, 'pay-forbidden')).toBeNull();
      expect(byTestId(el, 'receipt')).toBeNull();
    });

    it('explains instead of offering Pay without the permission', async () => {
      const el = await openWith(invoice(), []);

      expect(byTestId(el, 'pay')).toBeNull();
      expect(text(byTestId(el, 'pay-forbidden'))).toBe(
        'hostPayment.payForbidden',
      );
    });

    it('offers Pay while no permission flags are loaded', async () => {
      const el = await open({ noFlags: true });
      const store = TestBed.inject(SessionStore);
      store.setSession(
        {
          id: 'u1',
          name: 'Host',
          email: 'host@example.com',
          role: 'host',
          allRoles: ['host'],
          permissions: [],
        },
        'token',
      );
      try {
        respond(invoice());

        expect(store.hasPermission(PAY_PERMISSION)).toBe(true);
        expect(byTestId(el, 'pay')).not.toBeNull();
        expect(byTestId(el, 'pay-forbidden')).toBeNull();
      } finally {
        store.clear();
      }
    });

    it('marks the missing permission with a lock', async () => {
      const el = await openWith(invoice(), []);
      const icon = byTestId(el, 'pay-forbidden')?.querySelector('i');

      expect(icon?.classList).toContain('ti-lock');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
    });

    it('still offers Pay when the deadline has passed by the browser clock', async () => {
      const el = await openWith(
        invoice({ expires_at: '2020-01-01T00:00:00+05:00' }),
      );

      expect(byTestId(el, 'pay')).not.toBeNull();
    });

    it('warns about a failed last attempt above Pay', async () => {
      const el = await openWith(invoice({ payments: [payment()] }));

      const notice = byTestId(el, 'attempt-notice');
      expect(text(notice)).toBe("Your last payment attempt didn't go through.");
      expect(notice?.getAttribute('data-tone')).toBe('warn');
    });

    it('warns about a pending Safepay attempt above Pay', async () => {
      const el = await openWith(
        invoice({
          payments: [
            payment({ status: status('pending'), failure_reason: null }),
          ],
        }),
      );

      expect(text(byTestId(el, 'attempt-notice'))).toBe(
        "You've already started paying this invoice.",
      );
    });

    it('has no notice when there are no attempts', async () => {
      const el = await openWith(invoice());

      expect(byTestId(el, 'attempt-notice')).toBeNull();
    });
  });

  describe('charged but not applied', () => {
    const charged = (id: string) =>
      payment({ id, failure_reason: REFUND_WORDING });

    it('says so once at the top, however many attempts were charged', async () => {
      const el = await openWith(
        invoice({ payments: [charged('p1'), charged('p2')] }),
      );

      const notices = all(el, 'charged-notice');
      expect(notices).toHaveLength(1);
      expect(text(notices[0])).toContain(
        'Contact us and quote invoice HH-2026-0007.',
      );
      expect(
        notices[0]
          .querySelector('[data-testid="charged-contact-us"]')
          ?.getAttribute('href'),
      ).toMatch(/\/contact$/);
      // The top notice comes before the summary.
      const summary = el.querySelector('hh-invoice-summary') as Element;
      expect(
        notices[0].compareDocumentPosition(summary) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // Not repeated above Pay; each attempt still carries its own note.
      expect(byTestId(el, 'attempt-notice')).toBeNull();
      expect(
        el.querySelectorAll('hh-payment-attempts [data-field="note"]'),
      ).toHaveLength(2);
    });

    it.each([
      ['paid', paid({ invoice_pdf_url: PDF_URL, payments: [charged('p1')] })],
      [
        'void',
        invoice({ status: status('void', 'Void'), payments: [charged('p1')] }),
      ],
    ])('shows on a %s invoice too', async (_label, inv) => {
      const el = await openWith(inv);

      expect(all(el, 'charged-notice')).toHaveLength(1);
    });

    it('is absent when nothing was charged', async () => {
      const el = await openWith(invoice({ payments: [payment()] }));

      expect(byTestId(el, 'charged-notice')).toBeNull();
    });
  });

  describe('paid invoice receipt', () => {
    it('links the PDF in a new tab when it is ready', async () => {
      const el = await openWith(paid({ invoice_pdf_url: PDF_URL }));

      const link = byTestId(el, 'download-pdf');
      expect(link?.tagName).toBe('A');
      expect(link?.getAttribute('href')).toBe(PDF_URL);
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(text(link)).toBe('hostBillingHistory.downloadPdf');
      expect(byTestId(el, 'receipt-preparing')).toBeNull();
      expect(byTestId(el, 'pay')).toBeNull();
      expect(byTestId(el, 'pay-forbidden')).toBeNull();
      expect(api.invoice).toHaveBeenCalledTimes(1);
    });

    it('polls while the receipt is prepared, then shows it without a reload', async () => {
      const el = await open();
      vi.useFakeTimers();
      respond(paid());

      const preparing = byTestId(el, 'receipt-preparing');
      expect(text(preparing)).toBe('hostBillingHistory.preparingReceipt');
      expect(preparing?.getAttribute('role')).toBe('status');
      expect(preparing?.getAttribute('aria-live')).toBe('polite');
      expect(byTestId(el, 'download-pdf')).toBeNull();

      tick(0);
      expect(api.invoice).toHaveBeenCalledTimes(2);
      respond(paid());
      tick(2500);
      expect(api.invoice).toHaveBeenCalledTimes(3);
      respond(paid({ invoice_pdf_url: PDF_URL }));

      expect(byTestId(el, 'download-pdf')?.getAttribute('href')).toBe(PDF_URL);
      expect(byTestId(el, 'receipt-preparing')).toBeNull();

      tick(10_000);
      expect(api.invoice).toHaveBeenCalledTimes(3);
    });

    it('gives up after a minute and lets the host check again', async () => {
      const el = await open();
      vi.useFakeTimers();
      respond(paid());
      tick(0);
      respond(paid());

      tick(60_000);

      expect(byTestId(el, 'receipt-preparing')).toBeNull();
      expect(text(byTestId(el, 'receipt-slow'))).toBe(
        'hostBillingHistory.receiptSlow',
      );
      const calls = api.invoice.mock.calls.length;
      tick(10_000);
      expect(api.invoice).toHaveBeenCalledTimes(calls);

      byTestId(el, 'check-again')?.click();
      harness.detectChanges();

      expect(byTestId(el, 'receipt-preparing')).not.toBeNull();
      expect(byTestId(el, 'receipt-slow')).toBeNull();
      tick(0);
      expect(api.invoice).toHaveBeenCalledTimes(calls + 1);
      respond(paid({ invoice_pdf_url: PDF_URL }));

      expect(byTestId(el, 'download-pdf')).not.toBeNull();
    });

    it('gives up on the second round after a minute too, and offers another check', async () => {
      const el = await open();
      vi.useFakeTimers();
      respond(paid());
      tick(0);
      respond(paid());
      tick(60_000);
      expect(byTestId(el, 'receipt-slow')).not.toBeNull();

      byTestId(el, 'check-again')?.click();
      harness.detectChanges();
      expect(byTestId(el, 'receipt-preparing')).not.toBeNull();
      tick(0);
      respond(paid());
      tick(60_000);

      expect(byTestId(el, 'receipt-preparing')).toBeNull();
      expect(text(byTestId(el, 'receipt-slow'))).toBe(
        'hostBillingHistory.receiptSlow',
      );
      expect(byTestId(el, 'check-again')).not.toBeNull();
      const calls = api.invoice.mock.calls.length;
      tick(10_000);
      expect(api.invoice).toHaveBeenCalledTimes(calls);
    });

    it('keeps polling through a transient error', async () => {
      const el = await open();
      vi.useFakeTimers();
      respond(paid());
      tick(0);
      fail(apiError(500));

      expect(byTestId(el, 'receipt-preparing')).not.toBeNull();
      expect(byTestId(el, 'detail-load-error')).toBeNull();
      tick(2500);
      expect(api.invoice).toHaveBeenCalledTimes(3);
    });

    it('stops polling on a 403 and shows the no-access state', async () => {
      const el = await open();
      vi.useFakeTimers();
      respond(paid());
      tick(0);
      fail(apiError(403));

      expect(byTestId(el, 'detail-forbidden')).not.toBeNull();
      expect(byTestId(el, 'receipt')).toBeNull();
      tick(30_000);
      expect(api.invoice).toHaveBeenCalledTimes(2);
    });

    it('stops polling on a 404 and shows the not-found state', async () => {
      const el = await open();
      vi.useFakeTimers();
      respond(paid());
      tick(0);
      fail(apiError(404));

      expect(byTestId(el, 'detail-not-found')).not.toBeNull();
      tick(30_000);
      expect(api.invoice).toHaveBeenCalledTimes(2);
    });

    it('stops polling when the page is left', async () => {
      await open();
      vi.useFakeTimers();
      respond(paid());

      await router.navigateByUrl('/elsewhere');
      tick(30_000);

      expect(api.invoice).toHaveBeenCalledTimes(1);
    });

    it('stops polling when the hostel is switched', async () => {
      await open();
      vi.useFakeTimers();
      respond(paid());
      tick(0);
      respond(paid());
      // Keep the page mounted, so only an explicit stop can end the poll.
      const navigateByUrl = router.navigateByUrl.bind(router);
      vi.spyOn(router, 'navigateByUrl').mockImplementation((url, extras) =>
        typeof url === 'string' && url.endsWith('/subscription/invoices')
          ? Promise.resolve(true)
          : navigateByUrl(url, extras),
      );

      await router.navigateByUrl('/host/h2New/subscription/invoices/inv0Ab');
      harness.detectChanges();
      const calls = api.invoice.mock.calls.length;
      tick(30_000);

      expect(api.invoice).toHaveBeenCalledTimes(calls);
    });

    it('stops polling and loads the new invoice when the id changes', async () => {
      const el = await open();
      vi.useFakeTimers();
      respond(paid());

      await router.navigateByUrl('/host/nHelLt/subscription/invoices/inv2Cd');
      harness.detectChanges();

      expect(api.invoice).toHaveBeenCalledTimes(2);
      expect(api.invoice).toHaveBeenLastCalledWith('inv2Cd');
      expect(byTestId(el, 'detail-loading')).not.toBeNull();
      tick(30_000);
      expect(api.invoice).toHaveBeenCalledTimes(2);

      respond(invoice({ id: 'inv2Cd', number: 'HH-2026-0009' }));
      expect(text(el.querySelector('h2'))).toBe('Invoice HH-2026-0009');
    });
  });

  describe('void invoice', () => {
    it('explains the closing and offers neither Pay nor a PDF', async () => {
      const el = await openWith(
        invoice({
          status: status('void', 'Void'),
          invoice_pdf_url: PDF_URL,
        }),
      );

      expect(text(byTestId(el, 'void-note'))).toBe(
        'hostBillingHistory.voidNote',
      );
      expect(byTestId(el, 'pay')).toBeNull();
      expect(byTestId(el, 'pay-forbidden')).toBeNull();
      expect(byTestId(el, 'receipt')).toBeNull();
      expect(el.querySelector(`a[href="${PDF_URL}"]`)).toBeNull();
    });
  });

  describe('unknown status', () => {
    it('offers neither Pay nor a PDF but still shows the summary and attempts', async () => {
      const el = await openWith(
        invoice({
          status: status('disputed', 'Under dispute'),
          invoice_pdf_url: PDF_URL,
          payments: [payment()],
        }),
      );

      expect(byTestId(el, 'pay')).toBeNull();
      expect(byTestId(el, 'pay-forbidden')).toBeNull();
      expect(byTestId(el, 'receipt')).toBeNull();
      expect(byTestId(el, 'void-note')).toBeNull();
      expect(el.querySelector(`a[href="${PDF_URL}"]`)).toBeNull();
      expect(el.querySelector('hh-invoice-summary')).not.toBeNull();
      expect(el.querySelectorAll('[data-testid="attempt"]')).toHaveLength(1);
    });
  });

  describe('summary', () => {
    it('shows the plan, each line and the total exactly as the detail payload has them', async () => {
      const el = await openWith(
        invoice({
          total: '4800',
          plan: {
            id: 'pPro',
            code: 'pro',
            name: 'Professional',
            features: [],
          },
          lines: [
            { description: 'Professional plan, annual', amount: '6000' },
            { description: 'Launch discount', amount: '-1500' },
          ],
        }),
      );
      const summary = el.querySelector('hh-invoice-summary') as HTMLElement;
      const lines = Array.from(
        summary.querySelectorAll('[data-field="line"] dt'),
      ).map((n) => text(n));

      expect(text(summary.querySelector('[data-field="plan"] dd'))).toBe(
        'Professional',
      );
      expect(lines).toEqual(['Professional plan, annual', 'Launch discount']);
      // The lines sum to 4,500; the server's 4,800 must be shown, not a recomputed figure.
      const total = text(
        summary.querySelector('[data-field="total"] bdi'),
      ).replace(/[⁦-⁩]/g, '');
      expect(total).toBe('PKR 4,800');
      expect(total).not.toContain('4,500');
    });
  });

  describe('money', () => {
    it('never converts or adds up an amount', () => {
      const dir = dirname(fileURLToPath(import.meta.url));
      for (const file of [
        'billing-invoice-detail.ts',
        'billing-invoice-detail.html',
      ]) {
        const source = readFileSync(join(dir, file), 'utf8');

        expect(source).not.toMatch(/\bNumber\(|parseFloat|total_minor/);
        expect(source).not.toMatch(/\.total\s*[-+*/]|reduce\(/);
      }
    });
  });

  describe('error handling rules', () => {
    it.each([
      'billing-invoices.ts',
      'billing-invoices.html',
      'billing-invoice-detail.ts',
      'billing-invoice-detail.html',
      'payment-attempts.ts',
    ])('%s does not use the subscription-error helper', (file) => {
      const dir = dirname(fileURLToPath(import.meta.url));

      expect(readFileSync(join(dir, file), 'utf8')).not.toContain(
        'isSubscriptionError',
      );
    });
  });

  describe('payment attempts', () => {
    it('lists every attempt, newest first, quoting the invoice number', async () => {
      const el = await openWith(
        invoice({
          payments: [
            payment({ id: 'p1', amount: '1000' }),
            payment({
              id: 'p2',
              amount: '18',
              currency: 'USD',
              failure_reason: REFUND_WORDING,
            }),
          ],
        }),
      );
      const rows = Array.from(el.querySelectorAll('[data-testid="attempt"]'));

      expect(
        rows.map((r) => text(r.querySelector('[data-field="amount"]'))),
      ).toEqual(['$18', 'PKR 1,000']);
      expect(text(rows[0].querySelector('[data-field="note"]'))).toContain(
        'HH-2026-0007',
      );
    });
  });

  describe('back to billing history', () => {
    it('returns to the unfiltered list by default', async () => {
      const el = await openWith(invoice());

      expect(backHref(el)).toMatch(/\/host\/nHelLt\/subscription\/invoices$/);
      expect(text(byTestId(el, 'back-to-history'))).toBe(
        'hostBillingHistory.backToHistory',
      );
    });

    it('keeps the filter and page the history handed over', async () => {
      const el = await open({
        state: { billingHistoryQuery: { status: 'paid', page: 2 } },
      });
      respond(invoice());

      expect(backHref(el)).toMatch(
        /\/host\/nHelLt\/subscription\/invoices\?status=paid&page=2$/,
      );
    });

    it('ignores state that is not a history query', async () => {
      const el = await open({
        state: { billingHistoryQuery: { status: 42, page: 'x', evil: 'y' } },
      });

      expect(backHref(el)).toMatch(/\/subscription\/invoices$/);
    });
  });

  describe('hostel switch', () => {
    it("leaves for the new hostel's history, replacing the URL", async () => {
      await openWith(invoice());
      const navigateByUrl = router.navigateByUrl.bind(router);
      const spy = vi
        .spyOn(router, 'navigateByUrl')
        .mockImplementation((url, extras) =>
          typeof url === 'string' && url.endsWith('/subscription/invoices')
            ? Promise.resolve(true)
            : navigateByUrl(url, extras),
        );

      await router.navigateByUrl('/host/h2New/subscription/invoices/inv0Ab');
      harness.detectChanges();

      expect(spy).toHaveBeenCalledWith(
        expect.stringMatching(/\/host\/h2New\/subscription\/invoices$/),
        { replaceUrl: true },
      );
    });

    it('does not redirect on the first hostel id', async () => {
      await open();
      const spy = vi.spyOn(router, 'navigateByUrl');
      respond(invoice());

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('never on screen', () => {
    it('renders no reason, refund wording, tracker, reference or proof', async () => {
      const el = await openWith(
        paid({
          invoice_pdf_url: PDF_URL,
          payments: [
            payment({
              id: 'p1',
              failure_reason: REFUND_WORDING,
              reference: 'BANK-REF-SECRET',
              gateway_reference: 'trk_SECRET_GATEWAY_REF',
              proof_url: 'https://cdn.example/proof-SECRET.png',
            }),
            payment({
              id: 'p2',
              status: status('succeeded', 'Succeeded'),
              failure_reason: null,
              reference: 'BANK-REF-2',
              gateway_reference: 'trk_SECOND',
              succeeded_at: '2026-10-12T14:00:00+05:00',
            }),
          ],
        }),
      );
      const html = el.innerHTML;

      for (const secret of ['Charged at', 'BANK-REF', 'trk_', 'proof-SECRET']) {
        expect(html).not.toContain(secret);
      }
      expect(html.toLowerCase()).not.toContain('refund');
    });
  });
});
