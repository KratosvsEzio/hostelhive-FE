import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import type { BillingInvoice, BillingPayment } from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AdminInvoiceDrawer } from './admin-invoice-drawer';

const BASE = 'https://api.test';

// Admin wording differs from the server's status names, so a label proves which one is shown.
const COPY = {
  adminBilling: {
    invoices: { title: 'Invoice {{number}}' },
    common: {
      viewInvoice: 'View invoice',
      viewHostelBilling: 'View hostel billing',
      preparing: 'Preparing…',
      datesUtc: 'Dates are in UTC.',
      loadError: "We couldn't load this. Try again.",
      retry: 'Try again',
    },
    errors: {
      forbidden: 'Only HostelHive admins can see billing.',
      notFound: 'This was changed or removed.',
      generic: 'Something went wrong. Try again.',
      network: "We couldn't reach HostelHive.",
    },
    columns: { issued: 'Issued', paid: 'Paid', pdf: 'PDF' },
    fields: {
      expires: 'Expires',
      voided: 'Voided',
      failureReason: 'Failure reason',
    },
    invoiceStatus: { open: 'Open', paid: 'Paid', void: 'Void' },
    kind: { new: 'New plan', renewal: 'Renewal', upgrade: 'Upgrade' },
    verification: { attemptsTitle: 'Payment attempts' },
    paymentStatus: { failed: 'Failed', succeeded: 'Succeeded' },
    method: {
      safepay: 'Safepay',
      bankTransfer: 'Bank transfer',
      other: 'Other',
    },
  },
};

const FAILED: BillingPayment = {
  id: 'pAyF1',
  status: { id: 4, name: 'Failed', slug: 'failed' },
  payment_method: 'bank_transfer',
  amount: '7250.00',
  currency: 'PKR',
  reference: 'TRX-88',
  gateway_reference: null,
  failure_reason: 'Amount or currency does not match invoice HH-2026-000431',
  proof_url: null,
  verified_at: null,
  succeeded_at: null,
  created_at: '2026-10-09T08:15:00Z',
  invoice_id: 'iNv431',
  initiated_by: 'customer',
};

function invoice(over: Partial<BillingInvoice> = {}): BillingInvoice {
  return {
    id: 'iNv431',
    number: 'HH-2026-000431',
    kind: 'renewal',
    currency: 'PKR',
    total: '7250.00',
    period_start: '2026-11-01T00:00:00Z',
    period_end: '2026-12-01T00:00:00Z',
    expires_at: '2026-10-12T21:30:00Z',
    paid_at: null,
    voided_at: null,
    created_at: '2026-10-09T21:30:00Z',
    invoice_pdf_url: null,
    plan: { id: 'pLnPro', code: 'pro', name: 'Pro Listing', features: [] },
    lines: [
      { description: 'Pro Listing, 1 month', amount: '7000.00' },
      { description: 'Featured placement', amount: '250.00' },
    ],
    status: { id: 1, name: 'Payment due', slug: 'open' },
    payments: [FAILED],
    ...over,
  } as BillingInvoice;
}

@Component({ template: '' })
class Blank {}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('AdminInvoiceDrawer', () => {
  let fixture: ComponentFixture<AdminInvoiceDrawer>;
  let http: HttpTestingController;
  let closed: number;

  function render(
    invoiceId = 'iNv431',
    hostel: { id: string; name: string } | null = null,
  ): HTMLElement {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Blank }]),
        provideI18nTesting(),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
      ],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminInvoiceDrawer);
    fixture.componentRef.setInput('invoiceId', invoiceId);
    fixture.componentRef.setInput('hostel', hostel);
    closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function expectFetch(id: string): TestRequest {
    const req = http.expectOne(`${BASE}/api/admin/invoices/${id}`);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    return req;
  }

  function respond(body: BillingInvoice, id = body.id): void {
    expectFetch(id).flush({ invoice: body, success: true });
    fixture.detectChanges();
  }

  function fail(
    status: number,
    body: object | null = null,
    id = 'iNv431',
  ): void {
    expectFetch(id).flush(body, { status, statusText: 'Err' });
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const byTestId = (id: string) =>
    el().querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const field = (name: string) =>
    text(el().querySelector(`[data-field="${name}"]`));
  const heading = () => text(el().querySelector('hh-drawer h2'));

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('fetches the invoice by id and shows a skeleton until it arrives', () => {
    render();

    expect(byTestId('invoice-loading')).not.toBeNull();
    expect(heading()).toBe('View invoice');

    respond(invoice());

    expect(byTestId('invoice-loading')).toBeNull();
    expect(heading()).toBe('Invoice HH-2026-000431');
  });

  it('shows status, type, dates in UTC, the lines and the total for an open invoice', () => {
    render();
    respond(invoice());

    expect(field('status')).toBe('Open');
    expect(field('kind')).toBe('Renewal');
    expect(field('issued')).toBe('9 Oct 2026, 21:30');
    expect(field('expires')).toBe('12 Oct 2026, 21:30');
    expect(el().querySelector('[data-field="paid"]')).toBeNull();
    expect(text(byTestId('dates-utc'))).toBe('Dates are in UTC.');

    const summary = el().querySelector('hh-invoice-summary');
    const lines = Array.from(
      summary?.querySelectorAll('[data-field="line"]') ?? [],
    ).map((line) => [
      text(line.querySelector('dt')),
      text(line.querySelector('dd')),
    ]);
    expect(lines).toEqual([
      ['Pro Listing, 1 month', 'PKR 7,000'],
      ['Featured placement', 'PKR 250'],
    ]);
    expect(text(summary?.querySelector('[data-field="total"] dd'))).toBe(
      'PKR 7,250',
    );
    expect(text(summary?.querySelector('[data-field="plan"] dd'))).toBe(
      'Pro Listing',
    );
  });

  it('lists every payment attempt with its failure reason verbatim', () => {
    render();
    respond(invoice());

    const attempts = el().querySelectorAll(
      'hh-admin-payment-attempts [data-testid="attempt"]',
    );
    expect(attempts).toHaveLength(1);
    expect(text(attempts[0].querySelector('[data-field="method"]'))).toBe(
      'Bank transfer',
    );
    expect(
      text(attempts[0].querySelector('[data-field="failure-reason"]')),
    ).toBe('Amount or currency does not match invoice HH-2026-000431');
  });

  it('shows the paid date and the PDF link once paid', () => {
    render();
    respond(
      invoice({
        status: { id: 2, name: 'Settled', slug: 'paid' },
        paid_at: '2026-10-10T06:05:00Z',
        invoice_pdf_url: 'https://files.test/HH-2026-000431.pdf',
      }),
    );

    expect(field('status')).toBe('Paid');
    expect(field('paid')).toBe('10 Oct 2026, 06:05');
    expect(el().querySelector('[data-field="expires"]')).toBeNull();
    const pdf = byTestId('pdf-link') as HTMLAnchorElement;
    expect(pdf.getAttribute('href')).toBe(
      'https://files.test/HH-2026-000431.pdf',
    );
    expect(pdf.getAttribute('target')).toBe('_blank');
    expect(byTestId('pdf-preparing')).toBeNull();
  });

  it('says the PDF is being prepared when a paid invoice has none yet', () => {
    render();
    respond(
      invoice({
        status: { id: 2, name: 'Settled', slug: 'paid' },
        paid_at: '2026-10-10T06:05:00Z',
      }),
    );

    expect(text(byTestId('pdf-preparing'))).toBe('Preparing…');
    expect(byTestId('pdf-link')).toBeNull();
  });

  it('shows when a void invoice was voided, and no PDF state for it', () => {
    render();
    respond(
      invoice({
        status: { id: 3, name: 'Cancelled', slug: 'void' },
        voided_at: '2026-10-11T03:45:00Z',
      }),
    );

    expect(field('status')).toBe('Void');
    expect(field('voided')).toBe('11 Oct 2026, 03:45');
    expect(field('pdf')).toBe('—');
  });

  it('falls back to the server status name and a dash for unknowns', () => {
    render();
    respond(
      invoice({
        status: { id: 9, name: 'Refunded', slug: 'refunded' },
        kind: 'proration',
      }),
    );

    expect(field('status')).toBe('Refunded');
    expect(field('kind')).toBe('—');
  });

  it('links to the hostel billing page with the hostel in router state', async () => {
    render('iNv431', { id: 'hOsGreen', name: 'Green Hostel' });
    respond(invoice());

    const link = byTestId('hostel-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(
      '/en/admin/billing/hostels/hOsGreen',
    );
    expect(text(link)).toBe('View hostel billing · Green Hostel');

    const router = TestBed.inject(Router);
    link.click();
    await fixture.whenStable();
    expect(router.url).toBe('/en/admin/billing/hostels/hOsGreen');
    expect(router.lastSuccessfulNavigation()?.extras.state).toEqual({
      hostel: { id: 'hOsGreen', name: 'Green Hostel' },
    });
  });

  it('has no hostel link when the hostel is not known', () => {
    render();
    respond(invoice());

    expect(byTestId('hostel-link')).toBeNull();
  });

  it('refetches when the invoice id changes', () => {
    render();
    respond(invoice());

    fixture.componentRef.setInput('invoiceId', 'iNv500');
    fixture.detectChanges();
    respond(invoice({ id: 'iNv500', number: 'HH-2026-000500' }));

    expect(heading()).toBe('Invoice HH-2026-000500');
  });

  it('shows our own copy on a 403 and offers no retry', () => {
    render();
    fail(403, { errors: ['You are not an admin'] });

    const state = byTestId('invoice-forbidden');
    expect(text(state)).toContain('Only HostelHive admins can see billing.');
    expect(text(state)).not.toContain('You are not an admin');
    expect(state?.querySelector('button')).toBeNull();
  });

  it('says the invoice is gone on a 404 and tells the page to refetch its list', () => {
    render();
    let missing = 0;
    fixture.componentInstance.missing.subscribe(() => missing++);
    fail(404);

    expect(text(byTestId('invoice-not-found'))).toContain(
      'This was changed or removed.',
    );
    expect(missing).toBe(1);
  });

  it('does not ask for a refetch on other failures', () => {
    render();
    let missing = 0;
    fixture.componentInstance.missing.subscribe(() => missing++);
    fail(500);

    expect(missing).toBe(0);
  });

  it('shows a load error with a retry that fetches again', () => {
    render();
    fail(500);

    const state = byTestId('invoice-error') as HTMLElement;
    expect(text(state)).toContain("We couldn't load this. Try again.");
    const retry = Array.from(state.querySelectorAll('button')).find(
      (b) => text(b) === 'Try again',
    ) as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();

    respond(invoice());
    expect(field('status')).toBe('Open');
  });

  it('shows a 4xx message from the server verbatim', () => {
    render();
    fail(422, { errors: ['Invoice HH-2026-000431 is locked'] });

    expect(text(byTestId('invoice-error'))).toContain(
      'Invoice HH-2026-000431 is locked',
    );
  });

  it('emits closed from the close button', () => {
    render();
    respond(invoice());

    (
      el().querySelector('hh-drawer button[aria-label]') as HTMLButtonElement
    ).click();

    expect(closed).toBe(1);
  });
});
