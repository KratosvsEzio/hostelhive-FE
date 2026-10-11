import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import type { BillingInvoice } from '@hostelhive/data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { InvoiceSummary } from './invoice-summary';

// Only the keys that take a parameter carry copy, so the spec can see what was passed in.
const COPY = {
  hostBilling: {
    kindNew: 'New plan · {{start}} – {{end}}',
    kindRenewal: 'Renewal · {{start}} – {{end}}',
    kindUpgrade: 'Upgrade charge · {{start}} – {{end}}',
    forPeriod: '{{start}} – {{end}}',
  },
};

function invoice(over: Partial<BillingInvoice> = {}): BillingInvoice {
  return {
    id: 'inv1',
    number: 'HH-2026-0042',
    kind: 'new',
    currency: 'PKR',
    total: '5000.00',
    period_start: '2026-10-12T00:00:00.000+05:00',
    period_end: '2026-11-12T00:00:00.000+05:00',
    expires_at: '2026-10-19T23:59:59.000+05:00',
    paid_at: null,
    voided_at: null,
    created_at: '2026-10-11T10:00:00.000+05:00',
    invoice_pdf_url: null,
    plan: { id: 'pl1', code: 'pro', name: 'Pro', features: ['boost'] },
    lines: [{ description: 'Pro plan, monthly', amount: '5000.00' }],
    status: { id: 1, name: 'Open', slug: 'open', color: null },
    payments: [],
    ...over,
  };
}

@Component({
  imports: [InvoiceSummary],
  template: `<hh-invoice-summary [invoice]="invoice" />`,
})
class Host {
  invoice: BillingInvoice = invoice();
}

describe('InvoiceSummary', () => {
  let fixture: ComponentFixture<Host>;

  function render(inv: BillingInvoice): HTMLElement {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideI18nTesting()],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.invoice = inv;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const field = (el: HTMLElement, name: string) =>
    el.querySelector(`[data-field="${name}"]`)?.textContent?.trim() ?? null;
  const text = (node: Element | null | undefined) =>
    node?.textContent?.trim() ?? null;
  const lines = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('[data-field="line"]'));
  const total = (el: HTMLElement) =>
    text(el.querySelector('[data-field="total"] dd bdi'));

  afterEach(() => TestBed.resetTestingModule());

  it('is headed by the summary title', () => {
    const el = render(invoice());

    expect(text(el.querySelector('h2'))).toBe('hostPayment.summaryTitle');
  });

  it('shows the plan name', () => {
    const el = render(invoice());

    expect(text(el.querySelector('[data-field="plan"] dt'))).toBe(
      'hostPayment.plan',
    );
    expect(text(el.querySelector('[data-field="plan"] dd'))).toBe('Pro');
  });

  it('leaves the plan row out when the invoice has no plan', () => {
    const el = render(invoice({ plan: null }));

    expect(el.querySelector('[data-field="plan"]')).toBeNull();
  });

  it('lists each line as returned, its amount kept together for RTL', () => {
    const el = render(
      invoice({
        total: '7000.00',
        lines: [
          { description: 'Pro plan, monthly', amount: '5000.00' },
          { description: 'Boost add-on', amount: '2000.00' },
        ],
      }),
    );

    const rows = lines(el);
    expect(rows).toHaveLength(2);
    expect(text(rows[0].querySelector('dt'))).toBe('Pro plan, monthly');
    expect(text(rows[0].querySelector('dd bdi'))).toBe('PKR 5,000');
    expect(text(rows[1].querySelector('dt'))).toBe('Boost add-on');
    expect(text(rows[1].querySelector('dd bdi'))).toBe('PKR 2,000');
  });

  it('shows the total the API sent, not a sum of the lines', () => {
    const el = render(
      invoice({
        total: '4250.00',
        lines: [
          { description: 'Pro plan, monthly', amount: '5000.00' },
          { description: 'Boost add-on', amount: '2000.00' },
        ],
      }),
    );

    expect(text(el.querySelector('[data-field="total"] dt'))).toBe(
      'hostPayment.total',
    );
    expect(total(el)).toBe('PKR 4,250');
  });

  it('shows only the total when the invoice has no lines', () => {
    const el = render(invoice({ lines: [] }));

    expect(lines(el)).toHaveLength(0);
    expect(total(el)).toBe('PKR 5,000');
  });

  it('formats a USD amount with its symbol', () => {
    const el = render(
      invoice({
        currency: 'USD',
        total: '18.50',
        lines: [{ description: 'Pro plan, monthly', amount: '18.50' }],
      }),
    );

    expect(text(lines(el)[0].querySelector('dd bdi'))).toBe('$18.50');
    expect(total(el)).toBe('$18.50');
  });

  describe('purpose line', () => {
    it('new: first payment for the period, dates only', () => {
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

  it('shows no invoice number, status or deadline', () => {
    const el = render(invoice());

    expect(el.textContent).not.toContain('HH-2026-0042');
    expect(el.querySelector('hh-status-pill')).toBeNull();
    expect(el.textContent).not.toContain('hostBilling.payBy');
    expect(el.textContent).not.toContain('19 Oct 2026');
  });
});
