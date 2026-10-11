import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import type { BillingInvoice } from '@hostelhive/data-access';
import { BillingApi, HostPropertyStore } from '@services';
import { SessionStore } from '@core/auth/session-store';
import { ExternalNavigation } from '@core/browser/external-navigation';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { PaymentStep } from './payment-step';
import { SAFEPAY_RETURN_KEY } from './safepay-checkout';

const SAFEPAY_URL = 'https://sandbox.api.getsafepay.com/embedded/?x=1';

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

  async function open(checkoutUrl: string | null): Promise<HTMLElement> {
    assign = vi.fn();
    pay = vi.fn(() => of({ checkout_url: checkoutUrl }));
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
          useValue: { invoice: vi.fn(() => of(openInvoice())), pay },
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

    expect(pay).toHaveBeenCalledWith('inv0Ab');
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(SAFEPAY_URL);
    expect(
      JSON.parse(window.sessionStorage.getItem(SAFEPAY_RETURN_KEY) ?? 'null'),
    ).toEqual({ invoiceId: 'inv0Ab', hostelId: 'nHelLt' });
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
});
