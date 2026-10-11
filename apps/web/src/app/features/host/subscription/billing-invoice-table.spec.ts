import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import type { BillingInvoiceRow } from '@hostelhive/data-access';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import {
  type BillingHistoryQuery,
  BillingInvoiceTable,
} from './billing-invoice-table';

const COPY = {
  hostBilling: { forPeriod: '{{start}} – {{end}}' },
  hostBillingHistory: {
    tableCaption: 'Invoices for this hostel',
    kindNew: 'New plan',
    kindRenewal: 'Renewal',
    kindUpgrade: 'Upgrade',
    statusOpen: 'Unpaid',
    statusPaid: 'Paid',
    statusVoid: 'Closed',
    pdf: 'PDF',
    pdfAria: 'Download receipt for invoice {{number}}',
    preparingShort: 'Preparing…',
  },
};

const PDF_URL = 'https://files.example.com/receipts/abc.pdf';

// Every in-app link carries the active language, English included.
const DETAIL = '/en/host/nHelLt/subscription/invoices/inv1';

function row(over: Partial<BillingInvoiceRow> = {}): BillingInvoiceRow {
  return {
    id: 'inv1',
    number: 'HH-2026-0001',
    kind: 'new',
    currency: 'PKR',
    total: '5000.00',
    period_start: '2026-10-11T09:00:00+05:00',
    period_end: '2026-11-11T09:00:00+05:00',
    expires_at: null,
    paid_at: '2026-10-11T09:10:00+05:00',
    voided_at: null,
    created_at: '2026-10-11T09:00:00+05:00',
    invoice_pdf_url: PDF_URL,
    status: { id: 2, name: 'Paid', slug: 'paid', color: null },
    plan: { id: 'pBasic', code: 'basic', name: 'Basic' },
    lines: [{ description: 'Basic plan', amount: '5000.00' }],
    ...over,
  };
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('BillingInvoiceTable', () => {
  let fixture: ComponentFixture<BillingInvoiceTable>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  function render(
    rows: BillingInvoiceRow[],
    historyQuery?: BillingHistoryQuery,
  ): HTMLElement {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideI18nTesting()],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    navigateByUrl = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);
    fixture = TestBed.createComponent(BillingInvoiceTable);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('hostelId', 'nHelLt');
    if (historyQuery)
      fixture.componentRef.setInput('historyQuery', historyQuery);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function tableRow(el: HTMLElement, id = 'inv1'): HTMLElement {
    return el.querySelector(
      `[data-testid="invoice-table"] tr[data-invoice="${id}"]`,
    ) as HTMLElement;
  }

  function card(el: HTMLElement, id = 'inv1'): HTMLElement {
    return el.querySelector(
      `[data-testid="invoice-cards"] li[data-invoice="${id}"]`,
    ) as HTMLElement;
  }

  function cell(scope: HTMLElement, field: string): HTMLElement | null {
    return scope.querySelector(`[data-field="${field}"]`);
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('table structure', () => {
    it('has a screen-reader caption and a column header per column', () => {
      const el = render([row()]);
      const caption = el.querySelector('caption');
      const headers = Array.from(el.querySelectorAll('thead th'));

      expect(caption?.classList).toContain('sr-only');
      expect(text(caption)).toBe('Invoices for this hostel');
      expect(headers).toHaveLength(7);
      expect(headers.every((h) => h.getAttribute('scope') === 'col')).toBe(
        true,
      );
      expect(headers.map((h) => text(h))).toEqual([
        'hostBillingHistory.colInvoice',
        'hostBillingHistory.colDate',
        'hostBillingHistory.colType',
        'hostBillingHistory.colPeriod',
        'hostBillingHistory.colTotal',
        'hostBillingHistory.colStatus',
        'hostBillingHistory.colReceipt',
      ]);
    });

    it('renders every row both as a table row and as a small-screen card', () => {
      const el = render([row(), row({ id: 'inv2', number: 'HH-2026-0002' })]);

      expect(
        el.querySelectorAll('[data-testid="invoice-table"] tbody tr'),
      ).toHaveLength(2);
      expect(
        el.querySelectorAll('[data-testid="invoice-cards"] li'),
      ).toHaveLength(2);
      expect(
        el.querySelector('[data-testid="invoice-cards"]')?.classList,
      ).toContain('sm:hidden');
    });
  });

  describe('cells', () => {
    it('shows the number as returned, isolated, linking to the invoice', () => {
      const el = render([row()]);
      const link = cell(tableRow(el), 'number')?.querySelector('a');

      expect(link?.querySelector('bdi')?.textContent).toBe('HH-2026-0001');
      expect(link?.getAttribute('href')).toBe(DETAIL);
    });

    it('shows the issue date, date only', () => {
      const el = render([row()]);

      expect(text(cell(tableRow(el), 'date'))).toBe('11 Oct 2026');
    });

    it.each([
      ['new', 'New plan'],
      ['renewal', 'Renewal'],
      ['upgrade', 'Upgrade'],
      ['trial', '—'],
    ])('labels kind %s as "%s", without the period', (kind, label) => {
      const el = render([row({ kind })]);

      expect(text(cell(tableRow(el), 'kind'))).toBe(label);
      expect(text(cell(card(el), 'kind'))).toBe(label);
    });

    it('shows the period as an isolated date range', () => {
      const el = render([row()]);
      const period = cell(tableRow(el), 'period');

      expect(text(period?.querySelector('bdi'))).toBe(
        '11 Oct 2026 – 11 Nov 2026',
      );
    });

    it('shows a dash when the period has no end', () => {
      const el = render([row({ period_end: null })]);

      expect(text(cell(tableRow(el), 'period'))).toBe('—');
    });

    it('shows a dash when the period has no start', () => {
      const el = render([row({ period_start: null })]);

      expect(text(cell(tableRow(el), 'period'))).toBe('—');
      expect(text(cell(card(el), 'period'))).toBe('—');
    });

    it.each([
      ['5000.00', 'PKR', 'PKR 5,000'],
      ['18.00', 'USD', '$18'],
      ['18.50', 'USD', '$18.50'],
    ])(
      'shows total %s %s as "%s" inside <bdi>, in the row’s own currency',
      (total, currency, shown) => {
        const el = render([row({ total, currency })]);

        expect(text(cell(tableRow(el), 'total')?.querySelector('bdi'))).toBe(
          shown,
        );
        expect(text(cell(card(el), 'total')?.querySelector('bdi'))).toBe(shown);
      },
    );

    it('puts rows in different currencies side by side without a total', () => {
      const el = render([
        row(),
        row({ id: 'inv2', total: '18.00', currency: 'USD' }),
      ]);

      expect(text(cell(tableRow(el, 'inv1'), 'total'))).toBe('PKR 5,000');
      expect(text(cell(tableRow(el, 'inv2'), 'total'))).toBe('$18');
      expect(el.querySelector('tfoot')).toBeNull();
    });

    it.each([
      ['open', 'Open', 'Unpaid', 'warn'],
      ['paid', 'Paid', 'Paid', 'ok'],
      ['void', 'Void', 'Closed', 'neutral'],
      ['refunded', 'Refunded', 'Refunded', 'neutral'],
    ])(
      'shows status %s with our label and tone (server name only when unknown)',
      (slug, name, label, tone) => {
        const el = render([
          row({ status: { id: 9, name, slug, color: null } }),
        ]);
        const pill = cell(tableRow(el), 'status')?.querySelector(
          'hh-status-pill',
        );

        expect(text(pill)).toBe(label);
        expect(pill?.getAttribute('data-tone')).toBe(tone);
      },
    );

    it.each([
      ['paid', 'Settled', 'Paid', 'ok'],
      ['void', 'Voided', 'Closed', 'neutral'],
      ['open', 'Awaiting payment', 'Unpaid', 'warn'],
    ])(
      'shows our label for %s even when the server calls it "%s"',
      (slug, name, label, tone) => {
        const el = render([
          row({ status: { id: 9, name, slug, color: null } }),
        ]);
        const pill = cell(tableRow(el), 'status')?.querySelector(
          'hh-status-pill',
        );

        expect(text(pill)).toBe(label);
        expect(pill?.getAttribute('data-tone')).toBe(tone);
        expect(text(cell(card(el), 'status'))).toBe(label);
      },
    );

    it('ignores the status colour object', () => {
      const el = render([
        row({
          status: {
            id: 2,
            name: 'Paid',
            slug: 'paid',
            color: {
              id: 1,
              primary: '#ff0000',
              secondary: null,
              tertiary: null,
            },
          },
        }),
      ]);
      const pill = cell(tableRow(el), 'status')?.querySelector(
        'hh-status-pill',
      ) as HTMLElement;

      expect(pill.getAttribute('style')).toBeNull();
      expect(pill.getAttribute('data-tone')).toBe('ok');
    });
  });

  describe('receipt cell', () => {
    it('links to the PDF in a new tab when the invoice has one', () => {
      const el = render([row()]);
      const link = cell(tableRow(el), 'receipt')?.querySelector(
        'a[data-testid="pdf-link"]',
      );

      expect(link?.getAttribute('href')).toBe(PDF_URL);
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link?.hasAttribute('download')).toBe(false);
      expect(link?.getAttribute('aria-label')).toBe(
        'Download receipt for invoice HH-2026-0001',
      );
      expect(text(link)).toBe('PDF');
    });

    it('shows "Preparing…" linking to the detail for a paid invoice without a PDF yet', () => {
      const el = render([row({ invoice_pdf_url: null })]);
      const receipt = cell(tableRow(el), 'receipt');
      const preparing = receipt?.querySelector(
        'a[data-testid="pdf-preparing"]',
      );

      expect(receipt?.querySelector('[data-testid="pdf-link"]')).toBeNull();
      expect(text(preparing)).toBe('Preparing…');
      expect(preparing?.getAttribute('href')).toBe(DETAIL);
    });

    it.each(['open', 'void'])('shows a dash for a %s invoice', (slug) => {
      const el = render([
        row({
          invoice_pdf_url: null,
          status: { id: 1, name: slug, slug, color: null },
        }),
      ]);
      const receipt = cell(tableRow(el), 'receipt');

      expect(receipt?.querySelector('a')).toBeNull();
      expect(text(receipt)).toBe('—');
    });

    it('keeps number, total, status and receipt on the small-screen card', () => {
      const el = render([row()]);
      const c = card(el);

      expect(text(cell(c, 'number'))).toBe('HH-2026-0001');
      expect(text(cell(c, 'total'))).toBe('PKR 5,000');
      expect(text(cell(c, 'status'))).toBe('Paid');
      expect(c.querySelector('[data-testid="pdf-link"]')).not.toBeNull();
    });
  });

  describe('opening an invoice', () => {
    it('opens the detail with the history query when the row is clicked', () => {
      const el = render([row()], { status: 'paid', page: 2 });

      cell(tableRow(el), 'date')?.click();

      expect(navigateByUrl).toHaveBeenCalledTimes(1);
      expect(navigateByUrl).toHaveBeenCalledWith(DETAIL, {
        state: { billingHistoryQuery: { status: 'paid', page: 2 } },
      });
    });

    it('opens the detail when a small-screen card is clicked', () => {
      const el = render([row()]);

      cell(card(el), 'kind')?.click();

      expect(navigateByUrl).toHaveBeenCalledWith(DETAIL, {
        state: { billingHistoryQuery: {} },
      });
    });

    it('keeps the active language on a row click', () => {
      const el = render([row()]);
      TestBed.inject(LocaleStore).apply('ur');
      try {
        cell(tableRow(el), 'date')?.click();

        expect(navigateByUrl).toHaveBeenCalledWith(
          '/ur/host/nHelLt/subscription/invoices/inv1',
          expect.anything(),
        );
      } finally {
        TestBed.inject(LocaleStore).apply('en');
      }
    });

    it('does not open the detail when the PDF link is clicked', () => {
      const el = render([row()]);
      const pdf = cell(tableRow(el), 'receipt')?.querySelector(
        'a[data-testid="pdf-link"]',
      ) as HTMLAnchorElement;
      // jsdom would otherwise try to follow the external link.
      pdf.addEventListener('click', (e) => e.preventDefault());

      pdf.click();

      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it('navigates once, through the link, when the number is clicked', () => {
      const el = render([row()], { status: 'open' });

      (
        cell(tableRow(el), 'number')?.querySelector('a') as HTMLAnchorElement
      ).click();

      expect(navigateByUrl).toHaveBeenCalledTimes(1);
      const [target, extras] = navigateByUrl.mock.calls[0];
      expect(target).toBeInstanceOf(UrlTree);
      expect(String(target)).toBe(DETAIL);
      expect(extras).toMatchObject({
        state: { billingHistoryQuery: { status: 'open' } },
      });
    });

    it('carries the history query on the "Preparing…" link too', () => {
      const el = render([row({ invoice_pdf_url: null })], { page: 3 });

      (
        el.querySelector(
          '[data-testid="invoice-table"] a[data-testid="pdf-preparing"]',
        ) as HTMLAnchorElement
      ).click();

      expect(navigateByUrl).toHaveBeenCalledTimes(1);
      expect(navigateByUrl.mock.calls[0][1]).toMatchObject({
        state: { billingHistoryQuery: { page: 3 } },
      });
    });
  });

  describe('money', () => {
    it('never converts or adds up an amount', () => {
      const source = readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          'billing-invoice-table.ts',
        ),
        'utf8',
      );

      expect(source).not.toMatch(/Number\(|parseFloat|parseInt|total_minor/);
      expect(source).not.toMatch(/\.total\s*[-+*/]|reduce\(/);
    });
  });
});
