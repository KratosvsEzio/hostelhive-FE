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
import { Invoice, InvoiceStatus } from '@hostelhive/data-access';
import { HostOverview } from './overview';

const KPIS = [
  { key: 'pending-utility', label: 'Pending utility', value: '', rawValue: 0, prefix: 'Rs ', tone: 'warning' },
];

type InvoicesFn = (hostelId: string, page: number, limit: number, filters: Record<string, unknown>) => Observable<unknown>;

/**
 * A stand-in for the renter-bills list that filters like the API: by bill type, by one status
 * slug or an array of them, and one page of `limit` rows.
 */
function billsApi(bills: Invoice[]): InvoicesFn {
  return (_hostelId, _page, limit, filters) => {
    const slugs = filters['f[status.slug][]'] ?? [filters['f[status.slug]']];
    return of(invoicesReply(bills.filter(
      (b) => b.kind === filters['f[bill_type]'] && (slugs as string[]).includes(b.status),
    ).slice(0, limit)));
  };
}

/** `n` utility bills for one renter. */
function utilityBills(renterId: string, n: number, status: InvoiceStatus, tenantName = 'Ali'): Invoice[] {
  return Array.from({ length: n }, (_, i) =>
    invoice({ id: `${renterId}-ub-${i}`, renterId, tenantName, kind: 'utility', status }),
  );
}

/** Renders the real template and returns the component plus the pending-utility tile's text. */
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
    { hostOverview: { nTenantsUnpaid: '{{count}} tenants unpaid', nTenantsUnpaidOne: '{{count}} tenant unpaid' } },
    DEFAULT_LOCALE,
  );
  const fixture = TestBed.createComponent(HostOverview);
  fixture.detectChanges();
  // The bill panels hold their skeleton for at least 600 ms.
  await vi.advanceTimersByTimeAsync(600);
  fixture.detectChanges();

  const tileText = () => {
    const el = fixture.nativeElement as HTMLElement;
    const label = Array.from(el.querySelectorAll('p, span')).find((n) => n.textContent?.trim() === 'Pending utility');
    return label?.parentElement?.closest('div')?.parentElement?.textContent?.replace(/\s+/g, ' ') ?? '';
  };
  return { fixture, tileText, api: TestBed.inject(HostOpsApi) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('HostOverview unpaid utility tenant count', () => {
  it('counts renters whose utility bills are all over-due while the panel shows the Due tab', async () => {
    // Hostel zppsla on 2026-10-18: twelve over-due utility bills from two renters, read "0".
    const { tileText } = await render(billsApi([
      ...utilityBills('t-1', 6, 'over-due'),
      ...utilityBills('t-2', 6, 'over-due', 'Sara'),
    ]));

    expect(tileText()).toContain('2 tenants unpaid');
  });

  it('counts renters past the utility panel\'s ten rows', async () => {
    const { tileText } = await render(billsApi([
      ...utilityBills('t-1', 10, 'due'),
      ...utilityBills('t-2', 2, 'due', 'Sara'),
    ]));

    expect(tileText()).toContain('2 tenants unpaid');
  });

  it('tells apart tenants who share a name', async () => {
    const { tileText } = await render(billsApi([
      ...utilityBills('t-1', 1, 'due', 'Aashir Azeem'),
      ...utilityBills('t-2', 1, 'over-due', 'Aashir Azeem'),
      ...utilityBills('t-3', 1, 'over-due', 'Aashir Azeem'),
    ]));

    expect(tileText()).toContain('3 tenants unpaid');
  });

  it('leaves out paid utility bills and rent bills', async () => {
    const { tileText } = await render(billsApi([
      ...utilityBills('t-1', 1, 'due'),
      ...utilityBills('t-2', 1, 'paid'),
      invoice({ id: 'rb-1', renterId: 't-3', kind: 'rental', status: 'due' }),
    ]));

    expect(tileText()).toContain('1 tenant unpaid');
  });

  it('asks for utility bills in both unpaid statuses', async () => {
    const { api } = await render(billsApi([]));

    expect(api.invoices).toHaveBeenCalledWith('h1', 1, expect.any(Number), {
      'f[bill_type]': 'utility',
      'f[status.slug][]': ['due', 'over-due'],
    });
  });

  it('keeps the count when the host switches the utility panel tab', async () => {
    const { fixture, tileText } = await render(billsApi([
      ...utilityBills('t-1', 1, 'due'),
      ...utilityBills('t-2', 1, 'over-due', 'Sara'),
    ]));
    expect(tileText()).toContain('2 tenants unpaid');

    (fixture.componentInstance as unknown as { billTab: { set(v: string): void } }).billTab.set('over-due');
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
