import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostPropertyStore } from '@services';
import { BookingCalendar } from './booking-calendar';
import { BookingCalendar as CalendarData, HostBooking, HostBookingsApi } from './host-bookings-api';
import { DayCell, isoDate, monthRange } from './booking-month';

/** Two zones a full day apart, so every pair below differs on any device. */
const EAST = 'Pacific/Kiritimati'; // UTC+14
const WEST = 'Pacific/Pago_Pago'; // UTC-11

/** Month end: EAST is already 1 April, WEST still 31 March. */
const I1 = Date.UTC(2026, 2, 31, 12, 0, 0);
/** Mid month: EAST 16 March, WEST 15 March. */
const I2 = Date.UTC(2026, 2, 15, 12, 0, 0);
/** Year end: EAST is already 1 January 2027, WEST still 31 December 2026. */
const IY = Date.UTC(2026, 11, 31, 12, 0, 0);
/** 01:30 on 1 April in Karachi, still 31 March on a UTC device. */
const K = Date.UTC(2026, 2, 31, 20, 30, 0);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Only `Date` is faked: Angular still needs real timers and microtasks to render. */
function freeze(instant: number): void {
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(instant);
}

afterEach(() => vi.useRealTimers());

const EMPTY: CalendarData = { days: [], totals: {}, revenue: {} };

function booking(slug: string, over: Partial<HostBooking> = {}): HostBooking {
  return {
    id: 'b1',
    ref: 'HH-1',
    guest: { name: 'Ali Raza', phone: '', email: '' },
    checkIn: '2026-03-20',
    checkOut: '2026-03-21',
    nights: 1,
    guests: 2,
    roomType: { name: 'Dormitory', occupancyType: 'shared_room', capacity: 4, price: 0 },
    status: { name: slug, slug },
    disposition: { name: slug, slug },
    ...over,
  } as HostBooking;
}

/** The device's own date for an instant, which is what a missing zone must fall back to. */
function deviceDay(instant: number): string {
  return isoDate(new Date(instant));
}

type ZoneSource = string | null | Subject<string | null>;

interface CalendarCall {
  hostelId: string;
  start: string;
  end: string;
}

interface Internals {
  month(): { days: DayCell[] };
  monthStart(): Date;
  selected(): string;
  state(): { loading: boolean; error: boolean };
  step(by: number): void;
  retry(): void;
  select(day: DayCell): void;
}

/**
 * The calendar as a host reads it, opened at a frozen instant.
 *
 * The clock is frozen before the component is built: it reads the clock once, there. `zones`
 * maps a hostel id to its zone; a Subject stands for a zone that has not arrived yet.
 */
function setUp(
  instant: number,
  zones: Record<string, ZoneSource>,
  hostelId = 'h1',
  failFirstFetch = false,
) {
  freeze(instant);
  TestBed.resetTestingModule();

  const calls: CalendarCall[] = [];
  const api = {
    calendar: vi.fn((id: string, start: string, end: string): Observable<CalendarData> => {
      calls.push({ hostelId: id, start, end });
      if (failFirstFetch && calls.length === 1) return throwError(() => new Error('boom'));
      return of(EMPTY);
    }),
    bookingsOn: vi.fn((): Observable<HostBooking[]> => of([])),
  };
  const store = {
    timeZoneOf: vi.fn((id: string): Observable<string | null> => {
      const source = zones[id];
      return source instanceof Subject ? source.asObservable() : of(source ?? null);
    }),
  };

  TestBed.configureTestingModule({
    imports: [BookingCalendar],
    providers: [
      provideI18nTesting(),
      { provide: HostBookingsApi, useValue: api },
      { provide: HostPropertyStore, useValue: store },
    ],
  });
  const fixture: ComponentFixture<BookingCalendar> = TestBed.createComponent(BookingCalendar);
  fixture.componentRef.setInput('hostelId', hostelId);
  const settle = () => {
    for (let i = 0; i < 4; i++) fixture.detectChanges();
  };
  settle();

  const vm = fixture.componentInstance as unknown as Internals;
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    api,
    store,
    calls,
    vm,
    settle,
    todayCells: () => vm.month().days.filter((d) => d.isToday).map((d) => d.date),
    label: () => el.querySelector('button[aria-label] + span')?.textContent?.trim() ?? '',
    skeletons: () => el.querySelectorAll('hh-skeleton').length,
    switchHostel(id: string) {
      fixture.componentRef.setInput('hostelId', id);
      settle();
    },
    tryAgain() {
      // The testing transloco renders every key as itself.
      const button = Array.from(el.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'common.tryAgain',
      );
      if (!button) throw new Error('no "Try again" button on screen');
      button.click();
      settle();
    },
  };
}

/**
 * "Today" is the hostel's date, not the device's.
 *
 * It decides the highlighted cell, the month the calendar opens on and the ledger's default
 * day. Every case freezes the clock and reads it through a zone a day away from the other, so
 * the result cannot depend on where the test runs.
 */
describe('BookingCalendar today', () => {
  describe.each([
    { zone: EAST, today: '2026-04-01', month: 3, start: '2026-04-01', end: '2026-04-30' },
    { zone: WEST, today: '2026-03-31', month: 2, start: '2026-03-01', end: '2026-03-31' },
  ])('hostel in $zone at month end', ({ zone, today, month, start, end }) => {
    it('highlights the hostel date, in one cell only', () => {
      const c = setUp(I1, { h1: zone });

      expect(c.todayCells()).toEqual([today]);
    });

    it('opens on the hostel month and asks for exactly that month once', () => {
      const c = setUp(I1, { h1: zone });

      expect(c.vm.monthStart().getMonth()).toBe(month);
      expect(c.calls).toEqual([{ hostelId: 'h1', start, end }]);
    });
  });

  it.each([
    { zone: EAST, year: 2027, month: 0 },
    { zone: WEST, year: 2026, month: 11 },
  ])('opens on the hostel month across New Year for a hostel in $zone', ({ zone, year, month }) => {
    const c = setUp(IY, { h1: zone });

    expect(c.vm.monthStart().getFullYear()).toBe(year);
    expect(c.vm.monthStart().getMonth()).toBe(month);
  });

  it.each([
    { zone: EAST, day: '2026-03-16' },
    { zone: WEST, day: '2026-03-15' },
  ])('opens the ledger on $day for a hostel in $zone', ({ zone, day }) => {
    const c = setUp(I2, { h1: zone });

    expect(c.vm.selected()).toBe(day);
    expect(c.api.bookingsOn).toHaveBeenCalledWith('h1', day);
  });

  it('steps a month at a time from the hostel month and lands back on today', () => {
    const c = setUp(I1, { h1: EAST });

    c.vm.step(1);
    c.settle();
    expect(c.vm.monthStart().getMonth()).toBe(4);
    expect(c.vm.selected()).toBe('2026-05-01');

    c.vm.step(-1);
    c.settle();
    expect(c.vm.monthStart().getMonth()).toBe(3);
    expect(c.vm.selected()).toBe('2026-04-01');
    expect(c.todayCells()).toEqual(['2026-04-01']);
  });

  it('keeps a picked day through "Try again" and a local booking move', () => {
    const c = setUp(I2, { h1: WEST });
    const picked = c.vm.month().days.find((d) => d.date === '2026-03-20') as DayCell;
    c.vm.select(picked);
    c.settle();
    expect(c.vm.selected()).toBe('2026-03-20');

    c.vm.retry();
    c.settle();
    expect(c.vm.selected()).toBe('2026-03-20');

    c.fixture.componentInstance.applyChange(booking('pending'), booking('cancelled'));
    c.settle();
    expect(c.vm.selected()).toBe('2026-03-20');
  });

  describe('while the zone is pending', () => {
    it('fetches nothing and shows an unlabelled skeleton until the zone lands', () => {
      const zone = new Subject<string | null>();
      const c = setUp(I1, { h1: zone });

      expect(c.calls).toEqual([]);
      expect(c.label()).toBe('');
      expect(c.skeletons()).toBeGreaterThan(0);

      zone.next(EAST);
      c.settle();

      expect(c.calls).toEqual([{ hostelId: 'h1', start: '2026-04-01', end: '2026-04-30' }]);
      expect(c.label()).toBe('April 2026');
      expect(c.skeletons()).toBe(0);
    });

    it('holds the month arrows and the day ledger back until the zone lands', () => {
      const zone = new Subject<string | null>();
      const c = setUp(I1, { h1: zone });
      const el = c.fixture.nativeElement as HTMLElement;
      const arrow = (key: string) =>
        el.querySelector<HTMLButtonElement>(`button[aria-label="${key}"]`) as HTMLButtonElement;
      const ledger = () => el.querySelector('aside') as HTMLElement;
      const ledgerText = () => ledger().textContent ?? '';
      const ledgerSkeletons = () => ledger().querySelectorAll('hh-skeleton').length;
      const laneChips = () => ledger().querySelectorAll('button[aria-disabled], button.col-span-2');

      expect(arrow('a11y.previousMonth').disabled).toBe(true);
      expect(arrow('a11y.nextMonth').disabled).toBe(true);
      expect(ledgerText()).not.toContain('Nothing pending');
      expect(ledgerText()).not.toContain('Awaiting confirmation');
      expect(ledgerText()).not.toContain('hostBookings.nothingIsWaitingOnYou');
      expect(ledgerText()).not.toContain('Pending');
      expect(laneChips()).toHaveLength(0);
      expect(ledger().querySelector('h3')?.textContent?.trim()).toBe('');
      expect(ledgerSkeletons()).toBeGreaterThan(0);

      // A press while pending must not move the month the hostel then opens on.
      c.vm.step(1);
      zone.next(EAST);
      c.settle();

      expect(c.vm.monthStart().getMonth()).toBe(3);
      expect(c.label()).toBe('April 2026');
      expect(arrow('a11y.previousMonth').disabled).toBe(false);
      expect(arrow('a11y.nextMonth').disabled).toBe(false);
      expect(ledgerSkeletons()).toBe(0);
      expect(ledgerText()).toContain('Nothing pending');
      expect(ledgerText()).toContain('Awaiting confirmation');
      expect(ledgerText()).toContain('hostBookings.nothingIsWaitingOnYou');
      expect(ledgerText()).toContain('Pending');
      expect(ledger().querySelector('h3')?.textContent?.trim()).toBe('Wed 1 April');
    });

    it('waits for the new hostel’s zone after a switch, then fetches once', () => {
      const late = new Subject<string | null>();
      const c = setUp(I1, { h1: EAST, h2: late });
      const forH2 = () => c.calls.filter((call) => call.hostelId === 'h2');

      c.switchHostel('h2');
      expect(forH2()).toEqual([]);
      expect(c.label()).toBe('');

      late.next(WEST);
      c.settle();

      expect(forH2()).toEqual([{ hostelId: 'h2', start: '2026-03-01', end: '2026-03-31' }]);
    });
  });

  it('asks the same range again and recovers when "Try again" is pressed after a failure', () => {
    const c = setUp(I2, { h1: EAST }, 'h1', true);
    expect(c.vm.state().error).toBe(true);
    expect(c.calls).toHaveLength(1);

    c.tryAgain();

    expect(c.calls).toHaveLength(2);
    expect(c.calls[1]).toEqual(c.calls[0]);
    expect(c.vm.state().error).toBe(false);
    expect(c.todayCells()).toEqual(['2026-03-16']);
  });

  it('keeps the day it opened on when the clock moves on', () => {
    const c = setUp(I2, { h1: EAST });
    expect(c.todayCells()).toEqual(['2026-03-16']);

    vi.setSystemTime(I2 + 2 * DAY_MS);
    c.vm.step(1);
    c.settle();
    c.vm.step(-1);
    c.settle();

    expect(c.todayCells()).toEqual(['2026-03-16']);
  });

  it('switches to the new hostel’s date and month when the hostel changes zone', () => {
    const c = setUp(I1, { h1: EAST, h2: WEST });
    expect(c.todayCells()).toEqual(['2026-04-01']);

    c.switchHostel('h2');

    expect(c.store.timeZoneOf).toHaveBeenCalledWith('h2');
    expect(c.todayCells()).toEqual(['2026-03-31']);
    expect(c.calls[c.calls.length - 1]).toEqual({
      hostelId: 'h2',
      start: '2026-03-01',
      end: '2026-03-31',
    });
  });

  describe.each([{ zone: 'Mars/Olympus' }, { zone: null }])('hostel zone is $zone', ({ zone }) => {
    it('falls back to the device date and still fetches the month', () => {
      const c = setUp(I2, { h1: zone });
      const { start, end } = monthRange(new Date(I2));

      expect(c.todayCells()).toEqual([deviceDay(I2)]);
      expect(c.vm.selected()).toBe(deviceDay(I2));
      expect(c.calls).toEqual([{ hostelId: 'h1', start, end }]);
    });
  });

  it('reads 1 April in Karachi at 01:30 even when the device is still on 31 March', () => {
    const c = setUp(K, { h1: 'Asia/Karachi' });

    expect(c.todayCells()).toEqual(['2026-04-01']);
    expect(c.vm.monthStart().getMonth()).toBe(3);
    expect(c.calls).toEqual([{ hostelId: 'h1', start: '2026-04-01', end: '2026-04-30' }]);
  });

  it('is unchanged for a hostel in the device’s own zone', () => {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const c = setUp(I1, { h1: device });
    const { start, end } = monthRange(new Date(I1));

    expect(c.todayCells()).toEqual([deviceDay(I1)]);
    expect(c.vm.selected()).toBe(deviceDay(I1));
    expect(c.calls).toEqual([{ hostelId: 'h1', start, end }]);
  });
});
