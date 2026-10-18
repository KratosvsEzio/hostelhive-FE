import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import type { OpenInvoice, SavedCard } from '@hostelhive/data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { PaymentDue } from './payment-due';

// Only the keys that take a parameter carry copy, so the spec can see what was passed in.
const COPY = {
  hostBilling: {
    invoiceNumber: 'Invoice {{number}}',
    kindNew: 'New plan · {{start}} – {{end}}',
    kindRenewal: 'Renewal · {{start}} – {{end}}',
    kindUpgrade: 'Upgrade charge · {{start}} – {{end}}',
    forPeriod: '{{start}} – {{end}}',
    payBy: 'Pay by {{date}}',
    autoChargeNotice: "We'll charge {{card}} on {{date}}. You can also pay now.",
  },
};

const CARD: SavedCard = { label: 'Visa •••• 4242', expires_on: '2028-04-30' };

const PAY_LINK = '/host/nHelLt/subscription/pay/inv1';

function invoice(over: Partial<OpenInvoice> = {}): OpenInvoice {
  return {
    id: 'inv1',
    number: 'HH-2026-0042',
    kind: 'new',
    total: '5000.00',
    currency: 'PKR',
    period_start: '2026-10-12T00:00:00.000+05:00',
    period_end: '2026-11-12T00:00:00.000+05:00',
    expires_at: '2026-10-19T23:59:59.000+05:00',
    awaiting_verification: false,
    ...over,
  };
}

@Component({
  imports: [PaymentDue],
  template: `<hh-payment-due
    [invoice]="invoice"
    [payLink]="payLink"
    [canPay]="canPay"
    [autoRenew]="autoRenew"
    [card]="card"
    [chargeOn]="chargeOn"
  />`,
})
class Host {
  invoice: OpenInvoice = invoice();
  payLink = PAY_LINK;
  canPay = true;
  autoRenew = false;
  card: SavedCard | null = null;
  chargeOn: string | null = null;
}

type Renewal = Partial<Pick<Host, 'autoRenew' | 'card' | 'chargeOn'>>;

describe('PaymentDue', () => {
  let fixture: ComponentFixture<Host>;

  function render(
    inv: OpenInvoice,
    canPay = true,
    renewal: Renewal = {},
  ): HTMLElement {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRouter([]), provideI18nTesting()],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.invoice = inv;
    fixture.componentInstance.canPay = canPay;
    Object.assign(fixture.componentInstance, renewal);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const field = (el: HTMLElement, name: string) =>
    el.querySelector(`[data-field="${name}"]`)?.textContent?.trim() ?? null;
  const payButton = (el: HTMLElement) =>
    el.querySelector<HTMLAnchorElement>('a[hh-button]');

  afterEach(() => TestBed.resetTestingModule());

  it('shows the title, the invoice number and the amount kept together for RTL', () => {
    const el = render(invoice());

    expect(el.textContent).toContain('hostBilling.paymentDueTitle');
    expect(field(el, 'number')).toBe('Invoice HH-2026-0042');
    expect(
      el.querySelector('[data-field="amount"] bdi')?.textContent?.trim(),
    ).toBe('PKR 5,000');
  });

  it('formats a USD amount with its symbol', () => {
    const el = render(invoice({ total: '18.50', currency: 'USD' }));

    expect(
      el.querySelector('[data-field="amount"] bdi')?.textContent?.trim(),
    ).toBe('$18.50');
  });

  describe('purpose line', () => {
    it('new: first payment for the period', () => {
      const el = render(invoice({ kind: 'new' }));

      expect(field(el, 'purpose')).toBe(
        'New plan · 12 Oct 2026 – 12 Nov 2026',
      );
    });

    it('renewal: renewal for the period', () => {
      const el = render(invoice({ kind: 'renewal' }));

      expect(field(el, 'purpose')).toBe('Renewal · 12 Oct 2026 – 12 Nov 2026');
    });

    it('upgrade: upgrade charge for the period', () => {
      const el = render(invoice({ kind: 'upgrade' }));

      expect(field(el, 'purpose')).toBe(
        'Upgrade charge · 12 Oct 2026 – 12 Nov 2026',
      );
    });

    it('an unknown kind: the period alone', () => {
      const el = render(invoice({ kind: 'adjustment' }));

      expect(field(el, 'purpose')).toBe('12 Oct 2026 – 12 Nov 2026');
    });

    it('is left out when the invoice has no period', () => {
      const el = render(invoice({ period_start: null, period_end: null }));

      expect(field(el, 'purpose')).toBeNull();
    });
  });

  it('shows the deadline with date and time, in the offset the API sent', () => {
    const el = render(invoice());

    expect(field(el, 'pay-by')).toBe('Pay by 19 Oct 2026, 11:59 PM');
  });

  it('leaves the deadline out when the invoice has none', () => {
    const el = render(invoice({ expires_at: null }));

    expect(field(el, 'pay-by')).toBeNull();
  });

  it('offers one primary Pay link to the payment step', () => {
    const el = render(invoice());
    const pay = payButton(el);

    expect(pay?.textContent?.trim()).toBe('hostBilling.pay');
    // The locale link may prefix the language; the path after it is the payment step's.
    expect(pay?.getAttribute('href')?.endsWith(PAY_LINK)).toBe(true);
    expect(pay?.className).toContain('bg-brand-500');
    expect(el.querySelectorAll('a[hh-button], button').length).toBe(1);
  });

  describe('awaiting verification', () => {
    it('replaces Pay with the under-review pill and its hint', () => {
      const el = render(invoice({ awaiting_verification: true }));

      expect(payButton(el)).toBeNull();
      expect(el.querySelector('hh-status-pill')?.textContent?.trim()).toBe(
        'hostBilling.underReview',
      );
      expect(el.textContent).toContain('hostBilling.underReviewHint');
    });

    it('keeps the number, amount and purpose', () => {
      const el = render(
        invoice({ awaiting_verification: true, kind: 'renewal' }),
      );

      expect(field(el, 'number')).toBe('Invoice HH-2026-0042');
      expect(
        el.querySelector('[data-field="amount"] bdi')?.textContent?.trim(),
      ).toBe('PKR 5,000');
      expect(field(el, 'purpose')).toBe('Renewal · 12 Oct 2026 – 12 Nov 2026');
    });

    it('drops the pay-by deadline, since the host has already paid', () => {
      const el = render(invoice({ awaiting_verification: true }));

      expect(field(el, 'pay-by')).toBeNull();
    });

    it('shows the pill even for someone who cannot pay', () => {
      const el = render(invoice({ awaiting_verification: true }), false);

      expect(el.querySelector('hh-status-pill')).not.toBeNull();
    });
  });

  describe('automatic renewal charge', () => {
    const AUTO: Renewal = {
      autoRenew: true,
      card: CARD,
      chargeOn: '2026-11-12T10:00:00.000+05:00',
    };
    const plain = (s: string | null) => (s ?? '').replace(/[⁨⁩]/g, '');

    it('says which card is charged on the renewal date, and keeps Pay', () => {
      const el = render(invoice({ kind: 'renewal' }), true, AUTO);

      expect(plain(field(el, 'auto-charge'))).toBe(
        "We'll charge Visa •••• 4242 on 12 Nov 2026. You can also pay now.",
      );
      expect(payButton(el)?.textContent?.trim()).toBe('hostBilling.pay');
    });

    it('isolates the card label for RTL', () => {
      const el = render(invoice({ kind: 'renewal' }), true, AUTO);

      expect(field(el, 'auto-charge')).toContain('⁨Visa •••• 4242⁩');
    });

    it('falls back to the invoice period start without a charge date', () => {
      const el = render(invoice({ kind: 'renewal' }), true, {
        ...AUTO,
        chargeOn: null,
      });

      expect(plain(field(el, 'auto-charge'))).toBe(
        "We'll charge Visa •••• 4242 on 12 Oct 2026. You can also pay now.",
      );
    });

    it('says nothing without automatic renewal', () => {
      const el = render(invoice({ kind: 'renewal' }), true, {
        ...AUTO,
        autoRenew: false,
      });

      expect(field(el, 'auto-charge')).toBeNull();
    });

    it('says nothing without a saved card', () => {
      const el = render(invoice({ kind: 'renewal' }), true, {
        ...AUTO,
        card: null,
      });

      expect(field(el, 'auto-charge')).toBeNull();
    });

    it('says nothing for an invoice that is not a renewal', () => {
      for (const kind of ['new', 'upgrade']) {
        TestBed.resetTestingModule();
        const el = render(invoice({ kind }), true, AUTO);

        expect(field(el, 'auto-charge')).toBeNull();
      }
    });

    it('says nothing while a bank transfer for it is under review', () => {
      const el = render(
        invoice({ kind: 'renewal', awaiting_verification: true }),
        true,
        AUTO,
      );

      expect(field(el, 'auto-charge')).toBeNull();
    });

    it('still says it for someone who cannot pay', () => {
      const el = render(invoice({ kind: 'renewal' }), false, AUTO);

      expect(field(el, 'auto-charge')).not.toBeNull();
      expect(payButton(el)).toBeNull();
    });
  });

  describe('canPay false', () => {
    it('shows no Pay link and no pill', () => {
      const el = render(invoice(), false);

      expect(payButton(el)).toBeNull();
      expect(el.querySelector('hh-status-pill')).toBeNull();
    });

    it('still shows what is owed', () => {
      const el = render(invoice(), false);

      expect(field(el, 'number')).toBe('Invoice HH-2026-0042');
      expect(field(el, 'pay-by')).toBe('Pay by 19 Oct 2026, 11:59 PM');
    });
  });
});
