import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';
import type {
  AdminPaymentRow,
  AdminStatusOption,
} from '@hostelhive/data-access';
import {
  GlobalFilter,
  HH_LINK_LOCALISER,
  type HhLinkCommands,
} from '@hostelhive/ui';
import { API_CONFIG } from '@core/api-config';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { API_ERROR_NOTIFIER, SUPPRESS_ERROR_TOAST } from '@core/tokens';
import {
  type LinkCommands,
  localiseCommands,
} from '@core/i18n/locale-commands';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AdminBillingPayments } from './admin-billing-payments';

const BASE = 'https://api.test';
const LIST = `${BASE}/api/admin/payments`;
const PATH = '/en/admin/billing/payments';

const COPY = {
  common: { showAll: 'Show all' },
  adminBilling: {
    titles: { payments: 'Payments' },
    invoices: { title: 'Invoice {{number}}' },
    common: {
      loadError: "We couldn't load this. Try again.",
      retry: 'Try again',
      datesUtc: 'Dates are in UTC.',
      searchHostel: 'Search by hostel name',
      filterAll: 'All',
      filterStatus: 'Status',
      filterMethod: 'Method',
      filterCurrency: 'Currency',
      filterCreated: 'Created',
      close: 'Close',
    },
    errors: { forbidden: 'Only HostelHive admins can see billing.' },
    columns: {
      hostel: 'Hostel',
      invoice: 'Invoice',
      method: 'Method',
      reference: 'Reference',
      tracker: 'Safepay tracker',
      amount: 'Amount',
      status: 'Status',
      created: 'Created',
      succeeded: 'Succeeded',
    },
    fields: { verifiedBy: 'Verified by' },
    paymentStatus: {
      pending: 'Pending',
      awaiting: 'Awaiting verification',
      succeeded: 'Succeeded',
      failed: 'Failed',
    },
    method: {
      safepay: 'Safepay',
      bankTransfer: 'Bank transfer',
      cash: 'Cash',
      adminGrant: 'Admin grant',
      other: 'Other',
    },
    refund: { badge: 'Refund needed' },
    verification: {
      verifiedNotice: 'Payment verified. Invoice {{number}} is paid.',
      rejectedNotice: 'Payment rejected. The host has been emailed.',
    },
    payments: {
      count: '{{count}} payments',
      noMatch: 'No payments match these filters.',
      empty: 'No payments yet.',
      amountSortHint: 'Pick one currency to sort by amount.',
    },
  },
};

const STATUSES: AdminStatusOption[] = [
  { id: 1, name: 'Pending', slug: 'pending' },
  { id: 2, name: 'Awaiting verification', slug: 'awaiting-verification' },
  { id: 3, name: 'Succeeded', slug: 'succeeded' },
  { id: 4, name: 'Failed', slug: 'failed' },
  { id: 5, name: 'Disputed', slug: 'disputed' },
];

const CHARGED_REASON =
  'Invoice HH-2026-000310 was voided. Charged at Safepay (trk_51Ab); refund it from the Safepay dashboard';

function row(over: Partial<AdminPaymentRow> = {}): AdminPaymentRow {
  return {
    id: 'pAy9X',
    hostel_id: 'hOs3L',
    invoice_id: 'iNv7Q',
    payment_method: 'safepay',
    currency: 'PKR',
    amount: '5250.00',
    reference: null,
    gateway_reference: 'trk_77Qe',
    failure_reason: null,
    verified_at: null,
    succeeded_at: '2026-10-09T07:16:00Z',
    created_at: '2026-10-09T07:15:00Z',
    verified_by: null,
    invoice: {
      id: 'iNv7Q',
      number: 'HH-2026-000123',
      kind: 'new',
      status: 'paid',
      plan: { code: 'crm', name: 'Listing + CRM' },
    },
    hostel: { id: 'hOs3L', name: 'Gulberg Heights' },
    status: { id: 3, name: 'Succeeded', slug: 'succeeded' },
    ...over,
  };
}

const PAID = row();
const REFUND = row({
  id: 'pRfd4',
  hostel_id: 'hMdl8',
  invoice_id: 'iNv9Z',
  currency: 'USD',
  amount: '18.50',
  gateway_reference: 'trk_51Ab',
  failure_reason: CHARGED_REASON,
  succeeded_at: null,
  created_at: '2026-10-10T16:40:00Z',
  invoice: {
    id: 'iNv9Z',
    number: 'HH-2026-000310',
    kind: 'renewal',
    status: 'void',
    plan: { code: 'boost', name: 'Listing + Boost' },
  },
  hostel: { id: 'hMdl8', name: 'Model Town Lodge' },
  status: { id: 4, name: 'Failed', slug: 'failed' },
});
const AWAITING = row({
  id: 'pBnk6',
  hostel_id: 'hKrc2',
  invoice_id: 'iNv4W',
  payment_method: 'bank_transfer',
  amount: '9300.00',
  reference: 'TRX-5571',
  gateway_reference: null,
  succeeded_at: null,
  created_at: '2026-10-11T09:30:00Z',
  invoice: {
    id: 'iNv4W',
    number: 'HH-2026-000557',
    kind: 'new',
    status: 'open',
    plan: { code: 'crm', name: 'Listing + CRM' },
  },
  hostel: { id: 'hKrc2', name: 'Clifton Court' },
  status: {
    id: 2,
    name: 'Awaiting verification',
    slug: 'awaiting-verification',
  },
});
const REJECTED = row({
  id: 'pRej2',
  hostel_id: 'hDha5',
  invoice_id: 'iNv3C',
  payment_method: 'bank_transfer',
  amount: '7100.00',
  reference: 'TRX-0042',
  gateway_reference: null,
  failure_reason: 'Transfer never arrived in the account',
  succeeded_at: null,
  verified_by: { id: 'uAdm1', name: 'Sana Admin' },
  created_at: '2026-10-08T05:00:00Z',
  invoice: {
    id: 'iNv3C',
    number: 'HH-2026-000098',
    kind: 'upgrade',
    status: 'open',
    plan: null,
  },
  hostel: { id: 'hDha5', name: 'DHA Residence' },
  status: { id: 4, name: 'Failed', slug: 'failed' },
});

function listBody(
  rows: AdminPaymentRow[],
  pagination: Record<string, number | null> = {},
) {
  return {
    success: true,
    payments: rows,
    possible_statuses: STATUSES,
    pagination: {
      current_page: 1,
      total_pages: 1,
      total_count: rows.length,
      next_page: null,
      ...pagination,
    },
  };
}

function detailBody(slug: string, name: string, statusId: number) {
  return {
    success: true,
    payment: {
      id: 'pBnk6',
      status: { id: statusId, name, slug },
      payment_method: 'bank_transfer',
      amount: '9300.00',
      currency: 'PKR',
      reference: 'TRX-5571',
      gateway_reference: null,
      failure_reason: null,
      proof_url: null,
      verified_at: null,
      succeeded_at: null,
      created_at: '2026-10-11T09:30:00Z',
      invoice_id: 'iNv4W',
    },
    invoice: {
      id: 'iNv4W',
      number: 'HH-2026-000557',
      kind: 'new',
      currency: 'PKR',
      total: '9300.00',
      period_start: null,
      period_end: null,
      expires_at: '2026-10-16T09:00:00Z',
      paid_at: null,
      voided_at: null,
      created_at: '2026-10-11T09:00:00Z',
      invoice_pdf_url: null,
      plan: {
        id: 'pLnCr',
        code: 'crm',
        name: 'Listing + CRM',
        features: ['crm'],
      },
      lines: [{ description: 'Listing + CRM, 1 month', amount: '9300.00' }],
      status: { id: 1, name: 'Open', slug: 'open' },
      payments: [],
    },
  };
}

@Component({ template: '' })
class Blank {}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('AdminBillingPayments', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let router: Router;

  async function open(url = PATH): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'en/admin/billing',
            children: [{ path: 'payments', component: AdminBillingPayments }],
          },
          { path: '**', component: Blank },
        ]),
        provideI18nTesting(),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: API_ERROR_NOTIFIER, useValue: vi.fn() },
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
  const header = (label: string) =>
    Array.from(el().querySelectorAll<HTMLElement>('thead th')).find(
      (th) => text(th) === label,
    );
  const urlParams = () =>
    Object.fromEntries(new URL(router.url, 'http://x').searchParams);

  async function respond(
    rows: AdminPaymentRow[],
    pagination?: Record<string, number | null>,
  ): Promise<TestRequest> {
    const req = listRequest();
    req.flush(listBody(rows, pagination));
    await settle();
    return req;
  }

  afterEach(() => {
    try {
      http?.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('asks for every payment newest first, quietly, and shows the server count with no totals', async () => {
    await open();
    const req = listRequest();
    expect(params(req)).toEqual({
      page: '1',
      limit: '20',
      'sort[created_at]': 'desc',
    });
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    req.flush(
      listBody([PAID, REFUND], {
        total_count: 37,
        total_pages: 2,
        next_page: 2,
      }),
    );
    await settle();

    expect(text(q('[data-testid="payments-count"]'))).toBe('37 payments');
    expect(bodyRows()).toHaveLength(2);
    // Each amount in its own currency; nothing adds them up.
    expect(text(el())).toContain('⁨PKR 5,250⁩');
    expect(text(el())).toContain('⁨$18.50⁩');
    expect(text(el())).not.toMatch(/5,268|5268/);
  });

  it('renders each column, with the hostel linking to its billing page', async () => {
    await open();
    await respond([PAID, REJECTED]);

    const cells = (r: HTMLElement) =>
      Array.from(r.querySelectorAll('td')).map((td) => text(td));
    expect(cells(bodyRows()[1])).toEqual([
      'DHA Residence',
      'HH-2026-000098',
      'Bank transfer',
      'TRX-0042',
      '—',
      '⁨PKR 7,100⁩',
      'Failed',
      'Sana Admin',
      '8 Oct 2026, 05:00',
      '—',
    ]);
    expect(cells(bodyRows()[0])[4]).toBe('trk_77Qe');
    expect(bodyRows()[1].querySelector('a')?.getAttribute('href')).toBe(
      '/en/admin/billing/hostels/hDha5',
    );
    expect(text(el())).toContain('Dates are in UTC.');
  });

  it('flags only a payment Safepay charged but never applied', async () => {
    await open();
    await respond([PAID, REFUND, REJECTED]);

    const status = (i: number) => bodyRows()[i].querySelectorAll('td')[6];
    expect(
      Array.from(status(1).querySelectorAll('span')).map((s) => text(s)),
    ).toEqual(['Failed', 'Refund needed']);
    expect(status(1).querySelector('.bg-danger\\/10')).not.toBeNull();
    expect(text(status(2))).toBe('Failed');
    expect(text(status(0))).toBe('Succeeded');
  });

  it('restores every filter, the sort and the page from the URL', async () => {
    await open(
      `${PATH}?status=failed&method=safepay&currency=USD&from=2026-10-01&to=2026-10-05&hostel=Gulberg&sort=amount_minor&dir=asc&page=2`,
    );
    const req = listRequest();

    expect(params(req)).toEqual({
      page: '2',
      limit: '20',
      'f[status.slug]': 'failed',
      'f[payment_method]': 'safepay',
      'f[currency]': 'USD',
      'f[created_at][gte]': '2026-10-01T00:00:00',
      'f[created_at][lte]': '2026-10-05T23:59:59',
      's[hostel.name]': 'Gulberg',
      'sort[amount_minor]': 'asc',
    });
    req.flush(listBody([REFUND], { current_page: 2, total_pages: 2 }));
    await settle();

    const filter = harness.fixture.debugElement.query(By.directive(GlobalFilter))
      .componentInstance as GlobalFilter;
    expect(filter.value()).toEqual({
      status: 'failed',
      method: 'safepay',
      currency: 'USD',
      created: { from: '2026-10-01', to: '2026-10-05' },
    });
  });

  it('ignores an amount sort while no currency is filtered, and says why', async () => {
    await open(`${PATH}?sort=amount_minor&dir=asc`);
    const req = await respond([PAID, REFUND]);

    expect(params(req)['sort[created_at]']).toBe('desc');
    expect(params(req)['sort[amount_minor]']).toBeUndefined();
    expect(header('Amount')?.querySelector('.ti')).toBeNull();
    expect(text(q('[data-testid="amount-sort-hint"]'))).toBe(
      'Pick one currency to sort by amount.',
    );

    // The header is inert: no navigation, no new request.
    const before = router.url;
    header('Amount')!.click();
    await settle();
    expect(router.url).toBe(before);
    http.expectNone((r) => r.url === LIST);
  });

  it('sorts by amount once one currency is filtered', async () => {
    await open(`${PATH}?currency=PKR`);
    await respond([PAID]);

    expect(q('[data-testid="amount-sort-hint"]')).toBeNull();
    header('Amount')!.click();
    await settle();

    expect(urlParams()).toEqual({
      currency: 'PKR',
      sort: 'amount_minor',
      dir: 'asc',
    });
    const req = await respond([PAID]);
    expect(params(req)['sort[amount_minor]']).toBe('asc');
    expect(params(req)['f[currency]']).toBe('PKR');
  });

  it('drops the amount sort when the currency filter is cleared, and resets the page', async () => {
    await open(`${PATH}?currency=PKR&sort=amount_minor&dir=desc&page=3`);
    await respond([PAID], { current_page: 3, total_pages: 3 });

    const filter = harness.fixture.debugElement.query(By.directive(GlobalFilter))
      .componentInstance as GlobalFilter;
    filter.apply.emit({
      status: 'succeeded',
      method: 'all',
      currency: 'all',
      created: { from: '2026-09-01' },
    });
    await settle();

    expect(urlParams()).toEqual({ status: 'succeeded', from: '2026-09-01' });
    const req = await respond([PAID]);
    expect(params(req)).toEqual({
      page: '1',
      limit: '20',
      'f[status.slug]': 'succeeded',
      'f[created_at][gte]': '2026-09-01T00:00:00',
      'sort[created_at]': 'desc',
    });
  });

  it('labels statuses in admin wording, falling back to the server name', async () => {
    await open();
    await respond([PAID]);

    const filter = harness.fixture.debugElement.query(By.directive(GlobalFilter))
      .componentInstance as GlobalFilter;
    const status = filter.groups().find((g) => g.key === 'status');
    expect(status?.fields?.[0].options).toEqual([
      { value: 'all', label: 'All' },
      { value: 'pending', label: 'Pending' },
      { value: 'awaiting-verification', label: 'Awaiting verification' },
      { value: 'succeeded', label: 'Succeeded' },
      { value: 'failed', label: 'Failed' },
      { value: 'disputed', label: 'Disputed' },
    ]);
    const method = filter.groups().find((g) => g.key === 'method');
    expect(method?.fields?.[0].options?.map((o) => o.label)).toEqual([
      'All',
      'Safepay',
      'Bank transfer',
      'Cash',
      'Admin grant',
    ]);
  });

  it('searches by hostel name into the URL and back to page 1', async () => {
    await open(`${PATH}?page=2`);
    await respond([PAID], { current_page: 2, total_pages: 2 });

    const input = q('[data-testid="hostel-search"] input') as HTMLInputElement;
    input.value = '  Model Town ';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();

    expect(urlParams()).toEqual({ hostel: 'Model Town' });
    const req = await respond([REFUND]);
    expect(params(req)['s[hostel.name]']).toBe('Model Town');
    expect(params(req)['page']).toBe('1');
  });

  it('opens the payment drawer for a row', async () => {
    await open();
    await respond([PAID, REJECTED]);

    bodyRows()[1].click();
    await settle();

    expect(q('[data-testid="payment-drawer"]')).not.toBeNull();
    const detail = http.expectOne(`${BASE}/api/admin/payments/pRej2`);
    expect(detail.request.method).toBe('GET');
    detail.flush('gone', { status: 404, statusText: 'Not Found' });
    await settle();
    // A payment that is gone refetches the list behind the drawer.
    await respond([PAID]);
    expect(bodyRows()).toHaveLength(1);
  });

  it('tells an empty list from one the filters emptied, and clears them', async () => {
    await open(`${PATH}?method=cash&sort=succeeded_at&dir=asc`);
    await respond([]);

    expect(text(q('[data-testid="payments-no-match"]'))).toContain(
      'No payments match these filters.',
    );
    expect(q('[data-testid="payments-table"]')).toBeNull();

    (q('[data-testid="clear-filters"]') as HTMLButtonElement).click();
    await settle();
    expect(router.url).toBe(PATH);
    await respond([]);

    expect(text(q('[data-testid="payments-empty"]'))).toContain(
      'No payments yet.',
    );
    expect(q('[data-testid="clear-filters"]')).toBeNull();
  });

  it('sorts by the Created and Succeeded headers, writing the field and direction to the URL and the request', async () => {
    await open();
    await respond([PAID]);

    header('Created')!.click();
    await settle();
    expect(urlParams()).toEqual({ sort: 'created_at', dir: 'asc' });
    let req = await respond([PAID]);
    expect(params(req)['sort[created_at]']).toBe('asc');

    header('Succeeded')!.click();
    await settle();
    expect(urlParams()).toEqual({ sort: 'succeeded_at', dir: 'asc' });
    req = await respond([PAID]);
    expect(params(req)['sort[succeeded_at]']).toBe('asc');
    expect(params(req)['sort[created_at]']).toBeUndefined();

    header('Succeeded')!.click();
    await settle();
    expect(urlParams()).toEqual({ sort: 'succeeded_at', dir: 'desc' });
    req = await respond([PAID]);
    expect(params(req)['sort[succeeded_at]']).toBe('desc');
  });

  describe('acting on a payment from its drawer', () => {
    async function openDrawer(): Promise<void> {
      await open();
      await respond([AWAITING, PAID]);
      bodyRows()[0].click();
      await settle();
      http
        .expectOne(`${BASE}/api/admin/payments/pBnk6`)
        .flush(detailBody('awaiting-verification', 'Awaiting verification', 2));
      await settle();
    }

    const dialogConfirm = (dialog: string) => {
      const buttons = el().querySelectorAll<HTMLButtonElement>(
        `[data-testid="${dialog}"] button`,
      );
      return buttons[buttons.length - 1];
    };

    it('shows the notice, closes the drawer and refetches the list after a verify', async () => {
      await openDrawer();

      (q('[data-testid="verify"]') as HTMLButtonElement).click();
      await settle();
      dialogConfirm('verify-dialog').click();
      await settle();
      http
        .expectOne(`${BASE}/api/admin/payments/pBnk6/verify`)
        .flush(detailBody('succeeded', 'Succeeded', 3));
      await settle();

      expect(q('[data-testid="payment-drawer"]')).toBeNull();
      expect(text(q('[data-testid="notice"]'))).toBe(
        'Payment verified. Invoice HH-2026-000557 is paid.',
      );
      // Refetched at once; the index has not caught up, so the row still reads as awaiting.
      const req = await respond([AWAITING, PAID]);
      expect(params(req)['page']).toBe('1');
      expect(bodyRows()).toHaveLength(2);
      expect(text(bodyRows()[0])).toContain('Clifton Court');
      expect(text(bodyRows()[0])).toContain('Succeeded');
      expect(text(bodyRows()[0])).not.toContain('Awaiting verification');
    });

    it('drops the local status once a refetch shows the row settled', async () => {
      await openDrawer();
      (q('[data-testid="verify"]') as HTMLButtonElement).click();
      await settle();
      dialogConfirm('verify-dialog').click();
      await settle();
      http
        .expectOne(`${BASE}/api/admin/payments/pBnk6/verify`)
        .flush(detailBody('succeeded', 'Succeeded', 3));
      await settle();
      await respond([
        {
          ...AWAITING,
          status: { id: 3, name: 'Succeeded', slug: 'succeeded' },
        },
        REJECTED,
      ]);
      expect(text(bodyRows()[0])).toContain('Succeeded');

      // A payment gone from under its drawer refetches the same query.
      bodyRows()[1].click();
      await settle();
      http
        .expectOne(`${BASE}/api/admin/payments/pRej2`)
        .flush('gone', { status: 404, statusText: 'Not Found' });
      await settle();
      await respond([AWAITING, REJECTED]);

      expect(text(bodyRows()[0])).toContain('Awaiting verification');
    });

    it('drops the local status when the query changes', async () => {
      await openDrawer();
      (q('[data-testid="verify"]') as HTMLButtonElement).click();
      await settle();
      dialogConfirm('verify-dialog').click();
      await settle();
      http
        .expectOne(`${BASE}/api/admin/payments/pBnk6/verify`)
        .flush(detailBody('succeeded', 'Succeeded', 3));
      await settle();
      await respond([AWAITING, PAID]);
      expect(text(bodyRows()[0])).toContain('Succeeded');

      const input = q(
        '[data-testid="hostel-search"] input',
      ) as HTMLInputElement;
      input.value = 'Clifton';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await settle();
      await respond([AWAITING]);

      expect(text(bodyRows()[0])).toContain('Awaiting verification');
    });

    it('shows the notice, closes the drawer and refetches the list after a reject', async () => {
      await openDrawer();

      (q('[data-testid="reject"]') as HTMLButtonElement).click();
      await settle();
      const reason = q('[data-testid="reject-reason"]') as HTMLTextAreaElement;
      reason.value = 'Transfer slip is for another hostel';
      reason.dispatchEvent(new Event('input'));
      await settle();
      dialogConfirm('reject-dialog').click();
      await settle();
      const reject = http.expectOne(`${BASE}/api/admin/payments/pBnk6/reject`);
      expect(reject.request.body).toEqual({
        reason: 'Transfer slip is for another hostel',
      });
      reject.flush(detailBody('failed', 'Failed', 4));
      await settle();

      expect(q('[data-testid="payment-drawer"]')).toBeNull();
      expect(text(q('[data-testid="notice"]'))).toBe(
        'Payment rejected. The host has been emailed.',
      );
      await respond([PAID]);
      expect(bodyRows()).toHaveLength(1);
    });

    it('shows a rejected row as failed even while the refetch still returns it awaiting', async () => {
      await openDrawer();

      (q('[data-testid="reject"]') as HTMLButtonElement).click();
      await settle();
      const reason = q('[data-testid="reject-reason"]') as HTMLTextAreaElement;
      reason.value = 'Transfer slip is for another hostel';
      reason.dispatchEvent(new Event('input'));
      await settle();
      dialogConfirm('reject-dialog').click();
      await settle();
      http
        .expectOne(`${BASE}/api/admin/payments/pBnk6/reject`)
        .flush(detailBody('failed', 'Failed', 4));
      await settle();

      await respond([AWAITING, PAID]);
      expect(text(bodyRows()[0])).toContain('Failed');
      expect(text(bodyRows()[0])).not.toContain('Awaiting verification');
    });
  });

  it('shows our own copy on a 403, and a retry on any other failure', async () => {
    await open();
    listRequest().flush(
      { errors: ['Access denied'] },
      { status: 403, statusText: 'Forbidden' },
    );
    await settle();
    const forbidden = q('[data-testid="payments-forbidden"]');
    expect(text(forbidden)).toContain('Only HostelHive admins can see billing.');
    expect(forbidden!.querySelector('button')).toBeNull();

    TestBed.resetTestingModule();
    await open();
    listRequest().flush('boom', { status: 502, statusText: 'Bad Gateway' });
    await settle();
    const error = q('[data-testid="payments-error"]');
    (error!.querySelector('button') as HTMLButtonElement).click();
    await settle();
    await respond([PAID]);
    expect(bodyRows()).toHaveLength(1);
  });
});
