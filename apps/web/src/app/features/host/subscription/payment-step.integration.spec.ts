import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import type {
  ApiError,
  BillingInvoice,
  HostBilling,
  SavedCard,
} from '@hostelhive/data-access';
import { BillingApi, HostBillingStore, HostPropertyStore } from '@services';
import { SessionStore } from '@core/auth/session-store';
import { ExternalNavigation } from '@core/browser/external-navigation';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { PaymentStep } from './payment-step';
import { SAFEPAY_RETURN_KEY } from './safepay-checkout';

const SAFEPAY_URL = 'https://sandbox.api.getsafepay.com/embedded/?x=1';

const CARD: SavedCard = { label: 'Visa •••• 4242', expires_on: '2027-12-31' };

const DECLINED: ApiError = {
  status: 422,
  code: 'error',
  message: 'internal',
  serverMessages: ['Your card was declined: Insufficient funds'],
};

function hostBilling(over: Partial<HostBilling> = {}): HostBilling {
  return {
    currency: 'PKR',
    country_code: 'PK',
    payment_methods: ['safepay'],
    auto_renew: false,
    saved_card: null,
    subscription: null,
    features: [],
    open_invoice: null,
    plans: [],
    ...over,
  };
}

function openInvoice(): BillingInvoice {
  return {
    id: 'inv0Ab',
    number: 'HH-2026-0007',
    kind: 'new',
    currency: 'PKR',
    total: '5000',
    period_start: '2026-10-11T09:00:00+05:00',
    period_end: '2026-11-11T09:00:00+05:00',
    expires_at: null,
    paid_at: null,
    voided_at: null,
    created_at: '2026-10-11T09:00:00+05:00',
    invoice_pdf_url: null,
    plan: { id: 'pBasic', code: 'basic', name: 'Basic', features: [] },
    lines: [{ description: 'Basic plan', amount: '5000' }],
    status: { id: 1, name: 'Open', slug: 'open', color: null },
    payments: [],
  };
}

describe('PaymentStep with the real Safepay checkout', () => {
  let harness: RouterTestingHarness;
  let assign: ReturnType<typeof vi.fn>;
  let pay: ReturnType<typeof vi.fn>;
  let saveCard: ReturnType<typeof vi.fn>;

  async function open(
    checkoutUrl: string | null,
    billing: HostBilling | null = null,
  ): Promise<HTMLElement> {
    assign = vi.fn();
    pay = vi.fn(() => of({ checkout_url: checkoutUrl }));
    saveCard = vi.fn(() => of({ checkout_url: checkoutUrl }));
    TestBed.configureTestingModule({
      providers: [
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
        {
          provide: BillingApi,
          useValue: {
            invoice: vi.fn(() => of(openInvoice())),
            pay,
            saveCard,
            payWithSavedCard: vi.fn(() => throwError(() => DECLINED)),
          },
        },
        {
          provide: HostBillingStore,
          useValue: {
            hostelId: signal('nHelLt'),
            billing: signal(billing),
            refresh: vi.fn(),
          },
        },
        { provide: ExternalNavigation, useValue: { assign } },
        {
          provide: SessionStore,
          useValue: { hasPermission: () => true },
        },
        {
          provide: HostPropertyStore,
          useValue: { selected: signal('other') },
        },
      ],
    });
    harness = await RouterTestingHarness.create();
    await TestBed.inject(Router).navigateByUrl(
      '/host/nHelLt/subscription/pay/inv0Ab',
    );
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  function payButton(el: HTMLElement): HTMLButtonElement | null {
    return el.querySelector('button[data-testid="pay"]');
  }

  function clickPay(el: HTMLElement): void {
    payButton(el)?.click();
    harness.detectChanges();
  }

  afterEach(() => {
    window.sessionStorage.removeItem(SAFEPAY_RETURN_KEY);
    TestBed.resetTestingModule();
  });

  it('leaves for the Safepay page unchanged and remembers where the payer came from', async () => {
    const el = await open(SAFEPAY_URL);

    clickPay(el);

    expect(pay).toHaveBeenCalledWith('inv0Ab', { saveCard: false });
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(SAFEPAY_URL);
    expect(
      JSON.parse(window.sessionStorage.getItem(SAFEPAY_RETURN_KEY) ?? 'null'),
    ).toEqual({ kind: 'invoice', invoiceId: 'inv0Ab', hostelId: 'nHelLt' });
    expect(payButton(el)?.getAttribute('aria-busy')).toBe('true');
  });

  it.each([
    ['a page outside Safepay', 'https://evil.example/embedded/?x=1'],
    ['a look-alike host', 'https://notgetsafepay.com/embedded/'],
    ['an insecure Safepay page', 'http://sandbox.api.getsafepay.com/embedded/'],
    ['no page at all', null],
  ])(
    'refuses %s, goes nowhere and lets the payer try again',
    async (_label, url) => {
      const el = await open(url);

      clickPay(el);

      expect(assign).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(SAFEPAY_RETURN_KEY)).toBeNull();
      expect(
        el.querySelector('[data-testid="start-failed"]')?.textContent,
      ).toContain('hostPayment.startFailed');
      expect(payButton(el)?.hasAttribute('disabled')).toBe(false);

      clickPay(el);
      expect(pay).toHaveBeenCalledTimes(2);
    },
  );

  it('asks Safepay to keep the card when the payer ticks the box', async () => {
    const el = await open(SAFEPAY_URL, hostBilling());

    el.querySelector<HTMLInputElement>(
      'input[data-testid="save-card"]',
    )?.click();
    harness.detectChanges();
    clickPay(el);

    expect(pay).toHaveBeenCalledWith('inv0Ab', { saveCard: true });
    expect(assign).toHaveBeenCalledWith(SAFEPAY_URL);
  });

  it('after a decline, Update card leaves to save a card and remembers the invoice it came from', async () => {
    const el = await open(
      SAFEPAY_URL,
      hostBilling({
        payment_methods: ['safepay', 'saved_card'],
        saved_card: CARD,
        auto_renew: true,
      }),
    );

    el.querySelector<HTMLButtonElement>(
      'button[data-testid="pay-saved-card"]',
    )?.click();
    harness.detectChanges();
    Array.from(
      el.querySelectorAll<HTMLButtonElement>(
        '[data-testid="charge-confirm"] div.flex.gap-3 button',
      ),
    )
      .at(-1)
      ?.click();
    harness.detectChanges();

    el.querySelector<HTMLButtonElement>(
      'button[data-testid="update-card"]',
    )?.click();
    harness.detectChanges();

    expect(saveCard).toHaveBeenCalledWith('nHelLt');
    expect(assign).toHaveBeenCalledWith(SAFEPAY_URL);
    expect(
      JSON.parse(window.sessionStorage.getItem(SAFEPAY_RETURN_KEY) ?? 'null'),
    ).toEqual({
      kind: 'card',
      hostelId: 'nHelLt',
      previous: CARD,
      invoiceId: 'inv0Ab',
    });
  });
});
