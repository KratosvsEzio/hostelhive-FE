import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HostPropertyStore } from '@services';
import { API_CONFIG } from '@core/api-config';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { PayPlaceholder } from './pay-placeholder';

const INVOICE = {
  id: 'inv0Ab',
  number: 'HH-2026-0007',
  kind: 'subscription',
  currency: 'PKR',
  total: '5000',
  period_start: null,
  period_end: null,
  expires_at: '2026-11-01T10:30:00+05:00',
  paid_at: null,
  voided_at: null,
  created_at: '2026-10-11T09:00:00+05:00',
  invoice_pdf_url: null,
  plan: null,
  lines: [],
  status: 'open',
  payments: [],
};

describe('PayPlaceholder', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  async function open(state?: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        // The hostel id lives two routes above the page, as in the real tree.
        provideRouter([
          {
            path: 'host/:hostelId',
            children: [
              {
                path: 'subscription',
                children: [
                  { path: 'pay/:invoiceId', component: PayPlaceholder },
                ],
              },
            ],
          },
        ]),
        provideI18nTesting(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '' } },
        {
          provide: HostPropertyStore,
          useValue: { selected: signal('nHelLt') },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    // The page reads the browser's history.state, which a real router navigation writes before
    // the page is created. TestBed's fake platform location never touches it, so seed it here.
    window.history.replaceState(state ?? null, '');
    harness = await RouterTestingHarness.create();
    await TestBed.inject(Router).navigateByUrl(
      '/host/nHelLt/subscription/pay/inv0Ab',
      {
        state,
      },
    );
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  function flushInvoice(): void {
    http
      .expectOne((r) => r.url.endsWith('/api/invoices/inv0Ab'))
      .flush({ invoice: INVOICE });
    harness.detectChanges();
  }

  function hrefs(el: HTMLElement): string[] {
    return Array.from(el.querySelectorAll('a')).map(
      (a) => a.getAttribute('href') ?? '',
    );
  }

  afterEach(() => {
    window.history.replaceState(null, '');
    TestBed.resetTestingModule();
  });

  it('shows a skeleton until the invoice arrives, then the stub', async () => {
    const el = await open();

    expect(el.querySelector('hh-skeleton')).not.toBeNull();
    expect(el.querySelector('hh-empty-state')).toBeNull();

    flushInvoice();

    expect(el.querySelector('hh-skeleton')).toBeNull();
    expect(el.textContent).toContain('hostBilling.invoiceNumber');
    expect(el.querySelector('hh-empty-state')?.textContent).toContain(
      'hostBilling.payStubTitle',
    );
  });

  it('renders the invoice straight away from navigation state, with no skeleton', async () => {
    const el = await open({ invoice: INVOICE });

    expect(el.querySelector('hh-skeleton')).toBeNull();
    expect(el.querySelector('hh-empty-state')).not.toBeNull();
    expect(el.querySelector('bdi')?.textContent).toContain('PKR 5,000');

    // The server stays the source of truth even when state prefilled the page.
    flushInvoice();
    expect(el.querySelector('bdi')?.textContent).toContain('PKR 5,000');
  });

  it('ends on the server’s total when it differs from the handed-over one', async () => {
    const el = await open({ invoice: INVOICE });
    expect(el.querySelector('bdi')?.textContent).toContain('PKR 5,000');

    http
      .expectOne((r) => r.url.endsWith('/api/invoices/inv0Ab'))
      .flush({ invoice: { ...INVOICE, total: '6000' } });
    harness.detectChanges();

    expect(el.querySelector('bdi')?.textContent?.trim()).toBe('PKR 6,000');
  });

  it('keeps a handed-over invoice on screen when the refresh fails', async () => {
    const el = await open({ invoice: INVOICE });

    http
      .expectOne((r) => r.url.endsWith('/api/invoices/inv0Ab'))
      .flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });
    harness.detectChanges();

    expect(el.querySelector('bdi')?.textContent?.trim()).toBe('PKR 5,000');
    expect(el.querySelector('hh-error-state')).toBeNull();
    expect(el.querySelector('hh-empty-state')).not.toBeNull();
  });

  it('ignores navigation state that belongs to another invoice', async () => {
    const el = await open({ invoice: { ...INVOICE, id: 'other1' } });

    expect(el.querySelector('hh-skeleton')).not.toBeNull();
    flushInvoice();
  });

  it('formats the total with the billing money pipe inside a bdi', async () => {
    const el = await open();
    flushInvoice();

    const amount = el.querySelector('bdi');
    expect(amount?.textContent?.trim()).toBe('PKR 5,000');
  });

  it('links to support and back to the hostel billing page found on an ancestor route', async () => {
    const el = await open();
    flushInvoice();

    const links = hrefs(el);
    expect(links.some((h) => h.endsWith('/contact'))).toBe(true);
    expect(links.some((h) => h.endsWith('/host/nHelLt/subscription'))).toBe(
      true,
    );
  });

  it('shows an inline error with a retry that refetches', async () => {
    const el = await open();

    http
      .expectOne((r) => r.url.endsWith('/api/invoices/inv0Ab'))
      .flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });
    harness.detectChanges();

    const error = el.querySelector('hh-error-state');
    expect(error?.textContent).toContain('hostBilling.invoiceLoadError');
    expect(hrefs(el).some((h) => h.endsWith('/host/nHelLt/subscription'))).toBe(
      true,
    );

    const retry = Array.from(error?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('common.tryAgain'),
    );
    retry?.click();
    harness.detectChanges();

    expect(el.querySelector('hh-error-state')).toBeNull();
    flushInvoice();
    expect(el.querySelector('hh-empty-state')).not.toBeNull();
  });
});
