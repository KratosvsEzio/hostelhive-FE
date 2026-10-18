import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { HostOpsApi, HostPropertyStore, OverviewApi } from '@services';
import { CalendarDayCounts, HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { UpcomingStrip } from '@features/host/overview/charts/upcoming-strip';
import { HostOverview } from './overview';

const EAST = 'Pacific/Kiritimati';
const WEST = 'Pacific/Pago_Pago';
const KARACHI = 'Asia/Karachi';

/** 2026-03-31 12:00Z: already 1 April at Kiritimati, still 31 March at Pago Pago. */
const I1 = Date.UTC(2026, 2, 31, 12, 0);
/** 2026-03-31 20:30Z: 01:30 on 1 April in Karachi, still the 31st on a UTC device. */
const K = Date.UTC(2026, 2, 31, 20, 30);
const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

/** The strip's state, which the template reads; reached here without rendering it. */
interface Overview {
  strip(): UpcomingStrip;
  upcomingLoading(): boolean;
  upcomingError(): boolean;
}

interface SetUpOptions {
  /** Zone per hostel id; a missing key answers null. */
  zones?: Record<string, string | null>;
  monthly?: boolean;
  /** Replaces the default zone lookup, e.g. with a Subject for a pending zone. */
  zoneLookup?: (hostelId: string) => Observable<string | null>;
  calendar?: (hostelId: string, from: string, to: string) => Observable<{ days: CalendarDayCounts[] }>;
}

function setUp(opts: SetUpOptions = {}) {
  const zones = opts.zones ?? {};
  const selected = signal('h1');
  const timeZoneOf = vi.fn<(hostelId: string) => Observable<string | null>>(
    opts.zoneLookup ?? ((id) => of(zones[id] ?? null)),
  );
  const calendar = vi.fn<(hostelId: string, from: string, to: string) => Observable<{ days: CalendarDayCounts[] }>>(
    opts.calendar ?? (() => of({ days: [] })),
  );
  const store = { selected, isMonthlyBilled: vi.fn(() => !!opts.monthly), timeZoneOf };

  TestBed.configureTestingModule({
    providers: [
      { provide: HostPropertyStore, useValue: store },
      { provide: HostBookingsApi, useValue: { calendar } },
      { provide: HostOpsApi, useValue: { invoices: () => NEVER } },
      {
        provide: OverviewApi,
        useValue: { overviewCards: () => NEVER, monthlyRevenue: () => NEVER, tenantMovement: () => NEVER },
      },
    ],
  });
  TestBed.overrideComponent(HostOverview, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(HostOverview);
  const page = fixture.componentInstance as unknown as Overview;

  /** Lets the query effects run and the synchronous replies land. */
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { selected, timeZoneOf, calendar, store, page, settle };
}

/** The device's own `yyyy-MM-dd` for an instant. */
function deviceDay(instant: number): string {
  const d = new Date(instant);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The strip's subtitle for a window starting on the given local date. */
function labelFor(year: number, month: number, day: number): string {
  const first = new Date(year, month - 1, day);
  const last = new Date(year, month - 1, day + 13);
  const short = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  return `${first.getDate()} ${short(first)} – ${last.getDate()} ${short(last)}`;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(I1);
});

afterEach(() => vi.useRealTimers());

describe('HostOverview strip follows the hostel date', () => {
  it('asks for the fortnight starting on the hostel day, east of the device zone', async () => {
    const { calendar, page, settle } = setUp({ zones: { h1: EAST } });

    await settle();

    expect(calendar).toHaveBeenCalledTimes(1);
    expect(calendar).toHaveBeenCalledWith('h1', '2026-04-01', '2026-04-14');
    expect(page.strip().days[0].date).toBe('2026-04-01');
    expect(page.strip().days[0].isToday).toBe(true);
  });

  it('asks for the fortnight starting on the hostel day, west of the device zone', async () => {
    const { calendar, page, settle } = setUp({ zones: { h1: WEST } });

    await settle();

    expect(calendar).toHaveBeenCalledTimes(1);
    expect(calendar).toHaveBeenCalledWith('h1', '2026-03-31', '2026-04-13');
    expect(page.strip().days[0].date).toBe('2026-03-31');
    expect(page.strip().days[0].isToday).toBe(true);
  });

  it('requests exactly the window the cells and the label show', async () => {
    const { calendar, page, settle } = setUp({ zones: { h1: EAST } });

    await settle();

    const [, from, to] = calendar.mock.calls[0];
    const { days, rangeLabel } = page.strip();
    expect(days).toHaveLength(14);
    expect(from).toBe(days[0].date);
    expect(to).toBe(days[13].date);
    expect(rangeLabel).toBe(labelFor(2026, 4, 1));
  });

  it('shows no cells and no label while the zone is pending, then the strip once it and the calendar reply', async () => {
    const zone$ = new Subject<string | null>();
    const calendar$ = new Subject<{ days: CalendarDayCounts[] }>();
    const { calendar, page, settle } = setUp({ zoneLookup: () => zone$, calendar: () => calendar$ });

    await settle();
    expect(page.upcomingLoading()).toBe(true);
    expect(page.strip().days).toEqual([]);
    expect(page.strip().rangeLabel).toBe('');
    expect(calendar).not.toHaveBeenCalled();

    zone$.next(EAST);
    await settle();
    expect(calendar).toHaveBeenCalledTimes(1);
    expect(page.strip().days).toEqual([]);
    expect(page.strip().rangeLabel).toBe('');

    calendar$.next({ days: [{ date: '2026-04-03', checkins: 2, checkouts: 0 } as CalendarDayCounts] });
    await settle();
    expect(page.upcomingLoading()).toBe(false);
    expect(page.strip().rangeLabel).toBe(labelFor(2026, 4, 1));
    expect(page.strip().days.find((d) => d.date === '2026-04-03')?.checkins).toBe(2);
  });

  it('asks for neither the zone nor the calendar in a monthly hostel', async () => {
    const { timeZoneOf, calendar, page, settle } = setUp({ monthly: true, zones: { h1: EAST } });

    await settle();

    expect(timeZoneOf).not.toHaveBeenCalled();
    expect(calendar).not.toHaveBeenCalled();
    expect(page.upcomingLoading()).toBe(false);
    expect(page.strip().days).toEqual([]);
  });

  it('re-asks for the new hostel and its own day when the selected hostel changes', async () => {
    const { selected, timeZoneOf, calendar, page, settle } = setUp({ zones: { h1: EAST, h2: WEST } });
    await settle();
    expect(calendar).toHaveBeenLastCalledWith('h1', '2026-04-01', '2026-04-14');

    selected.set('h2');
    await settle();

    expect(timeZoneOf).toHaveBeenCalledWith('h2');
    expect(calendar).toHaveBeenCalledTimes(2);
    expect(calendar).toHaveBeenLastCalledWith('h2', '2026-03-31', '2026-04-13');
    expect(page.strip().days[0].date).toBe('2026-03-31');
  });

  it('reports an error for a failed calendar, after asking for the hostel range', async () => {
    const { calendar, page, settle } = setUp({
      zones: { h1: EAST },
      calendar: () => throwError(() => new Error('boom')),
    });

    await settle();

    expect(calendar).toHaveBeenCalledWith('h1', '2026-04-01', '2026-04-14');
    expect(page.upcomingError()).toBe(true);
    expect(page.upcomingLoading()).toBe(false);
  });

  it('keeps the opening instant\'s hostel day after the clock moves on and the hostel changes', async () => {
    const { selected, calendar, page, settle } = setUp({ zones: { h1: EAST, h2: WEST } });
    await settle();

    vi.setSystemTime(I1 + TWO_DAYS);
    selected.set('h2');
    await settle();

    expect(calendar).toHaveBeenLastCalledWith('h2', '2026-03-31', '2026-04-13');
    expect(page.strip().days[0].date).toBe('2026-03-31');
  });

  it('falls back to the device date when the hostel has no zone, and still fetches', async () => {
    const { calendar, page, settle } = setUp({ zones: { h1: null } });
    const today = deviceDay(I1);

    await settle();

    expect(calendar).toHaveBeenCalledTimes(1);
    expect(calendar.mock.calls[0][1]).toBe(today);
    expect(page.strip().days[0].date).toBe(today);
  });

  it('starts on 1 April for a Karachi hostel at 01:30 there, whatever the device zone', async () => {
    vi.setSystemTime(K);
    const { calendar, page, settle } = setUp({ zones: { h1: KARACHI } });

    await settle();

    expect(calendar).toHaveBeenCalledWith('h1', '2026-04-01', '2026-04-14');
    expect(page.strip().days[0].date).toBe('2026-04-01');
  });

  it('is unchanged when the hostel zone is the device\'s own', async () => {
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { calendar, page, settle } = setUp({ zones: { h1: deviceZone } });
    const today = deviceDay(I1);

    await settle();

    expect(calendar.mock.calls[0][1]).toBe(today);
    expect(page.strip().days[0].date).toBe(today);
    expect(page.strip().days[0].isToday).toBe(true);
  });
});
