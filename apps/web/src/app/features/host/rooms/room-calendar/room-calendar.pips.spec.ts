import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { HostBooking, HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { RoomCalendar } from './room-calendar';

const ROOM = 'r1';

/**
 * The clock, pinned inside the month every fixture here is written in.
 *
 * The stays below are all dated March 2026 and the component bases its grid on the month it
 * was constructed in, so the harness used to work out an offset from its own `new Date()`
 * while the component read its own. Two reads of a moving value, trusted to agree — and they
 * do, except across midnight at the turn of a month, where the grid renders a month either
 * side of the dates and every `dayOf` lookup comes back undefined. That is the intermittent
 * failure this file produced in a full run; parallel load only widened the gap between the
 * two reads, it was never the cause.
 *
 * Pinned mid-month so there is no boundary to be near, which also makes the offset zero and
 * lets the fixtures simply say March 2026 rather than computing their way there.
 *
 * Only `Date` is faked — Angular still needs real timers and microtasks to render.
 */
function freezeMidMarch2026(): void {
  // Installed once, then only re-pointed. `setUp` runs forty times inside the pip-width test,
  // and installing the fake clock on every one of those pushed it past vitest's five-second
  // limit on CI while passing locally in two — a green suite here and a red one there.
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
}

afterEach(() => vi.useRealTimers());

/**
 * A stay as the bookings endpoint returns it, narrowed to what this screen reads.
 *
 * `qty` is guests, which is what the component counts as beds held: a party of three in a
 * dorm fills three pips, not one.
 */
function booking(id: string, from: string, to: string, name: string, qty = 1): HostBooking {
  return {
    id,
    ref: `HH-${id}`,
    guest: { name, phone: '', email: '' },
    checkIn: from,
    checkOut: to,
    nights: 1,
    guests: qty,
    total: 1000 * qty,
    deposit: 0,
    paid: 0,
    balanceDue: 0,
    roomType: { name: 'Sunset 8', occupancyType: 'shared', capacity: 8, price: 1000 },
    status: { slug: 'paid', name: 'Paid' },
    disposition: { slug: 'checked-in', name: 'Checked in' },
  } as HostBooking;
}

/**
 * The per-day occupancy is no longer part of the fixture.
 *
 * It used to be written out alongside the bookings — a date-to-ids map the test had to keep
 * in step with the stays it listed — because the endpoint used to return it. The component
 * derives it now, so the fixture states the stays and the arithmetic under test is the
 * component's own rather than something the harness handed it the answer to.
 */
class ApiStub {
  bookings: HostBooking[] = [];
  bookingsInRoom(): Observable<HostBooking[]> {
    return of(this.bookings);
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

  function setUp(capacity: number, bookings: HostBooking[]) {
    freezeMidMarch2026(); // before the component is built: it reads the clock once, there
    TestBed.resetTestingModule();
    api = new ApiStub();
    api.bookings = bookings;
    TestBed.configureTestingModule({
      imports: [RoomCalendar],
      providers: [provideI18nTesting(), { provide: HostBookingsApi, useValue: api }],
    });
    fixture = TestBed.createComponent(RoomCalendar);
    fixture.componentRef.setInput('hostelId', 'h1');
    fixture.componentRef.setInput('roomId', ROOM);
    fixture.componentRef.setInput('capacity', capacity);
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
    const c = setUp(8, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha', 3),
    ]);

    const day = dayOf(c, '2026-03-10');
    expect(day?.pips.length).toBe(8);
  });

  it('fills a pip per unit the booking holds, not one per booking', () => {
    const c = setUp(8, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha', 3),
    ]);

    const filled = (dayOf(c, '2026-03-10')?.pips as { bookingId: string | null }[]).filter(
      (p) => p.bookingId,
    );
    expect(filled.length).toBe(3);
  });

  it('gives every guest their own colour', () => {
    const c = setUp(8, [
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
    const c = setUp(2, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha', 4),
    ]);

    const day = dayOf(c, '2026-03-10');
    const pips = day?.pips as { clash: boolean }[];
    expect(pips.length).toBe(4);
    expect(pips.filter((p) => p.clash).length).toBe(2);
    expect(day?.oversold).toBe(true);
  });

  it('counts arrivals and departures separately, with check-out exclusive', () => {
    const c = setUp(8, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha'),
      booking('b2', '2026-03-10', '2026-03-11', 'Bilal'),
    ]);

    expect(dayOf(c, '2026-03-10')?.arrivals).toBe(2);
    expect(dayOf(c, '2026-03-10')?.departures).toBe(0);
    // b1's check_out is the 12th, so the 12th is a departure and not an occupied night.
    expect(dayOf(c, '2026-03-12')?.departures).toBe(1);
  });

  it('reports beds still sellable', () => {
    const c = setUp(8, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha', 3),
    ]);

    expect(dayOf(c, '2026-03-10')?.free).toBe(5);
  });

  // The padding cells either side of the month belong to other months; counting their
  // capacity would drag every first and last week of the year down towards zero.
  it('measures a week against its own days only', () => {
    const c = setUp(2, [
      booking('b1', '2026-03-02', '2026-03-04', 'Ayesha', 2),
    ]);

    // 2–8 March 2026 is a full Monday-start week: 7 days x 2 beds = 14 sellable, 4 sold.
    const week = c.weeks().find((w) => w.days.some((d) => d.date === '2026-03-02'));
    expect(week?.label).toBe('4/14');
    expect(week?.pct).toBe(29);
  });

  it('never reports more than a hundred per cent, even oversold', () => {
    const c = setUp(1, [
      booking('b1', '2026-03-02', '2026-03-03', 'Ayesha', 5),
    ]);

    const week = c.weeks().find((w) => w.days.some((d) => d.date === '2026-03-02'));
    expect(week?.pct ?? 0).toBeLessThanOrEqual(100);
  });

  it('treats a capacity-one room as private, with no bed ruler', () => {
    const c = setUp(1, []);

    expect(c.isPrivate()).toBe(true);
    expect(c.bedRuler()).toEqual([]);
  });

  it('numbers the ruler once per bed on a shared room', () => {
    const c = setUp(6, []);

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
    const c = setUp(16, []);

    expect(c.pipColumns()).toBe(8);
    expect(dayOf(c, '2026-03-10')?.pips.length).toBe(16);
  });

  it('balances the rows rather than leaving a stub', () => {
    // Twelve as 6+6 rather than 8+4, which reads as four beds missing.
    expect(setUp(12, []).pipColumns()).toBe(6);
    expect(setUp(9, []).pipColumns()).toBe(5);
    expect(setUp(20, []).pipColumns()).toBe(7);
  });

  it('leaves a small room on one row', () => {
    expect(setUp(8, []).pipColumns()).toBe(8);
    expect(setUp(4, []).pipColumns()).toBe(4);
    expect(setUp(1, []).pipColumns()).toBe(1);
  });

  /**
   * Whatever the capacity, a pip has to stay wide enough to see. 65px of cell, 3px gaps.
   *
   * One component, re-pointed at each capacity, rather than forty of them. `setUp` resets the
   * testing module and builds a fresh fixture every call, and doing that forty times took long
   * enough to pass here in two seconds and time out on CI at five — which is the intermittent
   * failure this file was carrying. It was a slow test, not the date race fixed alongside it:
   * the symptom was a timeout, never a wrong assertion.
   *
   * `pipColumns` reads `capacity` and nothing else, so setting the input is the whole of what
   * a rebuild was achieving.
   */
  it('keeps every pip at least three pixels wide up to forty beds', () => {
    const CELL = 64.6;
    const c = setUp(1, []);
    for (let n = 1; n <= 40; n++) {
      fixture.componentRef.setInput('capacity', n);
      const cols = c.pipColumns();
      const width = (CELL - 3 * (cols - 1)) / cols;
      expect({ n, wideEnough: width > 3 }).toEqual({ n, wideEnough: true });
    }
  });

  it('drops the bed ruler once it is more digits than legend', () => {
    expect(setUp(8, []).showBedRuler()).toBe(true);
    expect(setUp(12, []).showBedRuler()).toBe(true);
    expect(setUp(16, []).showBedRuler()).toBe(false);
    // A private room has one unit, so numbering it says there is another to tell it from.
    expect(setUp(1, []).showBedRuler()).toBe(false);
  });
});

describe('RoomCalendar day roster', () => {
  let api: ApiStub;

  function setUp(capacity: number, bookings: HostBooking[]) {
    freezeMidMarch2026(); // before the component is built: it reads the clock once, there
    TestBed.resetTestingModule();
    api = new ApiStub();
    api.bookings = bookings;
    TestBed.configureTestingModule({
      imports: [RoomCalendar],
      providers: [provideI18nTesting(), { provide: HostBookingsApi, useValue: api }],
    });
    const fixture = TestBed.createComponent(RoomCalendar);
    fixture.componentRef.setInput('hostelId', 'h1');
    fixture.componentRef.setInput('roomId', ROOM);
    fixture.componentRef.setInput('capacity', capacity);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as {
      select(d: string): void;
      roster(): { name: string; units: number; arriving: boolean; leaving: boolean; initials: string }[];
      selectedRatio(): string;
      selectedTurnover(): string;
    };
  }

  it('lists who is in the room on the day picked', () => {
    const c = setUp(8, [
      booking('b1', '2026-03-09', '2026-03-12', 'Ayesha Khan', 2),
      booking('b2', '2026-03-10', '2026-03-11', 'Bilal Ahmed', 1),
    ]);
    c.select('2026-03-10');

    expect(c.roster().map((r) => r.name)).toEqual(['Ayesha Khan', 'Bilal Ahmed']);
    expect(c.roster().map((r) => r.units)).toEqual([2, 1]);
    expect(c.roster()[0].initials).toBe('AK');
  });

  it('marks who is arriving and who is leaving that day', () => {
    const c = setUp(8, [
      booking('b1', '2026-03-09', '2026-03-10', 'Leaver'),
      booking('b2', '2026-03-10', '2026-03-14', 'Arriver'),
    ]);
    c.select('2026-03-10');

    const byName = new Map(c.roster().map((r) => [r.name, r]));
    expect(byName.get('Leaver')?.leaving).toBe(true);
    expect(byName.get('Arriver')?.arriving).toBe(true);
  });

  it('reads out the ratio and the turnover', () => {
    const c = setUp(8, [
      booking('b1', '2026-03-09', '2026-03-10', 'Leaver'),
      booking('b2', '2026-03-10', '2026-03-14', 'Arriver'),
    ]);
    c.select('2026-03-10');

    // One bed, not two. The leaver has released theirs by the night of the 10th — the same
    // check-out-exclusive rule asserted above — so a turnover day is one occupied bed and two
    // names on the roster. This read "2 of 8" while the harness hand-wrote the day's
    // occupancy: the fixture counted the departing guest as still in bed, and the assertion
    // was pinning that mistake rather than the component.
    expect(c.selectedRatio()).toBe('1 of 8 beds');
    expect(c.selectedTurnover()).toBe('1 in · 1 out');
  });

  it('says so plainly when a day has neither', () => {
    const c = setUp(8, [
      booking('b1', '2026-03-08', '2026-03-14', 'Stayer'),
    ]);
    c.select('2026-03-10');

    expect(c.selectedTurnover()).toBe('no arrivals or departures');
  });

  it('is empty for a day nobody is in', () => {
    const c = setUp(8, [
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
  function mount(capacity: number, bookings: HostBooking[]) {
    freezeMidMarch2026(); // before the component is built: it reads the clock once, there
    TestBed.resetTestingModule();
    const api = new ApiStub();
    api.bookings = bookings;
    TestBed.configureTestingModule({
      imports: [RoomCalendar],
      providers: [provideI18nTesting(), { provide: HostBookingsApi, useValue: api }],
    });
    const fixture = TestBed.createComponent(RoomCalendar);
    fixture.componentRef.setInput('hostelId', 'h1');
    fixture.componentRef.setInput('roomId', ROOM);
    fixture.componentRef.setInput('capacity', capacity);
    fixture.detectChanges();
    return fixture;
  }

  it('puts the panel on the page beside the grid', () => {
    const f = mount(8, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha Khan', 2),
    ]);
    const aside: HTMLElement | null = f.nativeElement.querySelector('aside');

    expect(aside).not.toBeNull();
    expect(aside?.textContent).toContain('hostRooms.dayRoster');
    // xl: puts it to the right of the grid; below that it stacks under it.
    expect(aside?.className).toContain('xl:w-[320px]');
  });

  it('lists the guests of the day it opens on', () => {
    const f = mount(8, [
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
    const f = mount(1, []);
    const aside: HTMLElement | null = f.nativeElement.querySelector('aside');

    expect(aside).not.toBeNull();
    expect(aside?.textContent).toContain('hostRooms.dayRoster');
  });

  it('says the day is empty rather than showing nothing at all', () => {
    const f = mount(8, [
      booking('b1', '2026-03-10', '2026-03-12', 'Ayesha'),
    ]);
    (f.componentInstance as unknown as { select(d: string): void }).select('2026-03-20');
    f.detectChanges();

    expect(f.nativeElement.querySelector('aside')?.textContent).toContain('hostRooms.nobodyInThisRoomThat');
  });
});

/**
 * Which month the arrows actually land on.
 *
 * `month` was a computed that read `new Date()` inside its own body:
 *
 *     const now = new Date();
 *     return new Date(now.getFullYear(), now.getMonth() + this.offset(), 1);
 *
 * A computed is only re-evaluated when a *signal* it read has changed, and wall-clock time
 * is not one — so the "now" it was built from was whenever it last happened to recompute,
 * which is to say arbitrary. Pressing an arrow was the only thing that invalidated it, and
 * pressing an arrow therefore re-based the whole calendar on today's date at the same
 * moment it applied the step.
 *
 * For a host that is a skipped month: open the calendar late on the last night of August,
 * leave it, press the forward arrow after midnight, and the offset goes 0 to 1 while the
 * base moves August to September — so August is followed by October and September cannot be
 * reached by pressing forward at all.
 *
 * For this suite it was the same defect wearing its other face. Every `setUp` here works out
 * a month offset from its own `new Date()`, so component and harness were reading the clock
 * twice and trusting the two to agree; on the boundary they do not, the grid renders a month
 * either side of the one the dates belong to, and every `dayOf` lookup comes back undefined.
 * That is the intermittent failure in a full run — rare, because the window is the turn of a
 * month, and load only decides how wide it is.
 *
 * The base is captured once now, at construction, so an arrow moves exactly one month and
 * the same calendar is on screen from one press to the next.
 */
describe('RoomCalendar month navigation', () => {
  /**
   * As {@link freezeMidMarch2026}, but these tests pick their own instant — the whole point
   * here is standing on the boundary the others are pinned away from. The file-level
   * `afterEach` puts the real clock back.
   */
  function clockAt(y: number, monthIndex: number, day: number, hour: number, min: number): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(y, monthIndex, day, hour, min, 0));
  }

  function mount() {
    TestBed.resetTestingModule();
    const api = new ApiStub();
    TestBed.configureTestingModule({
      imports: [RoomCalendar],
      providers: [provideI18nTesting(), { provide: HostBookingsApi, useValue: api }],
    });
    const fixture = TestBed.createComponent(RoomCalendar);
    fixture.componentRef.setInput('hostelId', 'h1');
    fixture.componentRef.setInput('roomId', ROOM);
    fixture.componentRef.setInput('capacity', 8);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as {
      month(): Date;
      step(by: number): void;
    };
  }

  /** `[year, monthIndex]`, which is what the assertions are actually about. */
  const ym = (d: Date): [number, number] => [d.getFullYear(), d.getMonth()];

  it('advances one month when the clock crosses midnight into a new month', () => {
    clockAt(2026, 7, 31, 23, 59); // 31 August 2026, a minute to midnight
    const c = mount();
    expect(ym(c.month())).toEqual([2026, 7]); // August

    vi.setSystemTime(new Date(2026, 8, 1, 0, 1)); // the host comes back after midnight
    c.step(1);

    // September. Re-reading the clock here gave October and put September out of reach.
    expect(ym(c.month())).toEqual([2026, 8]);
  });

  it('goes back one month across the same boundary', () => {
    clockAt(2026, 7, 31, 23, 59);
    const c = mount();

    vi.setSystemTime(new Date(2026, 8, 1, 0, 1));
    c.step(-1);

    expect(ym(c.month())).toEqual([2026, 6]); // July
  });

  it('returns to the month it opened on after a step out and back', () => {
    clockAt(2026, 7, 31, 23, 59);
    const c = mount();

    vi.setSystemTime(new Date(2026, 8, 1, 0, 1));
    c.step(1);
    c.step(-1);

    expect(ym(c.month())).toEqual([2026, 7]);
  });

  /** The ordinary case, so the fix is not just "pinned to whatever the first read was". */
  it('still steps a month at a time well away from a boundary', () => {
    clockAt(2026, 2, 15, 12, 0); // 15 March 2026
    const c = mount();
    expect(ym(c.month())).toEqual([2026, 2]);

    c.step(1);
    expect(ym(c.month())).toEqual([2026, 3]);
    c.step(10);
    expect(ym(c.month())).toEqual([2027, 1]); // wraps the year
  });
});
