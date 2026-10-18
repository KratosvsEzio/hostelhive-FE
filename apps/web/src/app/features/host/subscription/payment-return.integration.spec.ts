import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import type {
  BillingInvoice,
  BillingSubscription,
  HostBilling,
  SavedCard,
} from '@hostelhive/data-access';
import { BillingApi, HostBillingStore, HostPropertyStore } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { BILLING_RETURN_MODE, BillingReturn } from './billing-return';
import { PaymentCancelled } from './payment-cancelled';
import { PAYMENT_RETURN_ROUTES } from './payment-return.routes';
import { PaymentSuccess } from './payment-success';
import { SAFEPAY_RETURN_KEY } from './safepay-checkout';

function invoice(slug: 'open' | 'paid'): BillingInvoice {
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
    payments: [],
  };
}

describe('PaymentSuccess with the real Safepay checkout', () => {
  let fixture: ComponentFixture<PaymentSuccess>;

  async function open(
    stash: unknown,
    selected: string,
    responses: BillingInvoice[],
  ): Promise<HTMLElement> {
    if (stash !== undefined) {
      window.sessionStorage.setItem(SAFEPAY_RETURN_KEY, JSON.stringify(stash));
    }
    const invoiceReads = vi.fn();
    responses.forEach((r) => invoiceReads.mockReturnValueOnce(of(r)));
    invoiceReads.mockReturnValue(of(responses[responses.length - 1]));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        provideI18nTesting(),
        {
          provide: BillingApi,
          useValue: { refreshInvoicePayments: invoiceReads },
        },
        {
          provide: HostPropertyStore,
          useValue: { selected: signal(selected) },
        },
      ],
    });
    await TestBed.inject(Router).navigateByUrl(
      '/billing/payment/success?invoice=inv1',
    );
    vi.useFakeTimers();
    fixture = TestBed.createComponent(PaymentSuccess);
    return fixture.nativeElement as HTMLElement;
  }

  function settle(ms: number): void {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  const goToBilling = (el: HTMLElement) =>
    el.querySelector('[data-action="go-to-billing"]')?.getAttribute('href');

  afterEach(() => {
    vi.useRealTimers();
    window.sessionStorage.removeItem(SAFEPAY_RETURN_KEY);
    TestBed.resetTestingModule();
  });

  it('goes back to the hostel the payer left from, even after the settled invoice clears the stash', async () => {
    const el = await open(
      { invoiceId: 'inv1', hostelId: 'hostelA' },
      'hostelB',
      [invoice('open'), invoice('paid')],
    );
    settle(0);
    expect(goToBilling(el)).toBeUndefined();

    settle(2500);

    expect(el.textContent).toContain('hostPayment.successTitle');
    expect(window.sessionStorage.getItem(SAFEPAY_RETURN_KEY)).toBeNull();
    expect(goToBilling(el)).toBe('/en/host/hostelA/subscription');
  });

  it('goes to the selected hostel when no stash was left for this invoice', async () => {
    const el = await open(
      { invoiceId: 'other', hostelId: 'hostelA' },
      'hostelB',
      [invoice('paid')],
    );
    settle(0);

    expect(goToBilling(el)).toBe('/en/host/hostelB/subscription');
  });

  it('goes to the selected hostel when there is no stash at all', async () => {
    const el = await open(undefined, 'hostelB', [invoice('paid')]);
    settle(0);

    expect(goToBilling(el)).toBe('/en/host/hostelB/subscription');
  });

  it('goes to the host console when there is neither a stash nor a selected hostel', async () => {
    const el = await open(undefined, '', [invoice('paid')]);
    settle(0);

    expect(goToBilling(el)).toBe('/en/host');
  });
});

const OLD_CARD: SavedCard = { label: 'Visa 4242', expires_on: '2027-01-31' };
const NEW_CARD: SavedCard = { label: 'Visa 1111', expires_on: '2029-12-31' };

const INVOICE_BILLED: BillingSubscription = {
  id: 'sub1',
  status: { id: 1, name: 'Active', slug: 'active', color: null },
  currency: 'PKR',
  plan: { id: 'p1', code: 'growth', name: 'Growth', features: [] },
  current_period_start: null,
  current_period_end: '2026-11-01T00:00:00.000+05:00',
  grace_until: null,
  scheduled_plan: null,
  cancel_at_period_end: false,
  billed_by: 'invoice',
  safepay_status: null,
};

function hostBilling(over: Partial<HostBilling> = {}): HostBilling {
  return {
    currency: 'PKR',
    country_code: 'PK',
    payment_methods: ['safepay'],
    auto_renew: false,
    saved_card: null,
    subscription: INVOICE_BILLED,
    features: [],
    open_invoice: null,
    plans: [],
    ...over,
  };
}

describe('BillingReturn with the real Safepay checkout', () => {
  let fixture: ComponentFixture<BillingReturn>;
  let billingReads: ReturnType<typeof vi.fn>;

  async function open(
    url: string,
    stash: unknown,
    selected: string,
    responses: HostBilling[],
  ): Promise<HTMLElement> {
    if (stash !== undefined) {
      window.sessionStorage.setItem(SAFEPAY_RETURN_KEY, JSON.stringify(stash));
    }
    billingReads = vi.fn();
    responses.forEach((r) => billingReads.mockReturnValueOnce(of(r)));
    billingReads.mockReturnValue(of(responses[responses.length - 1]));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        provideI18nTesting(),
        { provide: BillingApi, useValue: { billing: billingReads } },
        { provide: HostBillingStore, useValue: { accept: vi.fn() } },
        {
          provide: HostPropertyStore,
          useValue: { selected: signal(selected) },
        },
        {
          provide: BILLING_RETURN_MODE,
          useValue: url.includes('/cancel') ? 'cancel' : 'success',
        },
      ],
    });
    await TestBed.inject(Router).navigateByUrl(url);
    vi.useFakeTimers();
    fixture = TestBed.createComponent(BillingReturn);
    return fixture.nativeElement as HTMLElement;
  }

  function settle(ms: number): void {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  const goToBilling = (el: HTMLElement) =>
    el.querySelector('[data-action="go-to-billing"]')?.getAttribute('href');

  afterEach(() => {
    vi.useRealTimers();
    window.sessionStorage.removeItem(SAFEPAY_RETURN_KEY);
    TestBed.resetTestingModule();
  });

  it('waits for the card to replace the stashed one, then clears the stash but keeps its hostel', async () => {
    const el = await open(
      '/billing/payment/success?card=saved?tracker=track_1',
      { kind: 'card', hostelId: 'hostelA', previous: OLD_CARD },
      'hostelB',
      [hostBilling({ saved_card: OLD_CARD }), hostBilling({ saved_card: NEW_CARD })],
    );
    settle(0);

    expect(billingReads).toHaveBeenCalledWith('hostelA');
    expect(el.textContent).toContain('hostPayment.cardConfirmingTitle');
    expect(window.sessionStorage.getItem(SAFEPAY_RETURN_KEY)).not.toBeNull();

    settle(2500);

    expect(el.textContent).toContain('hostPayment.cardSavedTitle');
    expect(window.sessionStorage.getItem(SAFEPAY_RETURN_KEY)).toBeNull();
    expect(goToBilling(el)).toBe('/en/host/hostelA/subscription');
  });

  it('reads the selected hostel when the stash was left by an invoice payment', async () => {
    const el = await open(
      '/billing/payment/success?subscription=started',
      { kind: 'invoice', invoiceId: 'inv1', hostelId: 'hostelA' },
      'hostelB',
      [
        hostBilling({
          subscription: {
            ...INVOICE_BILLED,
            billed_by: 'safepay_subscription',
            safepay_status: 'TRAILING',
          },
        }),
      ],
    );
    settle(0);

    expect(billingReads).toHaveBeenCalledWith('hostelB');
    expect(el.textContent).toContain('hostPayment.trialStartedTitle');
    expect(goToBilling(el)).toBe('/en/host/hostelB/subscription');
  });

  it('offers the trial again after a cancelled subscribe, from the stashed plan', async () => {
    const el = await open(
      '/billing/payment/cancel?subscription=canceled',
      { kind: 'subscription', hostelId: 'hostelA', planId: 'p2' },
      '',
      [
        hostBilling({
          plans: [{ id: 'p2', trial_days: 14 } as HostBilling['plans'][number]],
        }),
      ],
    );
    settle(0);

    expect(el.textContent).toContain('hostPayment.subscriptionCanceledTitle');
    expect(el.querySelector('[data-field="trial-available"]')).not.toBeNull();
    expect(window.sessionStorage.getItem(SAFEPAY_RETURN_KEY)).toBeNull();
  });

  it('sends the host to their hostels with neither a stash nor a selected hostel', async () => {
    const el = await open('/billing/payment/success?card=saved', undefined, '', [
      hostBilling(),
    ]);
    settle(0);

    expect(billingReads).not.toHaveBeenCalled();
    expect(el.textContent).toContain('hostPayment.missingHostelTitle');
    expect(
      el.querySelector('[data-action="go-to-hostels"]')?.getAttribute('href'),
    ).toBe('/en/host');
  });
});

describe('the return routes, end to end', () => {
  async function land(url: string): Promise<unknown> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'billing/payment', children: PAYMENT_RETURN_ROUTES },
        ]),
        provideI18nTesting(),
        {
          provide: BillingApi,
          useValue: {
            billing: vi.fn(() => of(hostBilling())),
            invoice: vi.fn(() => of(invoice('open'))),
            refreshInvoicePayments: vi.fn(() => of(invoice('open'))),
          },
        },
        { provide: HostBillingStore, useValue: { accept: vi.fn() } },
        { provide: HostPropertyStore, useValue: { selected: signal('h1') } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness.routeDebugElement?.componentInstance;
  }

  afterEach(() => TestBed.resetTestingModule());

  it.each([
    ['/billing/payment/success?invoice=inv1', PaymentSuccess],
    ['/billing/payment/success?invoice=inv1?tracker=track_1', PaymentSuccess],
    ['/billing/payment/cancel?invoice=inv1', PaymentCancelled],
    ['/billing/payment/success?card=saved?tracker=track_1', BillingReturn],
    ['/billing/payment/success?subscription=started', BillingReturn],
    ['/billing/payment/cancel?card=canceled', BillingReturn],
    ['/billing/payment/cancel?subscription=canceled', BillingReturn],
  ])('renders %s with its page', async (url, page) => {
    expect(await land(url)).toBeInstanceOf(page);
  });

  it('tells the card page which address it came back by', async () => {
    const page = (await land('/billing/payment/cancel?card=canceled')) as {
      intent: unknown;
    };

    expect(page.intent).toEqual({ subject: 'card', outcome: 'canceled' });
  });
});
