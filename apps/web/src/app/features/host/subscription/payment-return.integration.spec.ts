import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import type { BillingInvoice } from '@hostelhive/data-access';
import { BillingApi, HostPropertyStore } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
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
        { provide: BillingApi, useValue: { invoice: invoiceReads } },
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
