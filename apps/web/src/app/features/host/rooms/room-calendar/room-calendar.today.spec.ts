import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { HostBooking, HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { RoomCalendar } from './room-calendar';

/** Two zones a full day apart, so every pair below differs on any device. */
const EAST = 'Pacific/Kiritimati'; // UTC+14
const WEST = 'Pacific/Pago_Pago'; // UTC-11

/** Month end: EAST is already 1 April, WEST still 31 March. */
const I1 = Date.UTC(2026, 2, 31, 12, 0, 0);
/** Mid month: EAST 16 March, WEST 15 March. */
const I2 = Date.UTC(2026, 2, 15, 12, 0, 0);

/** Only `Date` is faked: Angular still needs real timers and microtasks to render. */
function freeze(instant: number): void {
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(instant);
}

afterEach(() => vi.useRealTimers());

function checkedOut(from: string, to: string, guests: number): HostBooking {
  return {
    id: 'b1',
    ref: 'HH-b1',
    guest: { name: 'Ayesha', phone: '', email: '' },
    checkIn: from,
    checkOut: to,
    nights: 1,
    guests,
    total: 0,
    paid: 0,
    balanceDue: 0,
    roomType: { name: 'Dorm', occupancyType: 'shared', capacity: 4, price: 0 },
    status: { slug: 'paid', name: 'Paid' },
    disposition: { slug: 'checked-out', name: 'Checked out' },
  } as HostBooking;
}

class ApiStub {
  bookings: HostBooking[] = [];
  ranges: { from: string; to: string }[] = [];
  bookingsInRoom(_hostel: string, _room: string, from: string, to: string): Observable<HostBooking[]> {
    this.ranges.push({ from, to });
    return of(this.bookings);
  }
}

interface Internals {
  weeks(): { days: { date: string | null; free: number; isToday: boolean }[] }[];
  selected(): string | null;
  month(): Date;
  step(by: number): void;
  select(date: string): void;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The device's own date for an instant, which is what a missing zone must fall back to. */
function deviceDay(instant: number): string {
  const d = new Date(instant);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The calendar as a host reads it, opened at a frozen instant.
 *
 * The clock is frozen before the component is built: it reads the clock once, there.
 */
function setUp(instant: number, zone: string | null, bookings: HostBooking[] = []) {
  freeze(instant);
  TestBed.resetTestingModule();
  const api = new ApiStub();
  api.bookings = bookings;
  TestBed.configureTestingModule({
    imports: [RoomCalendar],
    providers: [provideI18nTesting(), { provide: HostBookingsApi, useValue: api }],
  });
  const fixture: ComponentFixture<RoomCalendar> = TestBed.createComponent(RoomCalendar);
  fixture.componentRef.setInput('hostelId', 'h1');
  fixture.componentRef.setInput('roomId', 'r1');
  fixture.componentRef.setInput('capacity', 4);
  fixture.componentRef.setInput('timeZone', zone);
  fixture.detectChanges();
  const vm = fixture.componentInstance as unknown as Internals;
  const cells = () => vm.weeks().flatMap((w) => w.days);
  return {
    fixture,
    api,
    vm,
    cells,
    todayCells: () => cells().filter((d) => d.isToday).map((d) => d.date),
    cell: (date: string) => cells().find((d) => d.date === date),
    setZone(next: string | null) {
      fixture.componentRef.setInput('timeZone', next);
      fixture.detectChanges();
    },
  };
}

/**
 * "Today" is the hostel's date, not the device's.
 *
 * It decides the highlighted cell, the month the calendar opens on, the roster's default day
 * and which nights a checked-out stay still holds. Every case freezes the clock and reads it
 * through a zone a day away from the other, so the result cannot depend on where the test runs.
 */
describe('RoomCalendar today', () => {
  describe.each([
    { zone: EAST, today: '2026-04-01', month: 3, label: 'April' },
    { zone: WEST, today: '2026-03-31', month: 2, label: 'March' },
  ])('hostel in $zone at month end', ({ zone, today, month }) => {
    it('highlights the hostel date, in one cell only', () => {
      const c = setUp(I1, zone);

      expect(c.todayCells()).toEqual([today]);
    });

    it('opens on the hostel month and asks for exactly that month', () => {
      const c = setUp(I1, zone);

      expect(c.vm.month().getMonth()).toBe(month);
      expect(c.api.ranges).toEqual([
        month === 3
          ? { from: '2026-04-01', to: '2026-04-30' }
          : { from: '2026-03-01', to: '2026-03-31' },
      ]);
    });
  });

  // One arrow press moves exactly one month from the month the hostel opened on.
  it('steps a month at a time from the hostel month', () => {
    const c = setUp(I1, EAST);

    c.vm.step(1);
    c.fixture.detectChanges();
    expect(c.vm.month().getMonth()).toBe(4);

    c.vm.step(-2);
    c.fixture.detectChanges();
    expect(c.vm.month().getMonth()).toBe(2);
  });

  it.each([
    { zone: EAST, day: '2026-03-16' },
    { zone: WEST, day: '2026-03-15' },
  ])('opens the roster on $day for a hostel in $zone', ({ zone, day }) => {
    const c = setUp(I2, zone);

    expect(c.vm.selected()).toBe(day);
  });

  /**
   * Checked out 10-20 March, two guests in a four-bed room: the hostel's date decides whether
   * the 15th is a night they slept (EAST: today is the 16th) or one already back on sale.
   */
  it.each([
    { zone: EAST, free: 2 },
    { zone: WEST, free: 4 },
  ])('frees tonight’s beds on the hostel date for a hostel in $zone', ({ zone, free }) => {
    const c = setUp(I2, zone, [checkedOut('2026-03-10', '2026-03-20', 2)]);

    expect(c.cell('2026-03-15')?.free).toBe(free);
  });

  describe('when the zone changes', () => {
    it('keeps the month and the day a host picked within the same month', () => {
      const c = setUp(I2, WEST);
      c.vm.select('2026-03-20');
      c.fixture.detectChanges();

      c.setZone(EAST);

      expect(c.vm.month().getMonth()).toBe(2);
      expect(c.vm.selected()).toBe('2026-03-20');
    });

    it('moves the month and the highlight when the zone arrives late', () => {
      const c = setUp(I1, null);
      expect(c.todayCells()).toEqual([deviceDay(I1)]);

      c.setZone(EAST);

      expect(c.vm.month().getMonth()).toBe(3);
      expect(c.todayCells()).toEqual(['2026-04-01']);
    });

    it('fetches again and counts free beds against the new date', () => {
      const c = setUp(I2, WEST, [checkedOut('2026-03-10', '2026-03-20', 2)]);
      const before = c.api.ranges.length;
      expect(c.cell('2026-03-15')?.free).toBe(4);

      c.setZone(EAST);

      expect(c.api.ranges.length).toBeGreaterThan(before);
      expect(c.cell('2026-03-15')?.free).toBe(2);
    });
  });

  /**
   * The page is left open across midnight: the day it opened on stays "today" until a reload.
   * The clock moves two days after mount; a zone change forces the date to be worked out
   * again, and it must come from the instant the calendar opened at, not from the clock now.
   */
  it('keeps the day it opened on when the clock moves on', () => {
    const c = setUp(I2, EAST);
    expect(c.todayCells()).toEqual(['2026-03-16']);

    vi.setSystemTime(I2 + 2 * 24 * 60 * 60 * 1000);
    c.fixture.componentRef.setInput('capacity', 5);
    c.fixture.detectChanges();
    expect(c.todayCells()).toEqual(['2026-03-16']);

    c.setZone(WEST);
    expect(c.todayCells()).toEqual(['2026-03-15']);
  });

  describe.each([{ zone: 'Mars/Olympus' }, { zone: null }])(
    'hostel zone is $zone',
    ({ zone }) => {
      it('falls back to the device date without throwing', () => {
        const c = setUp(I2, zone);

        expect(c.todayCells()).toEqual([deviceDay(I2)]);
        expect(c.vm.selected()).toBe(deviceDay(I2));
      });
    },
  );
});
