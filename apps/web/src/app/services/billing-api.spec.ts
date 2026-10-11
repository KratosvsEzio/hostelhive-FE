import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ApiError,
  BillingInvoice,
  BillingPayment,
  HostBilling,
  PlansResponse,
  StartedPayment,
} from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { API_ERROR_NOTIFIER, SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { BillingApi } from './billing-api';

const BASE = 'https://api.test';

const PLAN = {
  id: 'qTFruf',
  code: 'listing',
  name: 'Listing',
  features: [],
  interval: 'month',
  currency: 'PKR',
  price: '5000.00',
};

const BILLING: HostBilling = {
  currency: 'PKR',
  country_code: 'PK',
  payment_methods: ['safepay', 'bank_transfer'],
  subscription: null,
  features: [],
  open_invoice: null,
  plans: [{ ...PLAN, action: 'buy', amount_due_now: '5000.00' }],
};

const INVOICE: BillingInvoice = {
  id: 'inv1',
  number: 'HH-0001',
  kind: 'new',
  currency: 'PKR',
  total: '5000.00',
  period_start: '2026-10-11T00:00:00Z',
  period_end: '2026-11-11T00:00:00Z',
  expires_at: '2026-10-12T00:00:00Z',
  paid_at: null,
  voided_at: null,
  created_at: '2026-10-11T00:00:00Z',
  invoice_pdf_url: null,
  plan: { id: 'qTFruf', code: 'listing', name: 'Listing', features: [] },
  lines: [{ description: 'Listing', amount: '5000.00' }],
  status: { id: 1, name: 'Open', slug: 'open', color: null },
  payments: [],
};

/**
 * The billing endpoints only unwrap envelopes. The billing read and checkout must keep quiet on
 * failure, because their screen shows the 403 and 422 messages inline and a toast would say the
 * same thing twice.
 */
describe('BillingApi', () => {
  let api: BillingApi;
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
    api = TestBed.inject(BillingApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('plans', () => {
    it('asks for the given country and returns the priced plans without the envelope flag', () => {
      let out: PlansResponse | undefined;
      api.plans('PK').subscribe((r) => (out = r));

      const req = http.expectOne((r) => r.url === `${BASE}/api/plans`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('country')).toBe('PK');
      req.flush({
        success: true,
        currency: 'PKR',
        country: 'PK',
        plans: [PLAN],
      });

      expect(out).toEqual({ currency: 'PKR', country: 'PK', plans: [PLAN] });
    });

    // No country lets the server fall back to its own detection; an empty param would not.
    it('sends no country param when none is given', () => {
      let out: PlansResponse | undefined;
      api.plans().subscribe((r) => (out = r));

      const req = http.expectOne((r) => r.url === `${BASE}/api/plans`);
      expect(req.request.params.has('country')).toBe(false);
      req.flush({ success: true, currency: 'USD', country: null, plans: [] });

      expect(out).toEqual({ currency: 'USD', country: null, plans: [] });
    });

    it('suppresses the global toast and lets a server failure reach the caller', () => {
      let err: ApiError | undefined;
      api.plans('PK').subscribe({ error: (e: ApiError) => (err = e) });

      const req = http.expectOne((r) => r.url === `${BASE}/api/plans`);
      expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
      req.flush(
        { success: false, error: 'boom' },
        { status: 500, statusText: 'Server Error' },
      );

      expect(err?.status).toBe(500);
      expect(notify).not.toHaveBeenCalled();
    });

    it('treats an empty country as no country', () => {
      api.plans('').subscribe();

      const req = http.expectOne((r) => r.url === `${BASE}/api/plans`);
      expect(req.request.params.has('country')).toBe(false);
      req.flush({ currency: 'USD', country: null, plans: [] });
    });
  });

  describe('billing', () => {
    it('reads the hostel billing summary out of its envelope, toast suppressed', () => {
      let out: HostBilling | undefined;
      api.billing('nHelLt').subscribe((b) => (out = b));

      const req = http.expectOne(`${BASE}/api/hostels/nHelLt/billing`);
      expect(req.request.method).toBe('GET');
      expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
      req.flush({ success: true, billing: BILLING });

      expect(out).toEqual(BILLING);
    });

    it('passes a 403 to the caller without a toast', () => {
      let err: ApiError | undefined;
      api.billing('nHelLt').subscribe({ error: (e: ApiError) => (err = e) });

      http.expectOne(`${BASE}/api/hostels/nHelLt/billing`).flush(
        {
          success: false,
          error: 'You are not authorized to access this page.',
        },
        { status: 403, statusText: 'Forbidden' },
      );

      expect(err?.status).toBe(403);
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('checkout', () => {
    it('posts the plan id as returned and unwraps the issued invoice, toast suppressed', () => {
      let out: BillingInvoice | undefined;
      api.checkout('nHelLt', 'qTFruf').subscribe((i) => (out = i));

      const req = http.expectOne(`${BASE}/api/hostels/nHelLt/checkout`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ plan_id: 'qTFruf' });
      expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
      req.flush(
        { success: true, invoice: INVOICE },
        { status: 201, statusText: 'Created' },
      );

      expect(out).toEqual(INVOICE);
    });

    it('hands a 422 message to the caller word for word, without a toast', () => {
      let err: ApiError | undefined;
      api
        .checkout('nHelLt', 'qTFruf')
        .subscribe({ error: (e: ApiError) => (err = e) });

      http
        .expectOne(`${BASE}/api/hostels/nHelLt/checkout`)
        .flush(
          { success: false, errors: ["Set the hostel's country first"] },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      expect(err?.status).toBe(422);
      expect(err?.serverMessages?.[0]).toBe("Set the hostel's country first");
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('invoice', () => {
    it('reads one invoice out of its envelope', () => {
      let out: BillingInvoice | undefined;
      api.invoice('inv1').subscribe((i) => (out = i));

      const req = http.expectOne(`${BASE}/api/invoices/inv1`);
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, invoice: INVOICE });

      expect(out).toEqual(INVOICE);
    });

    it('suppresses the global toast and lets a server failure reach the caller', () => {
      let err: ApiError | undefined;
      api.invoice('inv1').subscribe({ error: (e: ApiError) => (err = e) });

      const req = http.expectOne(`${BASE}/api/invoices/inv1`);
      expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
      req.flush(
        { success: false, error: 'boom' },
        { status: 500, statusText: 'Server Error' },
      );

      expect(err?.status).toBe(500);
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('pay', () => {
    const PAYMENT: BillingPayment = {
      id: 'pay1',
      status: { id: 1, name: 'Pending', slug: 'pending', color: null },
      payment_method: 'safepay',
      amount: '5000.00',
      currency: 'PKR',
      reference: null,
      gateway_reference: 'track_1',
      failure_reason: null,
      proof_url: null,
      verified_at: null,
      succeeded_at: null,
      created_at: '2026-10-11T00:00:00Z',
      invoice_id: 'inv1',
    };
    const CHECKOUT = 'https://sandbox.api.getsafepay.com/embedded/?tracker=track_1';

    it('starts a Safepay payment and unwraps the payment, checkout page and invoice, toast suppressed', () => {
      let out: StartedPayment | undefined;
      api.pay('inv1').subscribe((r) => (out = r));

      const req = http.expectOne(`${BASE}/api/invoices/inv1/payments`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ payment_method: 'safepay' });
      expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
      req.flush(
        {
          success: true,
          payment: PAYMENT,
          checkout_url: CHECKOUT,
          invoice: { ...INVOICE, payments: [PAYMENT] },
        },
        { status: 201, statusText: 'Created' },
      );

      expect(out).toEqual({
        payment: PAYMENT,
        checkout_url: CHECKOUT,
        invoice: { ...INVOICE, payments: [PAYMENT] },
      });
    });

    it('reads a missing checkout page as null', () => {
      let out: StartedPayment | undefined;
      api.pay('inv1').subscribe((r) => (out = r));

      http
        .expectOne(`${BASE}/api/invoices/inv1/payments`)
        .flush({ success: true, payment: PAYMENT, invoice: INVOICE });

      expect(out?.checkout_url).toBeNull();
    });

    it('hands a 422 message to the caller word for word, without a toast', () => {
      let err: ApiError | undefined;
      api.pay('inv1').subscribe({ error: (e: ApiError) => (err = e) });

      http
        .expectOne(`${BASE}/api/invoices/inv1/payments`)
        .flush(
          { success: false, errors: ['This invoice has expired'] },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      expect(err?.status).toBe(422);
      expect(err?.serverMessages?.[0]).toBe('This invoice has expired');
      expect(notify).not.toHaveBeenCalled();
    });

    it('passes a server failure to the caller without a toast', () => {
      let err: ApiError | undefined;
      api.pay('inv1').subscribe({ error: (e: ApiError) => (err = e) });

      http
        .expectOne(`${BASE}/api/invoices/inv1/payments`)
        .flush(
          { success: false, error: 'boom' },
          { status: 500, statusText: 'Server Error' },
        );

      expect(err?.status).toBe(500);
      expect(notify).not.toHaveBeenCalled();
    });
  });
});
