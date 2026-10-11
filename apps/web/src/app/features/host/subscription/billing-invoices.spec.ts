import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import type {
  ApiError,
  BillingInvoicePage,
  BillingInvoiceRow,
  BillingInvoiceStatusOption,
} from '@hostelhive/data-access';
import { BillingApi, HostPropertyStore } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { BillingInvoiceTable } from './billing-invoice-table';
import { BillingInvoices } from './billing-invoices';

// Only the keys a test reads as English carry copy; the rest resolve to their key.
const COPY = {
  common: { pageOf: 'Page {{page}} of {{total}}' },
  hostBillingHistory: {
    filterAll: 'All',
    statusOpen: 'Unpaid',
    statusPaid: 'Paid',
    statusVoid: 'Closed',
  },
};

const STATUSES: BillingInvoiceStatusOption[] = [
  { id: 1, name: 'Open', slug: 'open' },
  { id: 2, name: 'Paid', slug: 'paid' },
  { id: 3, name: 'Void', slug: 'void' },
  { id: 4, name: 'Refunded', slug: 'refunded' },
];

const BASE = '/host/nHelLt/subscription/invoices';

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
    invoice_pdf_url: null,
    status: { id: 2, name: 'Paid', slug: 'paid', color: null },
    plan: { id: 'pBasic', code: 'basic', name: 'Basic' },
    lines: [],
    ...over,
  };
}

function result(
  rows: BillingInvoiceRow[],
  page: Partial<BillingInvoicePage['page']> = {},
): BillingInvoicePage {
  return {
    rows,
    statuses: STATUSES,
    page: {
      page: 1,
      total: rows.length,
      totalPages: 1,
      hasNextPage: false,
      ...page,
    },
  };
}

function apiError(status: number): ApiError {
  return { status, code: 'error', message: 'internal' };
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('BillingInvoices', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  let loads: Subject<BillingInvoicePage>[];
  let api: { invoices: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.spyOn>;

  async function open(url = BASE): Promise<HTMLElement> {
    loads = [];
    api = {
      invoices: vi.fn(() => {
        const s = new Subject<BillingInvoicePage>();
        loads.push(s);
        return s.asObservable();
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        // The hostel id lives two routes above the page, as in the real tree.
        provideRouter([
          {
            path: 'host/:hostelId',
            children: [
              {
                path: 'subscription',
                children: [{ path: 'invoices', component: BillingInvoices }],
              },
            ],
          },
        ]),
        provideI18nTesting(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BillingApi, useValue: api },
        {
          provide: HostPropertyStore,
          useValue: { selected: signal('nHelLt') },
        },
      ],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    navigate = vi.spyOn(router, 'navigate');
    harness.detectChanges();
    return el();
  }

  function el(): HTMLElement {
    return harness.routeNativeElement as HTMLElement;
  }

  function respond(page: BillingInvoicePage, index = loads.length - 1): void {
    loads[index].next(page);
    loads[index].complete();
    harness.detectChanges();
  }

  function fail(err: ApiError, index = loads.length - 1): void {
    loads[index].error(err);
    harness.detectChanges();
  }

  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function byTestId(id: string): HTMLElement | null {
    return el().querySelector(`[data-testid="${id}"]`);
  }

  function chipLabels(): string[] {
    return Array.from(
      el().querySelectorAll('[data-testid="status-filter"] button'),
    ).map((b) => text(b));
  }

  function chip(label: string): HTMLButtonElement {
    return Array.from(
      el().querySelectorAll<HTMLButtonElement>(
        '[data-testid="status-filter"] button',
      ),
    ).find((b) => text(b) === label) as HTMLButtonElement;
  }

  function table(): BillingInvoiceTable | null {
    const debug = harness.fixture.debugElement.query(
      By.directive(BillingInvoiceTable),
    );
    return debug ? (debug.componentInstance as BillingInvoiceTable) : null;
  }

  const WRITE = { queryParamsHandling: 'merge', replaceUrl: true };

  afterEach(() => TestBed.resetTestingModule());

  describe('frame', () => {
    it('sits in the dashboard layout under "Billing", with its own heading', async () => {
      await open();

      expect(text(el().querySelector('app-dashboard-layout header h1'))).toBe(
        'hostBilling.title',
      );
      expect(text(el().querySelector('h2'))).toBe('hostBillingHistory.title');
      expect(el().textContent).toContain('hostBillingHistory.subtitle');
    });

    it('always links back to billing', async () => {
      await open();
      const back = () => byTestId('back-to-billing');

      expect(back()?.getAttribute('href')).toBe('/en/host/nHelLt/subscription');
      fail(apiError(403));
      expect(back()).not.toBeNull();
    });

    it.each([
      ['loading', BASE, () => undefined, '[data-testid="history-loading"]'],
      [
        'no-access',
        BASE,
        () => fail(apiError(403)),
        '[data-testid="history-forbidden"]',
      ],
      [
        'error',
        BASE,
        () => fail(apiError(500)),
        '[data-testid="history-error"]',
      ],
      [
        'empty',
        BASE,
        () => respond(result([], { total: 0 })),
        '[data-testid="history-empty"]',
      ],
      [
        'no-match',
        `${BASE}?status=void`,
        () => respond(result([], { total: 0 })),
        '[data-testid="history-no-match"]',
      ],
      [
        'past-the-last-page',
        `${BASE}?page=2`,
        () => respond(result([], { page: 2, total: 0 })),
        '[data-testid="history-past-last"]',
      ],
      [
        'table',
        BASE,
        () => respond(result([row()])),
        'hh-billing-invoice-table',
      ],
    ])(
      'links back to billing in the %s state',
      async (_state, url, reach, marker) => {
        await open(url);
        reach();

        expect(el().querySelector(marker)).not.toBeNull();
        expect(byTestId('back-to-billing')?.getAttribute('href')).toBe(
          '/en/host/nHelLt/subscription',
        );
      },
    );
  });

  describe('request', () => {
    it('asks for page 1, unfiltered, for the hostel in the path', async () => {
      await open();

      expect(api.invoices).toHaveBeenCalledTimes(1);
      expect(api.invoices).toHaveBeenCalledWith('nHelLt', {
        status: 'all',
        page: 1,
      });
    });

    it('reads the status and page from the URL', async () => {
      await open(`${BASE}?status=void&page=2`);

      expect(api.invoices).toHaveBeenCalledWith('nHelLt', {
        status: 'void',
        page: 2,
      });
    });

    it('still sends a status the server never offered', async () => {
      await open(`${BASE}?status=bogus`);

      expect(api.invoices).toHaveBeenCalledWith('nHelLt', {
        status: 'bogus',
        page: 1,
      });
    });

    it.each(['0', '-2', 'abc', '1.5x'])(
      'reads ?page=%s as page 1',
      async (page) => {
        await open(`${BASE}?page=${page}`);

        expect(api.invoices).toHaveBeenCalledWith('nHelLt', {
          status: 'all',
          page: 1,
        });
      },
    );

    it('follows the URL when it changes under the page', async () => {
      await open();
      respond(result([row()]));

      await router.navigateByUrl(`${BASE}?status=paid&page=3`);
      harness.detectChanges();

      expect(api.invoices).toHaveBeenLastCalledWith('nHelLt', {
        status: 'paid',
        page: 3,
      });
    });
  });

  describe('states', () => {
    it('shows a skeleton until the page arrives', async () => {
      await open();

      expect(byTestId('history-loading')).not.toBeNull();
      expect(
        byTestId('history-loading')?.querySelectorAll('hh-skeleton').length,
      ).toBeGreaterThanOrEqual(6);

      respond(result([row()]));

      expect(byTestId('history-loading')).toBeNull();
      expect(el().querySelector('hh-billing-invoice-table')).not.toBeNull();
    });

    it('shows its own no-access copy on a 403, with no retry', async () => {
      await open();
      fail(apiError(403));

      const state = byTestId('history-forbidden');
      expect(text(state)).toContain('hostBilling.noAccessTitle');
      expect(text(state)).toContain('hostBilling.noAccessMessage');
      expect(state?.querySelector('button')).toBeNull();
      expect(byTestId('history-error')).toBeNull();
    });

    it.each([500, 404])(
      'shows the load error with Try again on a %s, and retries',
      async (status) => {
        await open();
        fail(apiError(status));

        const state = byTestId('history-error');
        expect(text(state)).toContain('hostBillingHistory.loadError');
        const retry = state?.querySelector('button') as HTMLButtonElement;
        expect(text(retry)).toBe('common.tryAgain');

        retry.click();
        harness.detectChanges();

        expect(api.invoices).toHaveBeenCalledTimes(2);
        expect(byTestId('history-loading')).not.toBeNull();
        respond(result([row()]));
        expect(el().querySelector('hh-billing-invoice-table')).not.toBeNull();
      },
    );

    it('says so when the connection failed', async () => {
      await open();
      fail(apiError(0));

      expect(text(byTestId('history-error'))).toContain('states.cantConnect');
    });

    it('shows "No invoices yet" with Go to billing and no chips when there are none', async () => {
      await open();
      respond(result([], { total: 0 }));

      const empty = byTestId('history-empty');
      expect(text(empty)).toContain('hostBillingHistory.emptyTitle');
      expect(text(empty)).toContain('hostBillingHistory.emptyMessage');
      expect(
        empty
          ?.querySelector('[data-testid="go-to-billing"]')
          ?.getAttribute('href'),
      ).toBe('/en/host/nHelLt/subscription');
      expect(byTestId('status-filter')).toBeNull();
      expect(el().querySelector('hh-billing-invoice-table')).toBeNull();
    });

    it('shows no-match with Show all when a filter finds nothing', async () => {
      await open(`${BASE}?status=void`);
      respond(result([], { total: 0 }));

      expect(text(byTestId('history-no-match'))).toContain(
        'hostBillingHistory.noMatchTitle',
      );
      expect(byTestId('history-empty')).toBeNull();
      expect(byTestId('status-filter')).not.toBeNull();

      byTestId('show-all')?.click();
      await settle();

      expect(navigate).toHaveBeenCalledWith([], {
        queryParams: { status: null, page: null },
        ...WRITE,
      });
      expect(router.url).toBe(BASE);
      expect(api.invoices).toHaveBeenLastCalledWith('nHelLt', {
        status: 'all',
        page: 1,
      });
    });

    it('offers the first page when the page is past the last one', async () => {
      await open(`${BASE}?status=paid&page=9`);
      respond(result([], { page: 9, total: 4, totalPages: 1 }));

      expect(text(byTestId('history-past-last'))).toContain(
        'hostBillingHistory.noMatchTitle',
      );

      byTestId('first-page')?.click();
      await settle();

      expect(navigate).toHaveBeenCalledWith([], {
        queryParams: { page: null },
        ...WRITE,
      });
      expect(router.url).toBe(`${BASE}?status=paid`);
      expect(api.invoices).toHaveBeenLastCalledWith('nHelLt', {
        status: 'paid',
        page: 1,
      });
    });

    it('prefers past-the-last-page over no-match when a filtered list is empty beyond page 1', async () => {
      await open(`${BASE}?status=paid&page=2`);
      respond(result([], { page: 2, total: 0 }));

      expect(byTestId('history-past-last')).not.toBeNull();
      expect(byTestId('history-no-match')).toBeNull();
      expect(byTestId('history-empty')).toBeNull();
    });

    it('treats an empty page past the first as past the end, even unfiltered', async () => {
      await open(`${BASE}?page=2`);
      respond(result([], { page: 2, total: 0 }));

      expect(byTestId('history-past-last')).not.toBeNull();
      expect(byTestId('history-empty')).toBeNull();
    });
  });

  describe('table', () => {
    it('hands the rows, hostel and history query to the table', async () => {
      await open(`${BASE}?status=paid&page=2`);
      const rows = [row(), row({ id: 'inv2' })];
      respond(result(rows, { page: 2, totalPages: 2 }));

      const t = table();
      expect(t?.rows()).toEqual(rows);
      expect(t?.hostelId()).toBe('nHelLt');
      expect(t?.historyQuery()).toEqual({ status: 'paid', page: 2 });
    });

    it('hands an empty history query for the plain list', async () => {
      await open();
      respond(result([row()]));

      expect(table()?.historyQuery()).toEqual({});
    });
  });

  describe('status filter', () => {
    it('offers All and the server’s statuses in order, with our translated labels', async () => {
      await open();
      respond(result([row()]));

      expect(chipLabels()).toEqual([
        'All',
        'Unpaid',
        'Paid',
        'Closed',
        'Refunded',
      ]);
    });

    it('marks the chip the URL names', async () => {
      await open(`${BASE}?status=paid`);
      respond(result([row()]));

      expect(chip('Paid').className).toContain('bg-ink-900');
      expect(chip('All').className).not.toContain('bg-ink-900');
    });

    it('writes the status to the URL, resets the page and refetches', async () => {
      await open(`${BASE}?page=3`);
      respond(result([row()], { page: 3, totalPages: 4 }));

      chip('Paid').click();
      await settle();

      expect(navigate).toHaveBeenCalledWith([], {
        queryParams: { status: 'paid', page: null },
        ...WRITE,
      });
      expect(router.url).toBe(`${BASE}?status=paid`);
      expect(api.invoices).toHaveBeenLastCalledWith('nHelLt', {
        status: 'paid',
        page: 1,
      });
    });

    it('removes the status from the URL for All', async () => {
      await open(`${BASE}?status=open`);
      respond(result([row()]));

      chip('All').click();
      await settle();

      expect(navigate).toHaveBeenCalledWith([], {
        queryParams: { status: null, page: null },
        ...WRITE,
      });
      expect(router.url).toBe(BASE);
    });

    it('does nothing when the active chip is pressed again', async () => {
      await open();
      respond(result([row()]));

      chip('All').click();
      await settle();

      expect(navigate).not.toHaveBeenCalled();
    });

    it('discards the answer to a filter that was replaced while it loaded', async () => {
      await open();
      respond(result([row()]));

      chip('Paid').click();
      await settle();
      chip('Closed').click();
      await settle();
      expect(api.invoices).toHaveBeenLastCalledWith('nHelLt', {
        status: 'void',
        page: 1,
      });

      respond(result([row({ id: 'stale' })]), 1);
      expect(byTestId('history-loading')).not.toBeNull();
      expect(table()).toBeNull();

      respond(result([row({ id: 'fresh' })]), 2);
      expect(
        table()
          ?.rows()
          .map((r) => r.id),
      ).toEqual(['fresh']);
    });

    it('keeps the chips on screen while the next page loads', async () => {
      await open();
      respond(result([row()]));

      chip('Paid').click();
      await settle();

      expect(byTestId('history-loading')).not.toBeNull();
      expect(chipLabels()).toEqual([
        'All',
        'Unpaid',
        'Paid',
        'Closed',
        'Refunded',
      ]);
    });
  });

  describe('pagination', () => {
    it('is hidden with a single page', async () => {
      await open();
      respond(result([row()], { totalPages: 1 }));

      expect(byTestId('history-pagination')).toBeNull();
      expect(el().querySelector('hh-pagination')).toBeNull();
    });

    it('shows "Page x of y" and the pager with more than one page', async () => {
      await open(`${BASE}?page=2`);
      respond(result([row()], { page: 2, total: 25, totalPages: 3 }));

      const pager = byTestId('history-pagination');
      expect(text(pager?.querySelector('[data-field="page-of"]'))).toBe(
        'Page 2 of 3',
      );
      expect(
        pager
          ?.querySelector('button[aria-current="page"]')
          ?.textContent?.trim(),
      ).toBe('2');
    });

    it('writes the page to the URL and refetches', async () => {
      await open();
      respond(result([row()], { page: 1, total: 25, totalPages: 3 }));

      const three = Array.from(
        el().querySelectorAll<HTMLButtonElement>('hh-pagination button'),
      ).find((b) => text(b) === '3') as HTMLButtonElement;
      three.click();
      await settle();

      expect(navigate).toHaveBeenCalledWith([], {
        queryParams: { page: 3 },
        ...WRITE,
      });
      expect(router.url).toBe(`${BASE}?page=3`);
      expect(api.invoices).toHaveBeenLastCalledWith('nHelLt', {
        status: 'all',
        page: 3,
      });
    });

    it('scrolls the top of the list into view on a page change', async () => {
      const original = Object.getOwnPropertyDescriptor(
        Element.prototype,
        'scrollIntoView',
      );
      const scrollIntoView = vi.fn();
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: scrollIntoView,
      });
      try {
        await open();
        respond(result([row()], { page: 1, total: 25, totalPages: 3 }));
        expect(scrollIntoView).not.toHaveBeenCalled();

        const two = Array.from(
          el().querySelectorAll<HTMLButtonElement>('hh-pagination button'),
        ).find((b) => text(b) === '2') as HTMLButtonElement;
        two.click();
        await settle();

        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
        const target = scrollIntoView.mock.contexts[0] as Element;
        // The scrolled element is the one the list (here its loading skeleton) renders in.
        expect(target.contains(byTestId('history-loading'))).toBe(true);
        expect(target.contains(byTestId('status-filter'))).toBe(false);
      } finally {
        if (original) {
          Object.defineProperty(Element.prototype, 'scrollIntoView', original);
        } else {
          delete (Element.prototype as { scrollIntoView?: unknown })
            .scrollIntoView;
        }
      }
    });

    it('drops the page from the URL when going back to page 1', async () => {
      await open(`${BASE}?status=paid&page=2`);
      respond(result([row()], { page: 2, total: 25, totalPages: 3 }));

      const one = Array.from(
        el().querySelectorAll<HTMLButtonElement>('hh-pagination button'),
      ).find((b) => text(b) === '1') as HTMLButtonElement;
      one.click();
      await settle();

      expect(navigate).toHaveBeenCalledWith([], {
        queryParams: { page: null },
        ...WRITE,
      });
      expect(router.url).toBe(`${BASE}?status=paid`);
    });
  });

  describe('switching hostel', () => {
    it('drops the filter and the old hostel’s chips, and loads the new hostel', async () => {
      await open(`${BASE}?status=paid&page=2`);
      respond(result([row()], { page: 2, totalPages: 2 }));

      await router.navigateByUrl('/host/other1/subscription/invoices');
      harness.detectChanges();

      expect(api.invoices).toHaveBeenLastCalledWith('other1', {
        status: 'all',
        page: 1,
      });
      expect(byTestId('history-loading')).not.toBeNull();
      expect(byTestId('status-filter')).toBeNull();
    });

    it('ignores a late answer for the old hostel', async () => {
      await open();
      const first = loads[0];

      await router.navigateByUrl('/host/other1/subscription/invoices');
      harness.detectChanges();
      first.next(result([row()]));
      harness.detectChanges();

      expect(byTestId('history-loading')).not.toBeNull();
      expect(el().querySelector('hh-billing-invoice-table')).toBeNull();
    });
  });

  describe('money', () => {
    it('never converts or adds up an amount', () => {
      const dir = dirname(fileURLToPath(import.meta.url));
      for (const file of ['billing-invoices.ts', 'billing-invoices.html']) {
        const source = readFileSync(join(dir, file), 'utf8');

        expect(source).not.toMatch(/Number\(|parseFloat|total_minor/);
        expect(source).not.toMatch(/\.total\s*[-+*/]|reduce\(/);
      }
    });
  });
});
