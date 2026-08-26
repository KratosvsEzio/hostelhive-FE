import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { BookingApi } from '@features/public/listing/booking/booking-api';
import {
  ApiBooking,
  ApiRoomCalendarResponse,
} from '@features/public/listing/booking/booking-api.contract';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { RoomCalendar } from './room-calendar';

const ROOM = 'r1';

function booking(id: string, from: string, to: string, name: string, qty = 1): ApiBooking {
  return {
    id,
    hostel_id: 'h1',
    hostel_name: 'Demo',
    check_in: from,
    check_out: to,
    guests: qty,
    lines: [
      {
        room_id: ROOM,
        room_title: 'Sunset 8',
        room_type: 'shared',
        quantity: qty,
        unit_price: 1000,
        actual_price: 1000,
      },
    ],
    total: 1000 * qty,
    deposit: 0,
    status: 'confirmed',
    created_at: '2026-02-01T00:00:00Z',
    cancellation: null,
    guest: { name, email: '', phone: null },
  };
}

/**
 * `booked` is units, not bookings — one booking holding three beds books three.
 *
 * Derived from the bookings rather than passed in, because writing the two by hand is how a
 * fixture ends up describing a room the API could never return.
 */
function days(capacity: number, booked: Record<string, string[]>, bookings: ApiBooking[] = []) {
  const units = new Map(
    bookings.map((b) => [
      b.id,
      b.lines.filter((l) => l.room_id === ROOM).reduce((n, l) => n + l.quantity, 0),
    ]),
  );
  const out = [];
  for (let d = 1; d <= 31; d++) {
    const date = `2026-03-${String(d).padStart(2, '0')}`;
    const ids = booked[date] ?? [];
    out.push({
      date,
      booked: ids.reduce((n, id) => n + (units.get(id) ?? 1), 0),
      capacity,
      booking_ids: ids,
    });
  }
  return out;
}

class ApiStub {
  response: ApiRoomCalendarResponse = { days: [], bookings: [], success: true };
  roomCalendar(): Observable<ApiRoomCalendarResponse> {
    return of(this.response);
  }
}

/**
 * The month grid, as a host reads it.
 *
 * All of this is arithmetic over a date range, and all of it is invisible until somebody
 * looks at the right week of the right month — a pip too many, a week percentage that counts
 * the padding days either side, an oversell silently clamped to "full". Worth pinning
 * precisely because none of it announces itself when it goes wrong.
 */
describe('RoomCalendar pips', () => {
  let api: ApiStub;
  let fixture: ComponentFixture<RoomCalendar>;

  function setUp(capacity: number, booked: Record<string, string[]>, bookings: ApiBooking[]) {
    TestBed.resetTestingModule();
    api = new ApiStub();
    api.response = { days: days(capacity, booked, bookings), bookings, success: true };
    TestBed.configureTestingModule({
      imports: [RoomCalendar],
      providers: [provideI18nTesting(), { provide: BookingApi, useValue: api }],
    });
    fixture = TestBed.createComponent(RoomCalendar);
    fixture.componentRef.setInput('hostelId', 'h1');
    fixture.componentRef.setInput('roomId', ROOM);
    // March 2026 relative to whenever the suite runs.
    const now = new Date();
    const offset = (2026 - now.getFullYear()) * 12 + (2 - now.getMonth());
    (fixture.componentInstance as unknown as { offset: { set(n: number): void } }).offset.set(
      offset,
    );
    fixture.detectChanges();
    return fixture.componentInstance as unknown as {
      weeks(): { days: { date: string | null; pips: unknown[]; free: number; oversold: boolean; arrivals: number; departures: number }[]; pct: number; label: string }[];
      capacity(): number;
      isPrivate(): boolean;
      bedRuler(): number[];
      showBedRuler(): boolean;
      pipColumns(): number;
      roster(): { name: string; units: number; arriving: boolean; leaving: boolean }[];
      select(d: string): void;
      selectedRatio(): string;
      selectedTurnover(): string;
    };
  }

  function dayOf(c: ReturnType<typeof setUp>, date: string) {
    return c
      .weeks()
      .flatMap((w) => w.days)
      .find((d) => d.date === date);
  }

  it('draws one pip per bed, whatever is sold', () => {
    const c = setUp(8, { '2026-03-10': ['b1'] }, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha', 3),
    ]);

    const day = dayOf(c, '2026-03-10');
    expect(day?.pips.length).toBe(8);
  });

  it('fills a pip per unit the booking holds, not one per booking', () => {
    const c = setUp(8, { '2026-03-10': ['b1'] }, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha', 3),
    ]);

    const filled = (dayOf(c, '2026-03-10')?.pips as { bookingId: string | null }[]).filter(
      (p) => p.bookingId,
    );
    expect(filled.length).toBe(3);
  });

  it('gives every guest their own colour', () => {
    const c = setUp(8, { '2026-03-10': ['b1', 'b2'] }, [
      booking('b1', '2026-03-09', '2026-03-12', 'Ayesha', 2),
      booking('b2', '2026-03-10', '2026-03-11', 'Bilal', 1),
    ]);

    const pips = dayOf(c, '2026-03-10')?.pips as { bookingId: string | null; colour: string }[];
    const byBooking = new Map(pips.filter((p) => p.bookingId).map((p) => [p.bookingId, p.colour]));
    expect(byBooking.size).toBe(2);
    expect(new Set(byBooking.values()).size).toBe(2);
  });

  // An oversell is a thing a host has to see, not a rounding error to clamp away.
  it('marks pips past capacity as a clash rather than dropping them', () => {
    const c = setUp(2, { '2026-03-10': ['b1'] }, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha', 4),
    ]);

    const day = dayOf(c, '2026-03-10');
    const pips = day?.pips as { clash: boolean }[];
    expect(pips.length).toBe(4);
    expect(pips.filter((p) => p.clash).length).toBe(2);
    expect(day?.oversold).toBe(true);
  });

  it('counts arrivals and departures separately, with check-out exclusive', () => {
    const c = setUp(8, { '2026-03-10': ['b1', 'b2'], '2026-03-12': ['b1'] }, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha'),
      booking('b2', '2026-03-10', '2026-03-11', 'Bilal'),
    ]);

    expect(dayOf(c, '2026-03-10')?.arrivals).toBe(2);
    expect(dayOf(c, '2026-03-10')?.departures).toBe(0);
    // b1's check_out is the 12th, so the 12th is a departure and not an occupied night.
    expect(dayOf(c, '2026-03-12')?.departures).toBe(1);
  });

  it('reports beds still sellable', () => {
    const c = setUp(8, { '2026-03-10': ['b1'] }, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha', 3),
    ]);

    expect(dayOf(c, '2026-03-10')?.free).toBe(5);
  });

  // The padding cells either side of the month belong to other months; counting their
  // capacity would drag every first and last week of the year down towards zero.
  it('measures a week against its own days only', () => {
    const c = setUp(2, { '2026-03-02': ['b1'], '2026-03-03': ['b1'] }, [
      booking('b1', '2026-03-02', '2026-03-04', 'Ayesha', 2),
    ]);

    // 2–8 March 2026 is a full Monday-start week: 7 days x 2 beds = 14 sellable, 4 sold.
    const week = c.weeks().find((w) => w.days.some((d) => d.date === '2026-03-02'));
    expect(week?.label).toBe('4/14');
    expect(week?.pct).toBe(29);
  });

  it('never reports more than a hundred per cent, even oversold', () => {
    const c = setUp(1, { '2026-03-02': ['b1'] }, [
      booking('b1', '2026-03-02', '2026-03-03', 'Ayesha', 5),
    ]);

    const week = c.weeks().find((w) => w.days.some((d) => d.date === '2026-03-02'));
    expect(week?.pct ?? 0).toBeLessThanOrEqual(100);
  });

  it('treats a capacity-one room as private, with no bed ruler', () => {
    const c = setUp(1, {}, []);

    expect(c.isPrivate()).toBe(true);
    expect(c.bedRuler()).toEqual([]);
  });

  it('numbers the ruler once per bed on a shared room', () => {
    const c = setUp(6, {}, []);

    expect(c.isPrivate()).toBe(false);
    expect(c.bedRuler()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  /**
   * Big dorms.
   *
   * A day cell is about 65px wide, so a single row of pips shrinks as capacity climbs: at
   * sixteen beds each pip is 1.2px, and past twenty-two the width goes negative and they
   * disappear altogether. Wrapping is what keeps a pip countable, and these pin the sizes
   * where it stops working without one.
   */
  it('wraps a sixteen-bed dorm into two rows of eight', () => {
    const c = setUp(16, {}, []);

    expect(c.pipColumns()).toBe(8);
    expect(dayOf(c, '2026-03-10')?.pips.length).toBe(16);
  });

  it('balances the rows rather than leaving a stub', () => {
    // Twelve as 6+6 rather than 8+4, which reads as four beds missing.
    expect(setUp(12, {}, []).pipColumns()).toBe(6);
    expect(setUp(9, {}, []).pipColumns()).toBe(5);
    expect(setUp(20, {}, []).pipColumns()).toBe(7);
  });

  it('leaves a small room on one row', () => {
    expect(setUp(8, {}, []).pipColumns()).toBe(8);
    expect(setUp(4, {}, []).pipColumns()).toBe(4);
    expect(setUp(1, {}, []).pipColumns()).toBe(1);
  });

  // Whatever the capacity, a pip has to stay wide enough to see. 65px of cell, 3px gaps.
  it('keeps every pip at least three pixels wide up to forty beds', () => {
    const CELL = 64.6;
    for (let n = 1; n <= 40; n++) {
      const cols = setUp(n, {}, []).pipColumns();
      const width = (CELL - 3 * (cols - 1)) / cols;
      expect(width).toBeGreaterThan(3);
    }
  });

  it('drops the bed ruler once it is more digits than legend', () => {
    expect(setUp(8, {}, []).showBedRuler()).toBe(true);
    expect(setUp(12, {}, []).showBedRuler()).toBe(true);
    expect(setUp(16, {}, []).showBedRuler()).toBe(false);
    // A private room has one unit, so numbering it says there is another to tell it from.
    expect(setUp(1, {}, []).showBedRuler()).toBe(false);
  });
});

describe('RoomCalendar day roster', () => {
  let api: ApiStub;

  function setUp(capacity: number, booked: Record<string, string[]>, bookings: ApiBooking[]) {
    TestBed.resetTestingModule();
    api = new ApiStub();
    api.response = { days: days(capacity, booked, bookings), bookings, success: true };
    TestBed.configureTestingModule({
      imports: [RoomCalendar],
      providers: [provideI18nTesting(), { provide: BookingApi, useValue: api }],
    });
    const fixture = TestBed.createComponent(RoomCalendar);
    fixture.componentRef.setInput('hostelId', 'h1');
    fixture.componentRef.setInput('roomId', ROOM);
    const now = new Date();
    const offset = (2026 - now.getFullYear()) * 12 + (2 - now.getMonth());
    (fixture.componentInstance as unknown as { offset: { set(n: number): void } }).offset.set(
      offset,
    );
    fixture.detectChanges();
    return fixture.componentInstance as unknown as {
      select(d: string): void;
      roster(): { name: string; units: number; arriving: boolean; leaving: boolean; initials: string }[];
      selectedRatio(): string;
      selectedTurnover(): string;
    };
  }

  it('lists who is in the room on the day picked', () => {
    const c = setUp(8, { '2026-03-10': ['b1', 'b2'] }, [
      booking('b1', '2026-03-09', '2026-03-12', 'Ayesha Khan', 2),
      booking('b2', '2026-03-10', '2026-03-11', 'Bilal Ahmed', 1),
    ]);
    c.select('2026-03-10');

    expect(c.roster().map((r) => r.name)).toEqual(['Ayesha Khan', 'Bilal Ahmed']);
    expect(c.roster().map((r) => r.units)).toEqual([2, 1]);
    expect(c.roster()[0].initials).toBe('AK');
  });

  it('marks who is arriving and who is leaving that day', () => {
    const c = setUp(8, { '2026-03-10': ['b1', 'b2'] }, [
      booking('b1', '2026-03-09', '2026-03-10', 'Leaver'),
      booking('b2', '2026-03-10', '2026-03-14', 'Arriver'),
    ]);
    c.select('2026-03-10');

    const byName = new Map(c.roster().map((r) => [r.name, r]));
    expect(byName.get('Leaver')?.leaving).toBe(true);
    expect(byName.get('Arriver')?.arriving).toBe(true);
  });

  it('reads out the ratio and the turnover', () => {
    const c = setUp(8, { '2026-03-10': ['b1', 'b2'] }, [
      booking('b1', '2026-03-09', '2026-03-10', 'Leaver'),
      booking('b2', '2026-03-10', '2026-03-14', 'Arriver'),
    ]);
    c.select('2026-03-10');

    expect(c.selectedRatio()).toBe('2 of 8 beds');
    expect(c.selectedTurnover()).toBe('1 in · 1 out');
  });

  it('says so plainly when a day has neither', () => {
    const c = setUp(8, { '2026-03-10': ['b1'] }, [
      booking('b1', '2026-03-08', '2026-03-14', 'Stayer'),
    ]);
    c.select('2026-03-10');

    expect(c.selectedTurnover()).toBe('no arrivals or departures');
  });

  it('is empty for a day nobody is in', () => {
    const c = setUp(8, { '2026-03-10': ['b1'] }, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha'),
    ]);
    c.select('2026-03-20');

    expect(c.roster()).toEqual([]);
  });
});

/**
 * The roster panel, as rendered.
 *
 * Asserted against the DOM rather than the signals because "is it on the page" is a
 * different question from "does it compute" — a panel can have perfect data and still be
 * behind a collapsed flex column, and the signal tests would pass either way.
 */
describe('RoomCalendar roster panel renders', () => {
  function mount(capacity: number, booked: Record<string, string[]>, bookings: ApiBooking[]) {
    TestBed.resetTestingModule();
    const api = new ApiStub();
    api.response = { days: days(capacity, booked, bookings), bookings, success: true };
    TestBed.configureTestingModule({
      imports: [RoomCalendar],
      providers: [provideI18nTesting(), { provide: BookingApi, useValue: api }],
    });
    const fixture = TestBed.createComponent(RoomCalendar);
    fixture.componentRef.setInput('hostelId', 'h1');
    fixture.componentRef.setInput('roomId', ROOM);
    const now = new Date();
    (fixture.componentInstance as unknown as { offset: { set(n: number): void } }).offset.set(
      (2026 - now.getFullYear()) * 12 + (2 - now.getMonth()),
    );
    fixture.detectChanges();
    return fixture;
  }

  it('puts the panel on the page beside the grid', () => {
    const f = mount(8, { '2026-03-10': ['b1'] }, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha Khan', 2),
    ]);
    const aside: HTMLElement | null = f.nativeElement.querySelector('aside');

    expect(aside).not.toBeNull();
    expect(aside?.textContent).toContain('Day roster');
    // xl: puts it to the right of the grid; below that it stacks under it.
    expect(aside?.className).toContain('xl:w-[320px]');
  });

  it('lists the guests of the day it opens on', () => {
    const f = mount(8, { '2026-03-10': ['b1', 'b2'] }, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha Khan', 2),
      booking('b2', '2026-03-10', '2026-03-11', 'Bilal Ahmed', 1),
    ]);
    (f.componentInstance as unknown as { select(d: string): void }).select('2026-03-10');
    f.detectChanges();

    const rows = f.nativeElement.querySelectorAll('aside li');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Ayesha Khan');
  });

  it('still shows the panel on a private room', () => {
    const f = mount(1, {}, []);
    const aside: HTMLElement | null = f.nativeElement.querySelector('aside');

    expect(aside).not.toBeNull();
    expect(aside?.textContent).toContain('Day roster');
  });

  it('says the day is empty rather than showing nothing at all', () => {
    const f = mount(8, { '2026-03-10': ['b1'] }, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha'),
    ]);
    (f.componentInstance as unknown as { select(d: string): void }).select('2026-03-20');
    f.detectChanges();

    expect(f.nativeElement.querySelector('aside')?.textContent).toContain('Nobody in this room');
  });
});
