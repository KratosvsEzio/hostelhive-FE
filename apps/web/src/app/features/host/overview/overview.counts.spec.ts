import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { vi } from 'vitest';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostOpsApi, HostPropertyStore, OverviewApi } from '@services';
import { HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { invoice, invoicesReply } from '@app/testing/host-builders';
import { HostOverview } from './overview';

/** The two pending tiles that carry a tenant count under their figure. */
const KPIS = [
  { key: 'pending-rent', label: 'Pending rent', value: '', rawValue: 0, prefix: 'Rs ', tone: 'danger' },
  { key: 'pending-utility', label: 'Pending utility', value: '', rawValue: 0, prefix: 'Rs ', tone: 'warn' },
];

/**
 * Renders the real template with utility bills owed by `tenants` different tenants, and
 * returns the text of the pending-utility tile. Keys render as themselves.
 */
async function utilityTileText(tenants: number): Promise<string> {
  const bills = Array.from({ length: tenants }, (_, i) =>
    invoice({ id: `ub-${i}`, kind: 'utility', tenantName: `Tenant ${i}` }),
  );
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      {
        provide: HostPropertyStore,
        useValue: { selected: signal('h1'), isMonthlyBilled: () => true, timeZoneOf: () => of(null) },
      },
      { provide: HostBookingsApi, useValue: { calendar: () => of({ days: [] }) } },
      { provide: HostOpsApi, useValue: { invoices: () => of(invoicesReply(bills)) } },
      {
        provide: OverviewApi,
        useValue: { overviewCards: () => of({ kpis: KPIS }), monthlyRevenue: () => NEVER, tenantMovement: () => NEVER },
      },
    ],
  });
  const fixture = TestBed.createComponent(HostOverview);
  fixture.detectChanges();
  // The bill panels hold their skeleton for at least 600 ms.
  await vi.advanceTimersByTimeAsync(600);
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const label = Array.from(el.querySelectorAll('p, span')).find((n) => n.textContent?.trim() === 'Pending utility');
  return label?.parentElement?.closest('div')?.parentElement?.textContent ?? '';
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** The app has no plural rules, so a count of one asks for its own singular key. */
describe('HostOverview unpaid tenant count', () => {
  it.each([
    [1, 'hostOverview.nTenantsUnpaidOne'],
    [2, 'hostOverview.nTenantsUnpaid'],
  ])('words %i tenant(s) owing utility as %s', async (tenants, key) => {
    expect((await utilityTileText(tenants)).match(/hostOverview\.nTenantsUnpaid(?:One)?/g)).toEqual([key]);
  });
});
