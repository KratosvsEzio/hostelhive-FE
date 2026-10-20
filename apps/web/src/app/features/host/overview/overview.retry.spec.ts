import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { SessionStore } from '@core/auth/session-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostOpsApi, HostPropertyStore, OverviewApi } from '@services';
import { HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { RefusalKind, refusalError } from '@app/testing/backend-refusals';
import { HOSTEL_ID, invoicesReply, sessionUser } from '@app/testing/host-builders';
import { loadSurface } from '@app/testing/load-refusal-surface';
import { HostOverview } from './overview';

const API = `https://api.test/api/host/hostels/${HOSTEL_ID}`;

const CARDS = {
  kpis: [
    { key: 'collected', label: 'Collected', value: '', rawValue: 48000, prefix: 'Rs ', tone: 'ok' },
  ],
};

/**
 * Retry on the overview's error state re-requests the page (Trello #203). Before the fix, the
 * cards' query kept the same hostel id after Retry, so it never emitted again and nothing was
 * re-requested.
 */
describe('Overview Retry', () => {
  afterEach(() => TestBed.inject(SessionStore).clear());

  async function open(first: RefusalKind) {
    const cards = vi
      .fn()
      .mockReturnValueOnce(throwError(() => refusalError(first, { url: `${API}/overview_cards` })))
      .mockReturnValue(of(CARDS));
    const revenue = vi.fn(() => NEVER);
    const movement = vi.fn(() => NEVER);
    const invoices = vi.fn(() => of(invoicesReply()));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        {
          provide: HostPropertyStore,
          useValue: { selected: signal(HOSTEL_ID), isMonthlyBilled: () => true, timeZoneOf: () => of(null) },
        },
        { provide: HostBookingsApi, useValue: { calendar: () => of({ days: [] }) } },
        { provide: HostOpsApi, useValue: { invoices } },
        {
          provide: OverviewApi,
          useValue: { overviewCards: cards, monthlyRevenue: revenue, tenantMovement: movement },
        },
      ],
    });
    TestBed.inject(SessionStore).setSession(sessionUser('host'), 'tok');
    const fixture = TestBed.createComponent(HostOverview);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const pressRetry = async () => {
      el.querySelector<HTMLButtonElement>('hh-error-state button')?.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { el, cards, revenue, movement, invoices, pressRetry };
  }

  it.each<RefusalKind>(['serverError', 'network'])(
    're-requests the cards after a %s and shows them when they load',
    async (kind) => {
      const { el, cards, pressRetry } = await open(kind);
      expect(cards).toHaveBeenCalledTimes(1);
      expect(loadSurface(el).retry).toBe(true);

      await pressRetry();

      expect(cards).toHaveBeenCalledTimes(2);
      expect(cards).toHaveBeenLastCalledWith(HOSTEL_ID);
      expect(loadSurface(el).surfaces).toEqual([]);
      expect(el.textContent).toContain('Collected');
    },
  );

  it('re-requests the other reads on the page too, which have no Retry of their own', async () => {
    const { revenue, movement, invoices, pressRetry } = await open('network');
    const before = {
      revenue: revenue.mock.calls.length,
      movement: movement.mock.calls.length,
      invoices: invoices.mock.calls.length,
    };

    await pressRetry();

    expect(revenue.mock.calls.length).toBe(before.revenue + 1);
    expect(movement.mock.calls.length).toBe(before.movement + 1);
    expect(invoices.mock.calls.length).toBeGreaterThan(before.invoices);
  });

  it('asks once per press, not again while the page sits', async () => {
    const { cards, pressRetry } = await open('serverError');

    await pressRetry();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(cards).toHaveBeenCalledTimes(2);
  });
});
