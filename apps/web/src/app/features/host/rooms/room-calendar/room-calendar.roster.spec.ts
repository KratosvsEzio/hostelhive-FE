import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { LocaleStore } from '@core/i18n/locale-store';
import { HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { RoomCalendar } from './room-calendar';
import { RoomResident } from './room-stays';

interface RosterRow {
  name: string;
  range: string;
  units: number;
  arriving: boolean;
  leaving: boolean;
}

/** The component's own signals, which are `protected` to templates but present at runtime. */
function internals(fixture: ComponentFixture<RoomCalendar>) {
  return fixture.componentInstance as unknown as {
    roster: () => RosterRow[];
    picked: { set: (d: string) => void };
    state: () => { days: { date: string }[] };
  };
}

function mount(residents: RoomResident[]): ComponentFixture<RoomCalendar> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RoomCalendar],
    providers: [
      provideI18nTesting(),
      { provide: HostBookingsApi, useValue: { bookingsInRoom: () => of([]) } },
    ],
  });
  const fixture = TestBed.createComponent(RoomCalendar);
  fixture.componentRef.setInput('hostelId', 'h1');
  fixture.componentRef.setInput('roomId', 'r1');
  fixture.componentRef.setInput('capacity', 4);
  fixture.componentRef.setInput('residents', residents);
  fixture.detectChanges();
  return fixture;
}

/**
 * The roster row for somebody who lives here.
 *
 * A resident has a move-in and no move-out, so the stay is closed off at the edge of whatever
 * month is on screen. That is an implementation detail the panel must never leak: printed as a
 * range it would tell a host their tenant leaves on the last of the month, and the "departure"
 * would move every time they paged forward. Neither is a thing a test author would think to
 * check by hand, which is why it is checked here.
 *
 * The day is picked from the component's own rendered month rather than a literal, so these
 * do not start failing when the month turns.
 */
describe('RoomCalendar roster — residents', () => {
  function rosterOnLastDay(residents: RoomResident[]): RosterRow[] {
    const fixture = mount(residents);
    const vm = internals(fixture);
    const days = vm.state().days;
    vm.picked.set(days[days.length - 1].date);
    fixture.detectChanges();
    return vm.roster();
  }

  const LONG_AGO: RoomResident = {
    id: 'r1',
    name: 'Bilal Ahmed',
    moveIn: '2020-01-01',
    status: 'active',
  };

  it('lists a resident the bookings endpoint knows nothing about', () => {
    const rows = rosterOnLastDay([LONG_AGO]);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Bilal Ahmed');
  });

  it('says when they arrived rather than inventing a departure', () => {
    const [row] = rosterOnLastDay([LONG_AGO]);

    expect(row.range).toMatch(/^since /);
    expect(row.range).not.toContain('–');
  });

  // The "out" chip is the panel telling a host somebody leaves today. Nothing knows that here.
  it('never marks them as leaving, even on the last day of the month', () => {
    const [row] = rosterOnLastDay([LONG_AGO]);

    expect(row.leaving).toBe(false);
  });

  it('counts one bed each', () => {
    const [row] = rosterOnLastDay([LONG_AGO]);

    expect(row.units).toBe(1);
  });
});

/**
 * The dates printed beside a guest are the booked days, whatever zone the device is in.
 *
 * A plain `yyyy-MM-dd` read as UTC prints the day before for anybody west of Greenwich, so the
 * expected text is built from local-midnight dates and the clock is pinned mid-month, where the
 * grid and the booking agree on the month.
 */
describe('RoomCalendar roster — printed range', () => {
  afterEach(() => vi.useRealTimers());

  function rosterOn(day: string, bookings: unknown[], residents: RoomResident[] = []) {
    if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RoomCalendar],
      providers: [
        provideI18nTesting(),
        { provide: HostBookingsApi, useValue: { bookingsInRoom: () => of(bookings) } },
      ],
    });
    const fixture = TestBed.createComponent(RoomCalendar);
    fixture.componentRef.setInput('hostelId', 'h1');
    fixture.componentRef.setInput('roomId', 'r1');
    fixture.componentRef.setInput('capacity', 4);
    fixture.componentRef.setInput('residents', residents);
    fixture.detectChanges();
    const vm = internals(fixture);
    vm.picked.set(day);
    fixture.detectChanges();
    const locale = TestBed.inject(LocaleStore).active();
    const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
    return { rows: vm.roster(), print: (y: number, m: number, d: number) => fmt.format(new Date(y, m, d)) };
  }

  const stay = {
    id: 'b1',
    ref: 'HH-1',
    guest: { name: 'Ayesha', phone: '', email: '' },
    checkIn: '2026-03-10',
    checkOut: '2026-03-12',
    nights: 2,
    guests: 1,
    total: 0,
    paid: 0,
    balanceDue: 0,
    roomType: { name: 'Dorm', occupancyType: 'shared', capacity: 4, price: 0 },
    status: { slug: 'paid', name: 'Paid' },
    disposition: { slug: 'checked-in', name: 'Checked in' },
  };

  it('prints a booking’s own first and last day', () => {
    const { rows, print } = rosterOn('2026-03-10', [stay]);

    expect(rows).toHaveLength(1);
    expect(rows[0].range).toBe(`${print(2026, 2, 10)} – ${print(2026, 2, 12)}`);
  });

  it('prints the day a resident moved in', () => {
    const { rows, print } = rosterOn('2026-03-10', [], [
      { id: 'r1', name: 'Bilal Ahmed', moveIn: '2026-03-10', status: 'active' },
    ]);

    expect(rows[0].range).toBe(`since ${print(2026, 2, 10)}`);
  });
});
