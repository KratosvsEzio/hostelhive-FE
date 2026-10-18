import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';
import type {
  BillingInvoice,
  BillingInvoiceRow,
  BillingInvoiceStatusOption,
} from '@hostelhive/data-access';
import { GlobalFilter, Search } from '@hostelhive/ui';
import { API_CONFIG } from '@core/api-config';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AdminBillingInvoices } from './admin-billing-invoices';

const BASE = 'https://api.test';
const PAGE = '/admin/billing/invoices';
const FSI = '⁨';
const PDI = '⁩';

// Admin wording differs from the server's status names, so a label proves which one is shown.
const COPY = {
  common: { showAll: 'Show all' },
  adminBilling: {
    titles: { invoices: 'Invoices' },
    tabs: { verify: 'To verify', invoices: 'Invoices' },
    invoices: {
      title: 'Invoice {{number}}',
      count: '{{count}} invoices',
      noMatch: 'No invoices match these filters.',
      empty: 'No invoices yet.',
      searchNumber: 'Search by invoice number',
    },
    common: {
      loadError: "We couldn't load this. Try again.",
      retry: 'Try again',
      datesUtc: 'Dates are in UTC.',
      searchHostel: 'Search by hostel name',
      filterAll: 'All',
      filterStatus: 'Status',
      filterCurrency: 'Currency',
      filterCreated: 'Created',
      viewHostelBilling: 'View hostel billing',
      viewInvoice: 'View invoice',
      preparing: 'Preparing…',
    },
    errors: {
      forbidden: 'Only HostelHive admins can see billing.',
      notFound: 'This was changed or removed.',
      generic: 'Something went wrong. Try again.',
      network: "We couldn't reach HostelHive.",
    },
    columns: {
      hostel: 'Hostel',
      invoice: 'Invoice',
      plan: 'Plan',
      total: 'Total',
      status: 'Status',
      type: 'Type',
      period: 'Period',
      issued: 'Issued',
      paid: 'Paid',
      pdf: 'PDF',
    },
    invoiceStatus: { open: 'Open', paid: 'Paid', void: 'Void' },
    kind: { new: 'New plan', renewal: 'Renewal', upgrade: 'Upgrade' },
  },
};

const STATUSES: BillingInvoiceStatusOption[] = [
  { id: 1, name: 'Payment due', slug: 'open' },
  { id: 2, name: 'Settled', slug: 'paid' },
  { id: 3, name: 'Cancelled', slug: 'void' },
  { id: 4, name: 'Refunded', slug: 'refunded' },
];

function row(over: Partial<BillingInvoiceRow> = {}): BillingInvoiceRow {
  return {
    id: 'iNvA1',
    number: 'HH-2026-000431',
    hostel_id: 'hOsGreen',
    kind: 'renewal',
    currency: 'PKR',
    total: '7250.00',
    period_start: '2026-11-01T00:00:00Z',
    period_end: '2026-12-01T00:00:00Z',
    expires_at: null,
    paid_at: '2026-10-10T06:05:00Z',
    voided_at: null,
    created_at: '2026-10-09T21:30:00Z',
    invoice_pdf_url: 'https://files.test/HH-2026-000431.pdf',
    status: { id: 2, name: 'Settled', slug: 'paid' },
    plan: { id: 'pLnPro', code: 'pro', name: 'Pro Listing' },
    hostel: { id: 'hOsGreen', name: 'Green Hostel' },
    lines: [],
    ...over,
  };
}

const ROWS: BillingInvoiceRow[] = [
  row(),
  row({
    id: 'iNvB2',
    number: 'HH-2026-000432',
    hostel_id: 'hOsBlue',
    hostel: { id: 'hOsBlue', name: 'Blue Lodge' },
    kind: 'upgrade',
    currency: 'USD',
    total: '18.50',
    period_start: null,
    period_end: null,
    paid_at: '2026-10-11T02:00:00Z',
    created_at: '2026-10-11T01:55:00Z',
    invoice_pdf_url: null,
    plan: { id: 'pLnBasic', code: 'basic', name: 'Basic' },
  }),
  row({
    id: 'iNvC3',
    number: 'HH-2026-000433',
    hostel_id: 'hOsRed',
    hostel: null,
    kind: 'proration',
    total: '1200.00',
    paid_at: null,
    invoice_pdf_url: null,
    status: { id: 4, name: 'Refunded', slug: 'refunded' },
    plan: null,
  }),
  row({
    id: 'iNvD4',
    number: 'HH-2026-000434',
    hostel_id: undefined,
    hostel: null,
    kind: 'new',
    total: '900.00',
    paid_at: null,
    invoice_pdf_url: null,
    status: { id: 1, name: 'Payment due', slug: 'open' },
  }),
];

const PAGINATION = {
  current_page: 1,
  next_page: 2,
  prev_page: null,
  total_pages: 4,
  total_count: 61,
};

function envelope(
  invoices: BillingInvoiceRow[] = ROWS,
  pagination: Record<string, number | null> = PAGINATION,
) {
  return { invoices, possible_statuses: STATUSES, pagination, success: true };
}

function detail(over: Partial<BillingInvoice> = {}): BillingInvoice {
  return {
    id: 'iNvB2',
    number: 'HH-2026-000432',
    kind: 'upgrade',
    currency: 'USD',
    total: '18.50',
    period_start: null,
    period_end: null,
    expires_at: null,
    paid_at: '2026-10-11T02:00:00Z',
    voided_at: null,
    created_at: '2026-10-11T01:55:00Z',
    invoice_pdf_url: null,
    plan: { id: 'pLnBasic', code: 'basic', name: 'Basic', features: [] },
    lines: [{ description: 'Basic, upgrade', amount: '18.50' }],
    status: { id: 2, name: 'Settled', slug: 'paid' },
    payments: [],
    ...over,
  } as BillingInvoice;
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('AdminBillingInvoices', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  let http: HttpTestingController;

  async function open(url = PAGE): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin/billing/invoices', component: AdminBillingInvoices },
          { path: '**', children: [] },
        ]),
        provideI18nTesting(),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
      ],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    return el();
  }

  function el(): HTMLElement {
    return harness.routeNativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function listRequests(): TestRequest[] {
    return http.match((r) => r.url === `${BASE}/api/admin/invoices`);
  }

  function expectList(): TestRequest {
    const reqs = listRequests();
    expect(reqs).toHaveLength(1);
    expect(reqs[0].request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    return reqs[0];
  }

  function paramsOf(req: TestRequest): Record<string, string | null> {
    return Object.fromEntries(
      req.request.params.keys().map((k) => [k, req.request.params.get(k)]),
    );
  }

  function respond(body: object = envelope()): void {
    expectList().flush(body);
    harness.detectChanges();
  }

  function fail(status: number, body: object | null = null): void {
    expectList().flush(body, { status, statusText: 'Err' });
    harness.detectChanges();
  }

  const byTestId = (id: string) =>
    el().querySelector<HTMLElement>(`[data-testid="${id}"]`);

  function bodyRows(): HTMLTableRowElement[] {
    return Array.from(
      el().querySelectorAll<HTMLTableRowElement>('hh-data-table tbody tr'),
    );
  }

  function cells(tr: HTMLTableRowElement): string[] {
    return Array.from(tr.querySelectorAll('td')).map(text);
  }

  function search(testId: string): Search {
    return harness.fixture.debugElement
      .query(By.css(`[data-testid="${testId}"]`))
      .injector.get(Search);
  }

  function globalFilter(): GlobalFilter {
    return harness.fixture.debugElement
      .query(By.directive(GlobalFilter))
      .injector.get(GlobalFilter);
  }

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  describe('frame', () => {
    it('shows the billing tabs, the heading and the UTC note', async () => {
      await open();
      respond();

      expect(el().querySelector('hh-admin-billing-tabs')).not.toBeNull();
      expect(text(el().querySelector('app-dashboard-layout h1'))).toBe(
        'Invoices',
      );
      expect(text(byTestId('dates-utc'))).toBe('Dates are in UTC.');
    });
  });

  describe('request', () => {
    it('asks for the first page, newest first, with no filters', async () => {
      await open();

      expect(paramsOf(expectList())).toEqual({
        page: '1',
        limit: '20',
        'sort[created_at]': 'desc',
      });
    });

    it('reads every filter from the URL', async () => {
      await open(
        `${PAGE}?status=void&currency=USD&from=2026-10-01&to=2026-10-05&hostel=Green&number=HH-2026-000777&page=3`,
      );

      expect(paramsOf(expectList())).toEqual({
        page: '3',
        limit: '20',
        'sort[created_at]': 'desc',
        'f[status.slug]': 'void',
        'f[currency]': 'USD',
        'f[created_at][gte]': '2026-10-01T00:00:00',
        'f[created_at][lte]': '2026-10-05T23:59:59',
        's[hostel.name]': 'Green',
        'f[number]': 'HH-2026-000777',
      });
    });

    it('ignores an unknown currency, a malformed day and "all"', async () => {
      await open(`${PAGE}?status=all&currency=EUR&from=1%20Oct&page=zero`);

      expect(paramsOf(expectList())).toEqual({
        page: '1',
        limit: '20',
        'sort[created_at]': 'desc',
      });
    });

    it('pre-fills the number search from ?number=', async () => {
      await open(`${PAGE}?number=HH-2026-000777`);
      respond();

      expect(search('number-search').term()).toBe('HH-2026-000777');
      expect(
        (byTestId('number-search')?.querySelector('input') as HTMLInputElement)
          .value,
      ).toBe('HH-2026-000777');
    });
  });

  describe('rows', () => {
    it('labels the columns from the loaded copy', async () => {
      await open();
      respond();

      expect(
        Array.from(el().querySelectorAll('hh-data-table thead th')).map(text),
      ).toEqual([
        'Invoice',
        'Hostel',
        'Plan',
        'Type',
        'Period',
        'Total',
        'Status',
        'Issued',
        'Paid',
        'PDF',
      ]);
    });

    it('renders each invoice with its own currency and admin labels', async () => {
      await open();
      respond();

      const [paid, usd, unknown, open_] = bodyRows().map(cells);
      expect(paid).toEqual([
        `${FSI}HH-2026-000431${PDI}`,
        'Green Hostel',
        'Pro Listing',
        'Renewal',
        '1 Nov 2026 – 1 Dec 2026',
        `${FSI}PKR 7,250${PDI}`,
        'Paid',
        '9 Oct 2026',
        '10 Oct 2026',
        'PDF',
      ]);
      expect(usd).toEqual([
        `${FSI}HH-2026-000432${PDI}`,
        'Blue Lodge',
        'Basic',
        'Upgrade',
        '—',
        `${FSI}$18.50${PDI}`,
        'Paid',
        '11 Oct 2026',
        '11 Oct 2026',
        'Preparing…',
      ]);
      expect(unknown).toEqual([
        `${FSI}HH-2026-000433${PDI}`,
        'View hostel billing',
        '—',
        '—',
        '1 Nov 2026 – 1 Dec 2026',
        `${FSI}PKR 1,200${PDI}`,
        'Refunded',
        '9 Oct 2026',
        '—',
        '—',
      ]);
      expect(open_[0]).toBe(`${FSI}HH-2026-000434${PDI}`);
      expect(open_[1]).toBe('—');
      expect(open_[3]).toBe('New plan');
      expect(open_[6]).toBe('Open');
    });

    it('links hostels to their billing page and the PDF out', async () => {
      await open();
      respond();

      const [paid, , unknown] = bodyRows();
      const links = (tr: HTMLTableRowElement) =>
        Array.from(tr.querySelectorAll('a')).map((a) => [
          a.getAttribute('href'),
          a.getAttribute('target'),
        ]);
      expect(links(paid)).toEqual([
        ['/admin/billing/hostels/hOsGreen', null],
        ['https://files.test/HH-2026-000431.pdf', '_blank'],
      ]);
      expect(links(unknown)).toEqual([['/admin/billing/hostels/hOsRed', null]]);
    });

    it('shows the server count and never a summed total', async () => {
      await open();
      respond();

      expect(text(byTestId('invoices-count'))).toBe('61 invoices');
      expect(el().textContent).not.toMatch(/8,450|9,350|10,350/);
    });
  });

  describe('filters', () => {
    it('offers the server statuses with admin labels, plus both currencies', async () => {
      await open();
      respond();

      const [status, currency, created] = globalFilter().groups();
      expect(status.label).toBe('Status');
      expect(status.fields?.[0].options).toEqual([
        { value: 'all', label: 'All' },
        { value: 'open', label: 'Open' },
        { value: 'paid', label: 'Paid' },
        { value: 'void', label: 'Void' },
        { value: 'refunded', label: 'Refunded' },
      ]);
      expect(currency.fields?.[0].options).toEqual([
        { value: 'all', label: 'All' },
        { value: 'PKR', label: 'PKR' },
        { value: 'USD', label: 'USD' },
      ]);
      expect(created.fields?.[0].type).toBe('date-range');
    });

    it('writes applied filters to the URL, resets the page and refetches', async () => {
      await open(`${PAGE}?page=2&number=HH-2026-000777`);
      respond();

      globalFilter().apply.emit({
        status: 'paid',
        currency: 'PKR',
        created: { from: '2026-09-01', to: '2026-09-30' },
      });
      await settle();

      expect(router.parseUrl(router.url).queryParams).toEqual({
        number: 'HH-2026-000777',
        status: 'paid',
        currency: 'PKR',
        from: '2026-09-01',
        to: '2026-09-30',
      });
      expect(paramsOf(expectList())).toEqual({
        page: '1',
        limit: '20',
        'sort[created_at]': 'desc',
        'f[status.slug]': 'paid',
        'f[currency]': 'PKR',
        'f[created_at][gte]': '2026-09-01T00:00:00',
        'f[created_at][lte]': '2026-09-30T23:59:59',
        'f[number]': 'HH-2026-000777',
      });
    });

    it('reflects the URL filters back into the filter panel', async () => {
      await open(`${PAGE}?status=void&currency=USD&from=2026-10-01`);
      respond();

      expect(globalFilter().value()).toEqual({
        status: 'void',
        currency: 'USD',
        created: { from: '2026-10-01' },
      });
    });

    it('searches by hostel name from the first page', async () => {
      await open(`${PAGE}?page=3`);
      respond();

      search('hostel-search').term.set('  Blue Lodge ');
      await settle();

      expect(router.parseUrl(router.url).queryParams).toEqual({
        hostel: 'Blue Lodge',
      });
      expect(paramsOf(expectList())['s[hostel.name]']).toBe('Blue Lodge');
    });

    it('filters by invoice number', async () => {
      await open();
      respond();

      search('number-search').term.set('HH-2026-000432');
      await settle();

      expect(router.parseUrl(router.url).queryParams).toEqual({
        number: 'HH-2026-000432',
      });
      expect(paramsOf(expectList())['f[number]']).toBe('HH-2026-000432');
    });

    it('pages through the server pages', async () => {
      await open();
      respond();

      const next = el().querySelector<HTMLButtonElement>(
        'hh-data-table button[aria-label="a11y.nextPage"]',
      );
      next?.click();
      await settle();

      expect(router.parseUrl(router.url).queryParams).toEqual({ page: '2' });
      expect(paramsOf(expectList())['page']).toBe('2');
    });
  });

  describe('states', () => {
    it('shows a skeleton while loading', async () => {
      await open();

      expect(byTestId('invoices-loading')).not.toBeNull();
      respond();
      expect(byTestId('invoices-loading')).toBeNull();
    });

    it('says there are no invoices yet when nothing is filtered', async () => {
      await open();
      respond(envelope([], { total_count: 0, total_pages: 0 }));

      expect(text(byTestId('invoices-empty'))).toContain('No invoices yet.');
      expect(el().querySelector('hh-data-table')).toBeNull();
    });

    it('says nothing matches a filter, and clears every filter on request', async () => {
      await open(`${PAGE}?currency=USD&hostel=Nowhere&number=HH-1`);
      respond(envelope([], { total_count: 0, total_pages: 0 }));

      expect(text(byTestId('invoices-no-match'))).toContain(
        'No invoices match these filters.',
      );
      byTestId('show-all')?.click();
      await settle();

      expect(router.parseUrl(router.url).queryParams).toEqual({});
      expect(paramsOf(expectList())).toEqual({
        page: '1',
        limit: '20',
        'sort[created_at]': 'desc',
      });
    });

    it('shows a load error with a retry that fetches again', async () => {
      await open();
      fail(500);

      const state = byTestId('invoices-error') as HTMLElement;
      expect(text(state)).toContain("We couldn't load this. Try again.");
      (
        Array.from(state.querySelectorAll('button')).find(
          (b) => text(b) === 'Try again',
        ) as HTMLButtonElement
      ).click();
      harness.detectChanges();

      respond();
      expect(bodyRows()).toHaveLength(4);
    });

    it('shows our own copy on a 403, with no retry', async () => {
      await open();
      fail(403, { errors: ['Forbidden by policy'] });

      const state = byTestId('invoices-forbidden') as HTMLElement;
      expect(text(state)).toContain('Only HostelHive admins can see billing.');
      expect(text(state)).not.toContain('Forbidden by policy');
      expect(state.querySelector('button')).toBeNull();
    });
  });

  describe('drawer', () => {
    function invoiceRequest(id: string): TestRequest {
      return http.expectOne(`${BASE}/api/admin/invoices/${id}`);
    }

    it('opens a clicked row in the drawer, with its hostel link', async () => {
      await open();
      respond();

      bodyRows()[1].click();
      await settle();

      expect(router.parseUrl(router.url).queryParams).toEqual({
        invoice: 'iNvB2',
      });
      invoiceRequest('iNvB2').flush({ invoice: detail() });
      harness.detectChanges();

      const drawer = el().querySelector('hh-admin-invoice-drawer');
      expect(text(drawer?.querySelector('hh-drawer h2'))).toBe(
        'Invoice HH-2026-000432',
      );
      expect(
        drawer
          ?.querySelector('[data-testid="hostel-link"]')
          ?.getAttribute('href'),
      ).toBe('/en/admin/billing/hostels/hOsBlue');
    });

    it('does not open the drawer from a link inside a row', async () => {
      await open();
      respond();

      const pdf = bodyRows()[0].querySelector('a[href^="https"]');
      pdf?.addEventListener('click', (e) => e.preventDefault());
      pdf?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      await settle();

      expect(el().querySelector('hh-admin-invoice-drawer')).toBeNull();
    });

    it('closes the drawer and drops ?invoice=', async () => {
      await open(`${PAGE}?invoice=iNvB2&currency=USD`);
      respond();
      invoiceRequest('iNvB2').flush({ invoice: detail() });
      harness.detectChanges();

      (
        el().querySelector(
          'hh-admin-invoice-drawer hh-drawer button[aria-label]',
        ) as HTMLButtonElement
      ).click();
      await settle();

      expect(router.parseUrl(router.url).queryParams).toEqual({
        currency: 'USD',
      });
      expect(el().querySelector('hh-admin-invoice-drawer')).toBeNull();
    });

    it('deep-links ?invoice= to the drawer, using the row hostel when it is listed', async () => {
      await open(`${PAGE}?invoice=iNvA1`);
      respond();
      invoiceRequest('iNvA1').flush({
        invoice: detail({ id: 'iNvA1', number: 'HH-2026-000431' }),
      });
      harness.detectChanges();

      expect(
        el().querySelector('[data-testid="hostel-link"]')?.getAttribute('href'),
      ).toBe('/en/admin/billing/hostels/hOsGreen');
    });

    it('deep-links an unlisted invoice without a hostel link', async () => {
      await open(`${PAGE}?invoice=iNvZ9`);
      respond();
      invoiceRequest('iNvZ9').flush({
        invoice: detail({ id: 'iNvZ9', number: 'HH-2026-000999' }),
      });
      harness.detectChanges();

      expect(text(el().querySelector('hh-drawer h2'))).toBe(
        'Invoice HH-2026-000999',
      );
      expect(el().querySelector('[data-testid="hostel-link"]')).toBeNull();
    });

    it('refetches the list when the opened invoice is gone, as the 404 copy says', async () => {
      await open(`${PAGE}?invoice=iNvGone`);
      respond();
      invoiceRequest('iNvGone').flush(null, {
        status: 404,
        statusText: 'Not Found',
      });
      harness.detectChanges();

      expect(
        el().querySelector('[data-testid="invoice-not-found"]'),
      ).not.toBeNull();
      respond();
    });
  });
});
