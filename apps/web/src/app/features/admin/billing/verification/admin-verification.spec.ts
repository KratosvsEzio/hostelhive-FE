import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';
import type {
  AdminPaymentRow,
  BillingInvoice,
  BillingPayment,
} from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { API_ERROR_NOTIFIER, SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { HH_LINK_LOCALISER, type HhLinkCommands } from '@hostelhive/ui';
import {
  type LinkCommands,
  localiseCommands,
} from '@core/i18n/locale-commands';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AdminVerification } from './admin-verification';

const BASE = 'https://api.test';
const LIST = `${BASE}/api/admin/payments`;

const COPY = {
  adminBilling: {
    titles: { verification: 'Payments to verify' },
    tabs: {
      verify: 'To verify',
      verifyCount: 'To verify ({{count}})',
    },
    invoices: { title: 'Invoice {{number}}' },
    common: {
      loadError: "We couldn't load this. Try again.",
      retry: 'Try again',
      datesUtc: 'Dates are in UTC.',
      cancel: 'Cancel',
      close: 'Close',
    },
    errors: { forbidden: 'Only HostelHive admins can see billing.' },
    columns: {
      hostel: 'Hostel',
      invoice: 'Invoice',
      amount: 'Amount',
      method: 'Method',
      reference: 'Reference',
      submitted: 'Submitted',
    },
    method: { bankTransfer: 'Bank transfer', cash: 'Cash' },
    paymentStatus: {
      awaiting: 'Awaiting verification',
      succeeded: 'Succeeded',
      failed: 'Failed',
    },
    verification: {
      review: 'Review',
      verify: 'Verify',
      reject: 'Reject',
      verifyTitle: 'Verify this bank transfer?',
      verifyMessage: 'Verify {{amount}} {{reference}} {{number}}',
      verifyConfirm: 'Verify payment',
      verifiedNotice: 'Payment verified. Invoice {{number}} is paid.',
      rejectedNotice: 'Payment rejected. The host has been emailed.',
      verifyNotApplied: "This payment wasn't applied: {{reason}}",
      verifyNotAppliedNext: "The host hasn't been told.",
      rejectTitle: 'Reject this bank transfer?',
      rejectConfirm: 'Reject payment',
      emptyTitle: 'Nothing to verify',
      emptyBody: 'Bank transfers waiting for a check will appear here.',
      seeAllPayments: 'See all payments',
    },
  },
};

function row(over: Partial<AdminPaymentRow> = {}): AdminPaymentRow {
  return {
    id: 'pAy9X',
    hostel_id: 'hOs3L',
    invoice_id: 'iNv7Q',
    payment_method: 'bank_transfer',
    currency: 'PKR',
    amount: '5250.00',
    reference: 'TRX-8812',
    gateway_reference: null,
    failure_reason: null,
    verified_at: null,
    succeeded_at: null,
    created_at: '2026-10-09T07:15:00Z',
    verified_by: null,
    invoice: {
      id: 'iNv7Q',
      number: 'HH-2026-000123',
      kind: 'new',
      status: 'open',
      plan: { code: 'crm', name: 'Listing + CRM' },
    },
    hostel: { id: 'hOs3L', name: 'Gulberg Heights' },
    status: {
      id: 2,
      name: 'Awaiting verification',
      slug: 'awaiting-verification',
    },
    ...over,
  };
}

const OLDEST = row();
const NEWER = row({
  id: 'pAy2K',
  hostel_id: 'hMdl8',
  invoice_id: 'iNv4R',
  payment_method: 'cash',
  currency: 'USD',
  amount: '18.50',
  reference: null,
  created_at: '2026-10-10T16:40:00Z',
  invoice: {
    id: 'iNv4R',
    number: 'HH-2026-000207',
    kind: 'renewal',
    status: 'open',
    plan: { code: 'boost', name: 'Listing + Boost' },
  },
  hostel: { id: 'hMdl8', name: 'Model Town Lodge' },
});

function listBody(
  rows: AdminPaymentRow[],
  pagination: Record<string, number | null> = {},
) {
  return {
    success: true,
    payments: rows,
    possible_statuses: [],
    pagination: {
      current_page: 1,
      total_pages: 1,
      total_count: rows.length,
      next_page: null,
      ...pagination,
    },
  };
}

function detailOf(r: AdminPaymentRow, over: Partial<BillingPayment> = {}) {
  const payment: BillingPayment = {
    id: r.id,
    status: r.status,
    payment_method: r.payment_method,
    amount: r.amount,
    currency: r.currency,
    reference: r.reference,
    gateway_reference: r.gateway_reference,
    failure_reason: r.failure_reason,
    proof_url: null,
    verified_at: null,
    succeeded_at: null,
    created_at: r.created_at,
    invoice_id: r.invoice_id,
    ...over,
  };
  const invoice: BillingInvoice = {
    id: r.invoice_id,
    number: r.invoice!.number,
    kind: r.invoice!.kind,
    currency: r.currency,
    total: r.amount,
    period_start: null,
    period_end: null,
    expires_at: null,
    paid_at: null,
    voided_at: null,
    created_at: r.created_at,
    invoice_pdf_url: null,
    plan: null,
    lines: [],
    status: { id: 1, name: 'Open', slug: 'open' },
    payments: [payment],
  };
  return { success: true, payment, invoice };
}

const SUCCEEDED = { id: 3, name: 'Succeeded', slug: 'succeeded' };

@Component({ template: '' })
class Blank {}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('AdminVerification', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let router: Router;

  async function open(url = '/en/admin/billing/verification') {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'en/admin/billing',
            children: [
              { path: 'verification', component: AdminVerification },
              { path: 'payments', component: Blank },
            ],
          },
          { path: '**', component: Blank },
        ]),
        provideI18nTesting(),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: API_ERROR_NOTIFIER, useValue: vi.fn() },
        // The app's own localiser, so table links carry the language prefix as they do live.
        {
          provide: HH_LINK_LOCALISER,
          useValue: (link: HhLinkCommands) =>
            localiseCommands(link as LinkCommands, 'en'),
        },
      ],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await settle();
  }

  async function settle(): Promise<void> {
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  const el = () => harness.routeNativeElement as HTMLElement;
  const q = (sel: string) => el().querySelector<HTMLElement>(sel);
  const listRequest = (): TestRequest =>
    http.expectOne((r) => r.url === LIST);
  const params = (req: TestRequest) =>
    Object.fromEntries(
      req.request.params.keys().map((k) => [k, req.request.params.get(k)]),
    );
  const bodyRows = () =>
    Array.from(el().querySelectorAll<HTMLElement>('tbody tr'));
  const verifyTab = () => text(q('[data-testid="tab-verification"]'));

  async function respond(
    rows: AdminPaymentRow[],
    pagination?: Record<string, number | null>,
  ): Promise<void> {
    listRequest().flush(listBody(rows, pagination));
    await settle();
  }

  /** Opens a row's drawer and answers its detail fetch. */
  async function review(index: number, r: AdminPaymentRow): Promise<void> {
    bodyRows()[index].click();
    await settle();
    http.expectOne(`${BASE}/api/admin/payments/${r.id}`).flush(detailOf(r));
    await settle();
  }

  async function verify(r: AdminPaymentRow, body: object | null): Promise<void> {
    (q('[data-testid="verify"]') as HTMLButtonElement).click();
    await settle();
    const buttons = el().querySelectorAll<HTMLButtonElement>(
      '[data-testid="verify-dialog"] button',
    );
    buttons[buttons.length - 1].click();
    await settle();
    http.expectOne(`${BASE}/api/admin/payments/${r.id}/verify`).flush(body);
    await settle();
  }

  afterEach(() => {
    try {
      http?.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('asks for transfers awaiting verification, oldest first, quietly', async () => {
    await open();
    const req = listRequest();

    expect(params(req)).toEqual({
      page: '1',
      limit: '20',
      'f[status.slug]': 'awaiting-verification',
      'sort[created_at]': 'asc',
    });
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    req.flush(listBody([]));
    await settle();
  });

  it('lists each transfer with its hostel link, amount in its own currency, and the count in the tab', async () => {
    await open();
    await respond([OLDEST, NEWER], { total_count: 2 });

    const rows = bodyRows();
    expect(rows).toHaveLength(2);
    const cells = (r: HTMLElement) =>
      Array.from(r.querySelectorAll('td')).map((td) => text(td));
    expect(cells(rows[0])).toEqual([
      'Gulberg Heights',
      'HH-2026-000123 Listing + CRM',
      '⁨PKR 5,250⁩',
      'Bank transfer',
      'TRX-8812',
      '9 Oct 2026, 07:15',
      'Review',
    ]);
    expect(cells(rows[1])).toEqual([
      'Model Town Lodge',
      'HH-2026-000207 Listing + Boost',
      '⁨$18.50⁩',
      'Cash',
      '—',
      '10 Oct 2026, 16:40',
      'Review',
    ]);
    expect(
      rows[1].querySelector('a')?.getAttribute('href'),
    ).toBe('/en/admin/billing/hostels/hMdl8');
    expect(verifyTab()).toBe('To verify (2)');
    expect(text(el())).toContain('Dates are in UTC.');
  });

  it('shows the empty state with a way to all payments', async () => {
    await open();
    await respond([]);

    expect(text(q('[data-testid="queue-empty"]'))).toContain(
      'Nothing to verify',
    );
    expect(
      q('[data-testid="see-all-payments"]')?.getAttribute('href'),
    ).toBe('/en/admin/billing/payments');
    expect(q('[data-testid="queue-table"]')).toBeNull();
    expect(verifyTab()).toBe('To verify (0)');
  });

  it('offers a retry when the queue fails to load', async () => {
    await open();
    listRequest().flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    const error = q('[data-testid="queue-error"]');
    expect(text(error)).toContain("We couldn't load this. Try again.");
    (error!.querySelector('button') as HTMLButtonElement).click();
    await settle();

    await respond([OLDEST]);
    expect(bodyRows()).toHaveLength(1);
  });

  it('shows our own copy on a 403, with no table and no retry', async () => {
    await open();
    listRequest().flush(
      { errors: ['Access denied'] },
      { status: 403, statusText: 'Forbidden' },
    );
    await settle();

    const forbidden = q('[data-testid="queue-forbidden"]');
    expect(text(forbidden)).toContain('Only HostelHive admins can see billing.');
    expect(text(forbidden)).not.toContain('Access denied');
    expect(forbidden!.querySelector('button')).toBeNull();
    expect(q('[data-testid="queue-table"]')).toBeNull();
    expect(verifyTab()).toBe('To verify');
  });

  it('drops a verified transfer at once and keeps it gone when the lagging index still returns it', async () => {
    await open();
    await respond([OLDEST, NEWER], { total_count: 2 });
    await review(0, OLDEST);

    await verify(
      OLDEST,
      detailOf(OLDEST, {
        status: SUCCEEDED,
        verified_at: '2026-10-11T08:00:00Z',
        succeeded_at: '2026-10-11T08:00:00Z',
      }),
    );

    expect(text(q('[data-testid="notice"]'))).toBe(
      'Payment verified. Invoice HH-2026-000123 is paid.',
    );
    expect(q('[data-testid="payment-drawer"]')).toBeNull();
    expect(verifyTab()).toBe('To verify (1)');

    // The index has not caught up yet: the refetch still lists the payment.
    await respond([OLDEST, NEWER], { total_count: 2 });
    expect(bodyRows().map((r) => text(r.querySelector('td')))).toEqual([
      'Model Town Lodge',
    ]);
    expect(verifyTab()).toBe('To verify (1)');
  });

  it('keeps the drawer open on a transfer that did not apply, and drops it from the queue', async () => {
    await open();
    await respond([OLDEST, NEWER], { total_count: 2 });
    await review(0, OLDEST);

    await verify(
      OLDEST,
      detailOf(OLDEST, {
        status: { id: 4, name: 'Failed', slug: 'failed' },
        failure_reason: 'Invoice HH-2026-000123 is already paid',
      }),
    );

    expect(text(q('[data-testid="not-applied"]'))).toContain(
      'Invoice HH-2026-000123 is already paid',
    );
    expect(q('[data-testid="notice"]')).toBeNull();

    await respond([OLDEST, NEWER], { total_count: 2 });
    expect(q('[data-testid="payment-drawer"]')).not.toBeNull();
    expect(bodyRows()).toHaveLength(1);
    expect(verifyTab()).toBe('To verify (1)');
  });

  it('refetches the queue after a 422 and keeps the row the server still lists', async () => {
    await open();
    await respond([OLDEST], { total_count: 1 });
    await review(0, OLDEST);

    (q('[data-testid="verify"]') as HTMLButtonElement).click();
    await settle();
    const buttons = el().querySelectorAll<HTMLButtonElement>(
      '[data-testid="verify-dialog"] button',
    );
    buttons[buttons.length - 1].click();
    await settle();
    http
      .expectOne(`${BASE}/api/admin/payments/${OLDEST.id}/verify`)
      .flush(
        { errors: ['Only a payment awaiting verification can be verified'] },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await settle();

    expect(text(q('[data-testid="action-error"]'))).toBe(
      'Only a payment awaiting verification can be verified',
    );
    http
      .expectOne(`${BASE}/api/admin/payments/${OLDEST.id}`)
      .flush(detailOf(OLDEST, { status: SUCCEEDED }));
    await settle();

    // The server still lists it, so a stale payment is neither hidden nor does the count drop.
    await respond([OLDEST], { total_count: 1 });
    expect(bodyRows()).toHaveLength(1);
    expect(text(bodyRows()[0].querySelector('td'))).toBe('Gulberg Heights');
    expect(verifyTab()).toBe('To verify (1)');
    expect(q('[data-testid="queue-empty"]')).toBeNull();
    // The drawer stays open on the refreshed payment, not the one it had.
    expect(q('[data-testid="payment-drawer"]')).not.toBeNull();
    expect(text(q('[data-field="status"]'))).toBe('Succeeded');
    expect(q('[data-testid="verify"]')).toBeNull();
    expect(text(q('[data-testid="action-error"]'))).toBe(
      'Only a payment awaiting verification can be verified',
    );
  });

  it('rejects from the queue: notice, drawer closed, row gone, count down, and still gone when the lagging index returns it', async () => {
    await open();
    await respond([OLDEST, NEWER], { total_count: 2 });
    await review(0, OLDEST);

    (q('[data-testid="reject"]') as HTMLButtonElement).click();
    await settle();
    const reason = q('[data-testid="reject-reason"]') as HTMLTextAreaElement;
    reason.value = '  Funds never reached account 4471  ';
    reason.dispatchEvent(new Event('input'));
    await settle();
    const buttons = el().querySelectorAll<HTMLButtonElement>(
      '[data-testid="reject-dialog"] button',
    );
    buttons[buttons.length - 1].click();
    await settle();

    const req = http.expectOne(`${BASE}/api/admin/payments/${OLDEST.id}/reject`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ reason: 'Funds never reached account 4471' });
    req.flush(
      detailOf(OLDEST, {
        status: { id: 4, name: 'Failed', slug: 'failed' },
        failure_reason: 'Funds never reached account 4471',
      }),
    );
    await settle();

    expect(text(q('[data-testid="notice"]'))).toBe(
      'Payment rejected. The host has been emailed.',
    );
    expect(q('[data-testid="payment-drawer"]')).toBeNull();
    expect(text(el())).not.toContain('Gulberg Heights');
    expect(verifyTab()).toBe('To verify (1)');

    // The index has not caught up yet: the refetch still lists the rejected payment.
    await respond([OLDEST, NEWER], { total_count: 2 });
    expect(bodyRows().map((r) => text(r.querySelector('td')))).toEqual([
      'Model Town Lodge',
    ]);
    expect(verifyTab()).toBe('To verify (1)');
  });

  it('steps back a page when the last transfer on a later page is handled', async () => {
    await open('/en/admin/billing/verification?page=2');
    const first = listRequest();
    expect(params(first)['page']).toBe('2');
    first.flush(
      listBody([NEWER], { current_page: 2, total_pages: 2, total_count: 21 }),
    );
    await settle();
    await review(0, NEWER);

    await verify(NEWER, detailOf(NEWER, { status: SUCCEEDED }));
    await settle();

    expect(router.url).toBe('/en/admin/billing/verification');
    const next = listRequest();
    expect(params(next)['page']).toBe('1');
    next.flush(listBody([OLDEST], { total_count: 20 }));
    await settle();
    expect(bodyRows()).toHaveLength(1);
  });
});
