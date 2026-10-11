import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';
import { of } from 'rxjs';
import type {
  BillingInvoice,
  BillingInvoicePage,
  BillingInvoiceRow,
} from '@hostelhive/data-access';
import { BillingApi, HostPropertyStore } from '@services';
import { API_CONFIG } from '@core/api-config';
import { SessionStore } from '@core/auth/session-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { BillingInvoiceDetail } from './billing-invoice-detail';
import { BillingInvoices } from './billing-invoices';

const BASE = '/host/nHelLt/subscription/invoices';

const STATUS = { id: 1, name: 'Open', slug: 'open', color: null };

function row(over: Partial<BillingInvoiceRow> = {}): BillingInvoiceRow {
  return {
    id: 'inv11',
    number: 'HH-2026-0011',
    kind: 'renewal',
    currency: 'PKR',
    total: '5000.00',
    period_start: '2026-10-11T09:00:00+05:00',
    period_end: '2026-11-11T09:00:00+05:00',
    expires_at: null,
    paid_at: null,
    voided_at: null,
    created_at: '2026-10-11T09:00:00+05:00',
    invoice_pdf_url: null,
    status: STATUS,
    plan: { id: 'pBasic', code: 'basic', name: 'Basic' },
    lines: [],
    ...over,
  };
}

function detail(id: string): BillingInvoice {
  return {
    ...row({ id }),
    plan: { id: 'pBasic', code: 'basic', name: 'Basic', features: [] },
    lines: [{ description: 'Basic plan', amount: '5000' }],
    payments: [],
  };
}

function hostRoutes(): Route {
  return {
    path: 'host/:hostelId',
    children: [
      {
        path: 'subscription',
        children: [
          { path: 'invoices', component: BillingInvoices },
          { path: 'invoices/:invoiceId', component: BillingInvoiceDetail },
        ],
      },
    ],
  };
}

function listPage(rows: BillingInvoiceRow[]): BillingInvoicePage {
  return {
    rows,
    statuses: [
      { id: 1, name: 'Open', slug: 'open' },
      { id: 2, name: 'Paid', slug: 'paid' },
    ],
    page: { page: 2, total: 25, totalPages: 3, hasNextPage: true },
  };
}

describe('billing history to invoice and back', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  let api: {
    invoices: ReturnType<typeof vi.fn>;
    invoice: ReturnType<typeof vi.fn>;
  };

  async function openList(url: string): Promise<HTMLElement> {
    api = {
      invoices: vi.fn(() => of(listPage([row(), row({ id: 'inv12' })]))),
      invoice: vi.fn((id: string) => of(detail(id))),
    };
    TestBed.configureTestingModule({
      providers: [
        // The hostel id lives two routes above both pages, as in the real tree.
        // Row clicks and links go to the language-prefixed URL, so the tree is served under it too.
        provideRouter([hostRoutes(), { path: 'en', children: [hostRoutes()] }]),
        provideI18nTesting(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '' } },
        { provide: BillingApi, useValue: api },
        { provide: SessionStore, useValue: { hasPermission: () => true } },
        {
          provide: HostPropertyStore,
          useValue: { selected: signal('nHelLt') },
        },
      ],
    });
    TestBed.inject(TranslocoService).setTranslation({}, 'en');
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    await settle();
    return harness.fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function backHref(el: HTMLElement): string | null {
    return (
      el
        .querySelector('[data-testid="back-to-history"]')
        ?.getAttribute('href') ?? null
    );
  }

  afterEach(() => TestBed.resetTestingModule());

  it('brings the filter and page of the list back from an invoice opened by its row', async () => {
    const el = await openList(`${BASE}?status=paid&page=2`);
    const second = el.querySelector(
      '[data-testid="invoice-table"] tr[data-invoice="inv12"] [data-field="date"]',
    ) as HTMLElement;

    second.click();
    await settle();

    expect(router.url).toBe(`/en${BASE}/inv12`);
    expect(api.invoice).toHaveBeenCalledWith('inv12');
    expect(backHref(el)).toBe(
      '/en/host/nHelLt/subscription/invoices?status=paid&page=2',
    );
  });

  it('brings the list back from an invoice opened by its number link', async () => {
    const el = await openList(`${BASE}?status=open&page=3`);
    const link = el.querySelector(
      '[data-testid="invoice-table"] tr[data-invoice="inv11"] [data-testid="invoice-link"]',
    ) as HTMLAnchorElement;

    link.click();
    await settle();

    expect(router.url).toBe(`/en${BASE}/inv11`);
    expect(backHref(el)).toBe(
      '/en/host/nHelLt/subscription/invoices?status=open&page=3',
    );
  });

  it('brings back a plain list when the list had no filter and no page', async () => {
    const el = await openList(BASE);
    const first = el.querySelector(
      '[data-testid="invoice-table"] tr[data-invoice="inv11"] [data-field="date"]',
    ) as HTMLElement;

    first.click();
    await settle();

    expect(router.url).toBe(`/en${BASE}/inv11`);
    expect(backHref(el)).toBe('/en/host/nHelLt/subscription/invoices');
  });

  it('returns to the very list it left when the back link is followed', async () => {
    const el = await openList(`${BASE}?status=paid&page=2`);
    (
      el.querySelector(
        '[data-testid="invoice-table"] tr[data-invoice="inv11"] [data-field="date"]',
      ) as HTMLElement
    ).click();
    await settle();

    (
      el.querySelector('[data-testid="back-to-history"]') as HTMLAnchorElement
    ).click();
    await settle();

    expect(router.url).toBe(`/en${BASE}?status=paid&page=2`);
    expect(api.invoices).toHaveBeenLastCalledWith('nHelLt', {
      status: 'paid',
      page: 2,
    });
  });
});
