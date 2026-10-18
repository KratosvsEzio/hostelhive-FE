import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { DEFAULT_LOCALE } from '@core/i18n/locales';
import { HostOpsApi, HostPropertyStore, OverviewApi } from '@services';
import { HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { invoice, invoicesReply } from '@app/testing/host-builders';
import { Invoice } from '@hostelhive/data-access';
import { HostOverview } from './overview';

const KPIS = [
  { key: 'pending-rent', label: 'Pending rent', value: '', rawValue: 0, prefix: 'Rs ', tone: 'danger' },
];

type InvoicesFn = (hostelId: string, page: number, limit: number, filters: Record<string, unknown>) => Observable<unknown>;

/**
 * A stand-in for the renter-bills list that filters like the API: by bill type, and by one
 * status slug or an array of them.
 */
function billsApi(bills: Invoice[]): InvoicesFn {
  return (_hostelId, _page, _limit, filters) => {
    const slugs = filters['f[status.slug][]'] ?? [filters['f[status.slug]']];
    return of(invoicesReply(bills.filter(
      (b) => b.kind === filters['f[bill_type]'] && (slugs as string[]).includes(b.status),
    )));
  };
}

/** Renders the real template and returns the component plus the pending-rent tile's text. */
async function render(invoices: InvoicesFn) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      {
        provide: HostPropertyStore,
        useValue: { selected: signal('h1'), isMonthlyBilled: () => true, timeZoneOf: () => of(null) },
      },
      { provide: HostBookingsApi, useValue: { calendar: () => of({ days: [] }) } },
      { provide: HostOpsApi, useValue: { invoices: vi.fn(invoices) } },
      {
        provide: OverviewApi,
        useValue: { overviewCards: () => of({ kpis: KPIS }), monthlyRevenue: () => NEVER, tenantMovement: () => NEVER },
      },
    ],
  });
  // Every other key renders as itself; this one shows the count so the tile can be read.
  TestBed.inject(TranslocoService).setTranslation(
    { hostOverview: { nTenantsUnpaid: '{{count}} tenants unpaid' } },
    DEFAULT_LOCALE,
  );
  const fixture = TestBed.createComponent(HostOverview);
  fixture.detectChanges();
  // The bill panels hold their skeleton for at least 600 ms.
  await vi.advanceTimersByTimeAsync(600);
  fixture.detectChanges();

  const tileText = () => {
    const el = fixture.nativeElement as HTMLElement;
    const label = Array.from(el.querySelectorAll('p, span')).find((n) => n.textContent?.trim() === 'Pending rent');
    return label?.parentElement?.closest('div')?.parentElement?.textContent?.replace(/\s+/g, ' ') ?? '';
  };
  return { fixture, tileText, api: TestBed.inject(HostOpsApi) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('HostOverview unpaid rent tenant count', () => {
  it('counts each renter owing rent once, across due and over-due bills', async () => {
    const { tileText } = await render(billsApi([
      invoice({ id: 'rb-1', renterId: 't-1', tenantName: 'Ali', status: 'due' }),
      invoice({ id: 'rb-2', renterId: 't-1', tenantName: 'Ali', status: 'over-due' }),
      invoice({ id: 'rb-3', renterId: 't-2', tenantName: 'Sara', status: 'over-due' }),
    ]));

    expect(tileText()).toContain('2 tenants unpaid');
  });

  it('tells apart tenants who share a name', async () => {
    const { tileText } = await render(billsApi([
      invoice({ id: 'rb-1', renterId: 't-1', tenantName: 'Aashir Azeem', status: 'due' }),
      invoice({ id: 'rb-2', renterId: 't-2', tenantName: 'Aashir Azeem', status: 'over-due' }),
      invoice({ id: 'rb-3', renterId: 't-3', tenantName: 'Aashir Azeem', status: 'over-due' }),
    ]));

    expect(tileText()).toContain('3 tenants unpaid');
  });

  it('leaves out paid rent and utility bills', async () => {
    const { tileText } = await render(billsApi([
      invoice({ id: 'rb-1', renterId: 't-1', status: 'due' }),
      invoice({ id: 'rb-2', renterId: 't-2', status: 'paid' }),
      invoice({ id: 'ub-1', renterId: 't-3', kind: 'utility', status: 'due' }),
    ]));

    expect(tileText()).toContain('1 tenants unpaid');
  });

  it('asks for rental bills in both unpaid statuses', async () => {
    const { api } = await render(billsApi([]));

    expect(api.invoices).toHaveBeenCalledWith('h1', 1, expect.any(Number), {
      'f[bill_type]': 'rental',
      'f[status.slug][]': ['due', 'over-due'],
    });
  });

  it('keeps the count when the host switches the rent ledger tab', async () => {
    const { fixture, tileText } = await render(billsApi([
      invoice({ id: 'rb-1', renterId: 't-1', status: 'due' }),
      invoice({ id: 'rb-2', renterId: 't-2', status: 'over-due' }),
    ]));
    expect(tileText()).toContain('2 tenants unpaid');

    (fixture.componentInstance as unknown as { ledgerTab: { set(v: string): void } }).ledgerTab.set('over-due');
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(600);
    fixture.detectChanges();

    expect(tileText()).toContain('2 tenants unpaid');
  });

  it('shows zero when the bills cannot be loaded', async () => {
    const { tileText } = await render(() => throwError(() => new Error('offline')));

    expect(tileText()).toContain('0 tenants unpaid');
  });
});
