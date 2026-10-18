import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  AdminHostelBilling,
  AdminPaymentDetail,
  AdminPaymentPage,
  AdminPaymentRow,
  AdminPlan,
  ApiError,
  BillingInvoice,
  BillingInvoicePage,
  BillingInvoiceRow,
  BillingPayment,
  HostBilling,
  SubscriptionEvent,
} from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { API_ERROR_NOTIFIER, SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { ADMIN_BILLING_PAGE_SIZE, AdminBillingApi } from './admin-billing-api';

const BASE = 'https://api.test';

const PAYMENT: BillingPayment = {
  id: 'pAy9X',
  status: {
    id: 2,
    name: 'Awaiting verification',
    slug: 'awaiting-verification',
  },
  payment_method: 'bank_transfer',
  amount: '5000.00',
  currency: 'PKR',
  reference: 'TRX-1',
  gateway_reference: null,
  failure_reason: null,
  proof_url: 'https://files.test/proof.png',
  verified_at: null,
  succeeded_at: null,
  created_at: '2026-10-11T09:00:00Z',
  invoice_id: 'iNv7Q',
};

const INVOICE: BillingInvoice = {
  id: 'iNv7Q',
  number: 'HH-2026-000123',
  kind: 'new',
  currency: 'PKR',
  total: '5000.00',
  period_start: null,
  period_end: null,
  expires_at: '2026-10-14T09:00:00Z',
  paid_at: null,
  voided_at: null,
  created_at: '2026-10-11T09:00:00Z',
  invoice_pdf_url: null,
  plan: { id: 'pLn1', code: 'listing', name: 'Listing', features: [] },
  lines: [{ description: 'Listing', amount: '5000.00' }],
  status: { id: 1, name: 'Open', slug: 'open' },
  payments: [PAYMENT],
};

const ROW: AdminPaymentRow = {
  id: 'pAy9X',
  hostel_id: 'hOs3',
  invoice_id: 'iNv7Q',
  payment_method: 'bank_transfer',
  currency: 'PKR',
  amount: '5000.00',
  reference: 'TRX-1',
  gateway_reference: null,
  failure_reason: null,
  verified_at: null,
  succeeded_at: null,
  created_at: '2026-10-11T09:00:00Z',
  verified_by: null,
  invoice: {
    id: 'iNv7Q',
    number: 'HH-2026-000123',
    kind: 'new',
    status: 'open',
    plan: { code: 'listing', name: 'Listing' },
  },
  hostel: { id: 'hOs3', name: 'Green Hostel', host_id: 'uSr1' },
  status: {
    id: 2,
    name: 'Awaiting verification',
    slug: 'awaiting-verification',
    position: 2,
  },
};

const INVOICE_ROW: BillingInvoiceRow = {
  id: 'iNv7Q',
  number: 'HH-2026-000123',
  hostel_id: 'hOs3',
  kind: 'new',
  currency: 'PKR',
  total: '5000.00',
  period_start: null,
  period_end: null,
  expires_at: null,
  paid_at: null,
  voided_at: null,
  created_at: '2026-10-11T09:00:00Z',
  invoice_pdf_url: null,
  status: { id: 1, name: 'Open', slug: 'open' },
  plan: { id: 'pLn1', code: 'listing', name: 'Listing' },
  hostel: { id: 'hOs3', name: 'Green Hostel' },
  lines: [],
};

const BILLING: HostBilling = {
  currency: 'PKR',
  country_code: 'PK',
  payment_methods: ['safepay'],
  subscription: null,
  features: [],
  open_invoice: null,
  plans: [],
};

const EVENT: SubscriptionEvent = {
  id: 'eVt1',
  kind: 'granted',
  data: { plan: 'listing' },
  created_at: '2026-10-11T09:00:00Z',
  invoice_number: 'HH-2026-000124',
};

const PLAN: AdminPlan = {
  id: 'pLn1',
  code: 'listing',
  name: 'Listing',
  active: true,
  position: 1,
  features: [],
  prices: { PKR: '5000.00' },
};

const PAGINATION = {
  current_page: 2,
  next_page: 3,
  prev_page: 1,
  total_pages: 4,
  total_count: 61,
};

describe('AdminBillingApi', () => {
  let api: AdminBillingApi;
  let http: HttpTestingController;
  const notify = vi.fn();

  beforeEach(() => {
    notify.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: API_ERROR_NOTIFIER, useValue: notify },
      ],
    });
    api = TestBed.inject(AdminBillingApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const expectOne = (path: string): TestRequest =>
    http.expectOne((r) => r.url === `${BASE}${path}`);

  const paramsOf = (req: TestRequest): Record<string, string | null> =>
    Object.fromEntries(
      req.request.params.keys().map((k) => [k, req.request.params.get(k)]),
    );

  function expectQuiet(req: TestRequest): void {
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
  }

  describe('payments', () => {
    it('asks for the first page of 20 by default and sends no filters', () => {
      api.payments().subscribe();

      const req = expectOne('/api/admin/payments');
      expect(req.request.method).toBe('GET');
      expectQuiet(req);
      expect(paramsOf(req)).toEqual({ page: '1', limit: '20' });
      expect(ADMIN_BILLING_PAGE_SIZE).toBe(20);
      req.flush({ payments: [], pagination: null });
    });

    it('maps every query field to its filter, widening the dates to whole days', () => {
      api
        .payments({
          page: 3,
          limit: 50,
          status: 'awaiting-verification',
          from: '2026-10-01',
          to: '2026-10-11',
          hostelName: '  Green  ',
          hostelId: 'hOs3',
          method: 'bank_transfer',
          currency: 'USD',
          invoiceNumber: ' HH-2026-000123 ',
          sort: { field: 'created_at', dir: 'asc' },
        })
        .subscribe();

      const req = expectOne('/api/admin/payments');
      expect(paramsOf(req)).toEqual({
        page: '3',
        limit: '50',
        'f[status.slug]': 'awaiting-verification',
        'f[created_at][gte]': '2026-10-01T00:00:00',
        'f[created_at][lte]': '2026-10-11T23:59:59',
        's[hostel.name]': 'Green',
        'f[hostel_id]': 'hOs3',
        'f[payment_method]': 'bank_transfer',
        'f[currency]': 'USD',
        's[invoice.number]': 'HH-2026-000123',
        'sort[created_at]': 'asc',
      });
      req.flush({ payments: [] });
    });

    it("leaves out an 'all' status and every null or blank field", () => {
      api
        .payments({
          status: 'all',
          from: null,
          to: '',
          hostelName: '   ',
          hostelId: null,
          method: null,
          currency: null,
          invoiceNumber: '',
          sort: null,
        })
        .subscribe();

      const req = expectOne('/api/admin/payments');
      expect(paramsOf(req)).toEqual({ page: '1', limit: '20' });
      req.flush({ payments: [] });
    });

    it('sends only the bound that was given', () => {
      api.payments({ to: '2026-10-11' }).subscribe();

      const req = expectOne('/api/admin/payments');
      expect(req.request.params.has('f[created_at][gte]')).toBe(false);
      expect(req.request.params.get('f[created_at][lte]')).toBe(
        '2026-10-11T23:59:59',
      );
      req.flush({ payments: [] });
    });

    it('returns the rows as given, the statuses and the page info', () => {
      let out: AdminPaymentPage | undefined;
      api.payments({ page: 2 }).subscribe((r) => (out = r));

      const status = {
        id: 2,
        name: 'Awaiting verification',
        slug: 'awaiting-verification',
      };
      expectOne('/api/admin/payments').flush({
        success: true,
        payments: [ROW],
        possible_statuses: [status],
        pagination: PAGINATION,
      });

      expect(out).toEqual({
        rows: [ROW],
        statuses: [status],
        page: { page: 2, total: 61, totalPages: 4, hasNextPage: true },
      });
      expect(out?.rows[0].id).toBe('pAy9X');
      expect(out?.rows[0].hostel_id).toBe('hOs3');
    });

    it('falls back to empty lists and the asked page when the envelope is bare', () => {
      let out: AdminPaymentPage | undefined;
      api.payments({ page: 4 }).subscribe((r) => (out = r));

      expectOne('/api/admin/payments').flush({ success: true });

      expect(out).toEqual({
        rows: [],
        statuses: [],
        page: { page: 4, total: 0, totalPages: 1, hasNextPage: false },
      });
    });

    it('lets a failure reach the caller without the global toast', () => {
      let err: ApiError | undefined;
      api.payments().subscribe({ error: (e: ApiError) => (err = e) });

      expectOne('/api/admin/payments').flush(
        { success: false, errors: ['Forbidden'] },
        { status: 403, statusText: 'Forbidden' },
      );

      expect(err?.status).toBe(403);
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('payment', () => {
    it('fetches the detail and returns the payment and invoice without the flag', () => {
      let out: AdminPaymentDetail | undefined;
      api.payment('pAy9X').subscribe((r) => (out = r));

      const req = expectOne('/api/admin/payments/pAy9X');
      expect(req.request.method).toBe('GET');
      expectQuiet(req);
      req.flush({ success: true, payment: PAYMENT, invoice: INVOICE });

      expect(out).toEqual({ payment: PAYMENT, invoice: INVOICE });
    });
  });

  describe('verify', () => {
    it('PUTs an empty body and returns the payment and invoice', () => {
      let out: AdminPaymentDetail | undefined;
      api.verify('pAy9X').subscribe((r) => (out = r));

      const req = expectOne('/api/admin/payments/pAy9X/verify');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({});
      expectQuiet(req);
      const failed = {
        ...PAYMENT,
        status: { id: 4, name: 'Failed', slug: 'failed' },
        failure_reason: 'Invoice HH-2026-000123 is already paid',
      };
      req.flush({ success: true, payment: failed, invoice: INVOICE });

      expect(out).toEqual({ payment: failed, invoice: INVOICE });
    });

    it('passes a 422 through with its message and no toast', () => {
      let err: ApiError | undefined;
      api.verify('pAy9X').subscribe({ error: (e: ApiError) => (err = e) });

      expectOne('/api/admin/payments/pAy9X/verify').flush(
        {
          success: false,
          errors: ['Only a payment awaiting verification can be verified'],
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      expect(err?.status).toBe(422);
      expect(err?.serverMessages?.[0]).toBe(
        'Only a payment awaiting verification can be verified',
      );
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('PUTs the trimmed reason', () => {
      let out: AdminPaymentDetail | undefined;
      api.reject('pAy9X', '  Wrong account  ').subscribe((r) => (out = r));

      const req = expectOne('/api/admin/payments/pAy9X/reject');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ reason: 'Wrong account' });
      expectQuiet(req);
      req.flush({ success: true, payment: PAYMENT, invoice: INVOICE });

      expect(out).toEqual({ payment: PAYMENT, invoice: INVOICE });
    });
  });

  describe('invoices', () => {
    it('asks for page 1 of 20 by default', () => {
      api.invoices().subscribe();

      const req = expectOne('/api/admin/invoices');
      expect(req.request.method).toBe('GET');
      expectQuiet(req);
      expect(paramsOf(req)).toEqual({ page: '1', limit: '20' });
      req.flush({ invoices: [] });
    });

    it('filters the invoice number exactly with f[number], not a match query', () => {
      api
        .invoices({
          status: 'open',
          currency: 'PKR',
          from: '2026-10-01',
          to: '2026-10-02',
          hostelName: 'Green',
          invoiceNumber: 'HH-2026-000123',
          sort: { field: 'created_at', dir: 'desc' },
        })
        .subscribe();

      const req = expectOne('/api/admin/invoices');
      expect(paramsOf(req)).toEqual({
        page: '1',
        limit: '20',
        'f[status.slug]': 'open',
        'f[currency]': 'PKR',
        'f[created_at][gte]': '2026-10-01T00:00:00',
        'f[created_at][lte]': '2026-10-02T23:59:59',
        's[hostel.name]': 'Green',
        'f[number]': 'HH-2026-000123',
        'sort[created_at]': 'desc',
      });
      req.flush({ invoices: [] });
    });

    it('returns the rows, statuses and page info', () => {
      let out: BillingInvoicePage | undefined;
      api.invoices({ page: 2 }).subscribe((r) => (out = r));

      const status = { id: 1, name: 'Open', slug: 'open' };
      expectOne('/api/admin/invoices').flush({
        success: true,
        invoices: [INVOICE_ROW],
        possible_statuses: [status],
        pagination: PAGINATION,
      });

      expect(out).toEqual({
        rows: [INVOICE_ROW],
        statuses: [status],
        page: { page: 2, total: 61, totalPages: 4, hasNextPage: true },
      });
    });
  });

  describe('invoice', () => {
    it('unwraps the invoice envelope', () => {
      let out: BillingInvoice | undefined;
      api.invoice('iNv7Q').subscribe((r) => (out = r));

      const req = expectOne('/api/admin/invoices/iNv7Q');
      expect(req.request.method).toBe('GET');
      expectQuiet(req);
      req.flush({ success: true, invoice: INVOICE });

      expect(out).toEqual(INVOICE);
    });
  });

  describe('hostelBilling', () => {
    it('returns the billing, the override and the events as sent', () => {
      let out: AdminHostelBilling | undefined;
      api.hostelBilling('hOs3').subscribe((r) => (out = r));

      const req = expectOne('/api/admin/hostels/hOs3/billing');
      expect(req.request.method).toBe('GET');
      expectQuiet(req);
      req.flush({
        success: true,
        billing: BILLING,
        billing_currency_override: 'USD',
        events: [EVENT],
      });

      expect(out).toEqual({
        billing: BILLING,
        billing_currency_override: 'USD',
        events: [EVENT],
      });
    });

    it('reads a missing override as null and missing events as none', () => {
      let out: AdminHostelBilling | undefined;
      api.hostelBilling('hOs3').subscribe((r) => (out = r));

      expectOne('/api/admin/hostels/hOs3/billing').flush({ billing: BILLING });

      expect(out).toEqual({
        billing: BILLING,
        billing_currency_override: null,
        events: [],
      });
    });
  });

  describe('grant', () => {
    it('POSTs the plan id as given and the months as a number', () => {
      let out: AdminHostelBilling | undefined;
      api.grant('hOs3', 'pLn1', 3).subscribe((r) => (out = r));

      const req = expectOne('/api/admin/hostels/hOs3/grant');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ plan_id: 'pLn1', months: 3 });
      expectQuiet(req);
      req.flush({
        success: true,
        billing: BILLING,
        billing_currency_override: null,
        events: [EVENT],
      });

      expect(out).toEqual({
        billing: BILLING,
        billing_currency_override: null,
        events: [EVENT],
      });
    });
  });

  describe('setBillingCurrency', () => {
    it('PUTs the currency', () => {
      let out: AdminHostelBilling | undefined;
      api.setBillingCurrency('hOs3', 'USD').subscribe((r) => (out = r));

      const req = expectOne('/api/admin/hostels/hOs3/billing_currency');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ currency: 'USD' });
      expectQuiet(req);
      req.flush({
        billing: BILLING,
        billing_currency_override: 'USD',
        events: [],
      });

      expect(out?.billing_currency_override).toBe('USD');
    });

    it('sends an empty currency to clear the override', () => {
      api.setBillingCurrency('hOs3', '').subscribe();

      const req = expectOne('/api/admin/hostels/hOs3/billing_currency');
      expect(req.request.body).toEqual({ currency: '' });
      req.flush({
        billing: BILLING,
        billing_currency_override: null,
        events: [],
      });
    });
  });

  describe('plans', () => {
    it('unwraps the plan list', () => {
      let out: AdminPlan[] | undefined;
      api.plans().subscribe((r) => (out = r));

      const req = expectOne('/api/admin/plans');
      expect(req.request.method).toBe('GET');
      expectQuiet(req);
      req.flush({ success: true, plans: [PLAN] });

      expect(out).toEqual([PLAN]);
    });

    it('returns no plans when the list is missing', () => {
      let out: AdminPlan[] | undefined;
      api.plans().subscribe((r) => (out = r));

      expectOne('/api/admin/plans').flush({ success: true });

      expect(out).toEqual([]);
    });
  });

  describe('updatePlan', () => {
    it('PUTs the body exactly as given and unwraps the plan', () => {
      let out: AdminPlan | undefined;
      const body = {
        plan: { name: 'Listing', active: true },
        prices: { USD: '18.50' },
      };
      api.updatePlan('pLn1', body).subscribe((r) => (out = r));

      const req = expectOne('/api/admin/plans/pLn1');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(body);
      expectQuiet(req);
      const saved = { ...PLAN, prices: { PKR: '5000.00', USD: '18.50' } };
      req.flush({ success: true, plan: saved });

      expect(out).toEqual(saved);
    });

    it('sends no prices key when none changed', () => {
      api
        .updatePlan('pLn1', { plan: { name: 'Listing', active: false } })
        .subscribe();

      const req = expectOne('/api/admin/plans/pLn1');
      expect(req.request.body).toEqual({
        plan: { name: 'Listing', active: false },
      });
      req.flush({ plan: PLAN });
    });
  });
});
