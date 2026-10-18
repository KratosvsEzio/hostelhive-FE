import { BookingOccupancy, HostBooking } from '@features/host/bookings/host-bookings-api';
import { RoomResident, toRoomMonth, toRoomStay } from './room-stays';

function booking(over: Partial<HostBooking> = {}): HostBooking {
  return {
    id: 'b1',
    ref: 'HH-1',
    guest: { name: 'Ayesha', phone: '', email: '' },
    checkIn: '2026-08-10',
    checkOut: '2026-08-13',
    nights: 3,
    guests: 1,
    total: 0,
    paid: 0,
    balanceDue: 0,
    roomType: { name: 'Dorm', occupancyType: 'shared', capacity: 8, price: 0 },
    status: { slug: 'paid', name: 'Paid' },
    disposition: { slug: 'checked-in', name: 'Checked in' },
    ...over,
  } as HostBooking;
}

const AUG = { from: '2026-08-01', to: '2026-08-31' };

/**
 * The hostel's date every case is read against, unless it says otherwise: after the month
 * being drawn, so a checked-out stay in it is history rather than cut short.
 */
const TODAY = '2026-09-15';

function day(days: ReturnType<typeof toRoomMonth>['days'], date: string) {
  return days.find((d) => d.date === date);
}

/**
 * The occupancy the calendar draws is worked out here rather than fetched, because the
 * bookings endpoint answers with stays. That makes this the one place a whole month can go
 * quietly wrong — a night counted twice, a departure lost, a cancelled stay still holding a
 * bed — none of which announces itself on screen.
 */
describe('toRoomMonth', () => {
  it('occupies the nights of the stay, and not the morning it ends', () => {
    const { days } = toRoomMonth([booking()], 8, AUG.from, AUG.to, { today: TODAY });

    expect(day(days, '2026-08-09')?.booked).toBe(0);
    expect(day(days, '2026-08-10')?.booked).toBe(1);
    expect(day(days, '2026-08-12')?.booked).toBe(1);
    // Check-out day: the bed is back on sale that night.
    expect(day(days, '2026-08-13')?.booked).toBe(0);
  });

  /**
   * The check-out day is the one date where "how full is the room" and "who is here" differ,
   * and the roster needs the second. Fold them together and either the room reads a night
   * fuller than it is, or the departure disappears from the day it happens on.
   */
  it('still lists a departing guest on the day they leave', () => {
    const { days } = toRoomMonth([booking()], 8, AUG.from, AUG.to, { today: TODAY });

    expect(day(days, '2026-08-13')?.booking_ids).toEqual(['b1']);
    expect(day(days, '2026-08-14')?.booking_ids).toEqual([]);
  });

  it('counts a party as the beds it holds, not as one booking', () => {
    const { days } = toRoomMonth([booking({ guests: 3 })], 8, AUG.from, AUG.to, { today: TODAY });

    expect(day(days, '2026-08-10')?.booked).toBe(3);
  });

  /**
   * The same party in a room sold whole is one unit, not four.
   *
   * Reading guests here made a single room look four times oversold the moment a family
   * booked it — hatched red across every night of their stay, for a room that is simply taken.
   */
  it('counts a whole-room booking as one, however many guests', () => {
    const { days } = toRoomMonth([booking({ guests: 4 })], 1, AUG.from, AUG.to, { today: TODAY });

    expect(day(days, '2026-08-10')?.booked).toBe(1);
  });

  // Two separate stays in a one-unit room is a real clash, and must still read as one.
  it('still oversells a private room held by two bookings at once', () => {
    const a = booking({ id: 'a', guests: 2 });
    const b = booking({ id: 'b', guests: 3, checkIn: '2026-08-11', checkOut: '2026-08-14' });
    const { days } = toRoomMonth([a, b], 1, AUG.from, AUG.to, { today: TODAY });

    expect(day(days, '2026-08-11')?.booked).toBe(2);
  });

  // A stay the server sent without a guest count is still somebody in a bed.
  it('never counts a stay as zero beds', () => {
    const { days } = toRoomMonth([booking({ guests: 0 })], 8, AUG.from, AUG.to, { today: TODAY });

    expect(day(days, '2026-08-10')?.booked).toBe(1);
  });

  it('gives a cancelled stay no beds and no roster line', () => {
    const cancelled = booking({ disposition: { slug: 'cancelled', name: 'Cancelled' } });
    const { days, stays } = toRoomMonth([cancelled], 8, AUG.from, AUG.to, { today: TODAY });

    expect(day(days, '2026-08-10')?.booked).toBe(0);
    expect(day(days, '2026-08-10')?.booking_ids).toEqual([]);
    expect(stays).toEqual([]);
  });

  // Checked-out is not cancelled: those nights were sold and the month should say so.
  it('keeps a completed stay on the days it occupied', () => {
    const done = booking({ disposition: { slug: 'checked-out', name: 'Checked out' } });
    const { days } = toRoomMonth([done], 8, AUG.from, AUG.to, { today: TODAY });

    expect(day(days, '2026-08-10')?.booked).toBe(1);
  });

  /**
   * The reason the endpoint is asked for overlaps rather than arrivals: a guest who checked in
   * last month is the one a host most needs to see at the top of this one.
   */
  it('fills the start of the month for a stay that began before it', () => {
    const early = booking({ checkIn: '2026-07-28', checkOut: '2026-08-03' });
    const { days } = toRoomMonth([early], 8, AUG.from, AUG.to, { today: TODAY });

    expect(day(days, '2026-08-01')?.booked).toBe(1);
    expect(day(days, '2026-08-02')?.booked).toBe(1);
    expect(day(days, '2026-08-03')?.booked).toBe(0); // leaves that morning
  });

  it('runs a stay to the end of the month when it finishes after it', () => {
    const late = booking({ checkIn: '2026-08-29', checkOut: '2026-09-04' });
    const { days } = toRoomMonth([late], 8, AUG.from, AUG.to, { today: TODAY });

    expect(day(days, '2026-08-31')?.booked).toBe(1);
  });

  // An oversell is a state a host has to act on. Clamping it to "full" hides the clash.
  it('lets a day be oversold rather than capping it at capacity', () => {
    const { days } = toRoomMonth([booking({ guests: 5 })], 2, AUG.from, AUG.to, { today: TODAY });

    expect(day(days, '2026-08-10')?.booked).toBe(5);
    expect(day(days, '2026-08-10')?.capacity).toBe(2);
  });

  it('covers every day of the month, empty or not', () => {
    const { days } = toRoomMonth([], 4, AUG.from, AUG.to, { today: TODAY });

    expect(days).toHaveLength(31);
    expect(days.every((d) => d.booked === 0 && d.capacity === 4)).toBe(true);
  });
});

function resident(over: Partial<RoomResident> = {}): RoomResident {
  return { id: 'r1', name: 'Bilal', moveIn: '2026-08-10', status: 'active', ...over };
}

/**
 * Tenants the host placed by hand, which the bookings endpoint knows nothing about.
 *
 * The failure this guards is quiet in the worst way: the room simply reads emptier than it
 * is. Nothing errors, no row is missing from a list — the pips are just short by however many
 * people live there, and a host sizing up free beds believes them.
 */
describe('toRoomMonth — residents', () => {
  const day = (r: ReturnType<typeof toRoomMonth>, d: string) =>
    r.days.find((x) => x.date === d)!;

  it('holds a bed from the day they moved in', () => {
    const m = toRoomMonth([], 4, AUG.from, AUG.to, { today: TODAY, residents: [resident()] });

    expect(day(m, '2026-08-09').booked).toBe(0);
    expect(day(m, '2026-08-10').booked).toBe(1);
  });

  // No move-out exists, so they occupy every remaining night — including the last of the month.
  it('does not stop before the end of the window', () => {
    const m = toRoomMonth([], 4, AUG.from, AUG.to, { today: TODAY, residents: [resident()] });

    expect(day(m, '2026-08-31').booked).toBe(1);
  });

  // Moved in months ago: the whole window is theirs, not just from the 1st onwards by luck.
  it('covers a window that starts after they arrived', () => {
    const m = toRoomMonth([], 4, AUG.from, AUG.to, { today: TODAY, residents: [resident({ moveIn: '2026-03-02' })] });

    expect(day(m, '2026-08-01').booked).toBe(1);
    expect(day(m, '2026-08-31').booked).toBe(1);
  });

  it('ignores somebody who has not moved in yet', () => {
    const m = toRoomMonth([], 4, AUG.from, AUG.to, { today: TODAY, residents: [resident({ moveIn: '2026-09-04' })] });

    expect(m.stays).toHaveLength(0);
  });

  it('ignores a record with no move-in date at all', () => {
    const m = toRoomMonth([], 4, AUG.from, AUG.to, { today: TODAY, residents: [resident({ moveIn: '' })] });

    expect(m.stays).toHaveLength(0);
  });

  // One person is one bed, in a dorm or a private room. A booking holds beds for a party;
  // this is why the two are counted separately rather than run through the same mapping.
  it('counts one bed each, however big the room', () => {
    const m = toRoomMonth([], 8, AUG.from, AUG.to, {
      today: TODAY,
      residents: [
        resident({ id: 'a', moveIn: '2026-08-01' }),
        resident({ id: 'b', moveIn: '2026-08-01' }),
      ],
    });

    expect(day(m, '2026-08-05').booked).toBe(2);
  });

  it('adds to the beds bookings already hold, rather than replacing them', () => {
    const withBooking = toRoomMonth(
      [booking({ checkIn: '2026-08-01', checkOut: '2026-08-20', guests: 2 })],
      6, AUG.from, AUG.to,
      { today: TODAY, residents: [resident({ moveIn: '2026-08-01' })] },
    );

    expect(day(withBooking, '2026-08-05').booked).toBe(3);
  });

  // `open` is the only thing standing between a resident and a UI that announces a departure.
  it('marks the stay open and accepts a timestamp move-in', () => {
    const m = toRoomMonth([], 4, AUG.from, AUG.to, {
      today: TODAY,
      residents: [resident({ moveIn: '2026-08-10T14:30:00+05:00' })],
    });

    expect(m.stays[0].open).toBe(true);
    expect(m.stays[0].check_in).toBe('2026-08-10');
    expect(day(m, '2026-08-10').booked).toBe(1);
  });
});

function occupancy(roomId: string, guests: number, active = true): BookingOccupancy {
  return { id: `o-${roomId}`, roomId, roomNumber: roomId, guests, active };
}

/**
 * A party checked into more than one room.
 *
 * The whole party used to be charged to every room that drew the booking, so a 3-guest
 * booking split 2 + 1 read 101 as three beds full and left 102 looking empty. Once rooms are
 * allocated, the occupancies are the truth: each room carries only the guests placed in it.
 */
describe('toRoomMonth — occupancies', () => {
  const split = (over: Partial<HostBooking> = {}) =>
    booking({
      guests: 3,
      occupancies: [occupancy('101', 2), occupancy('102', 1)],
      ...over,
    });
  const booked = (r: ReturnType<typeof toRoomMonth>, d = '2026-08-10') => day(r.days, d)?.booked;

  it('charges each room only the guests placed in it', () => {
    const in101 = toRoomMonth([split()], 3, AUG.from, AUG.to, { today: TODAY, roomId: '101' });
    const in102 = toRoomMonth([split()], 3, AUG.from, AUG.to, { today: TODAY, roomId: '102' });

    expect(booked(in101)).toBe(2);
    expect(booked(in102)).toBe(1);
    expect(in102.stays.map((s) => s.beds)).toEqual([1]);
  });

  it('does not draw a checked-in booking on a room its party is not in', () => {
    const m = toRoomMonth([split()], 3, AUG.from, AUG.to, { today: TODAY, roomId: '103' });

    expect(m.stays).toEqual([]);
    expect(booked(m)).toBe(0);
  });

  // Released early: the beds are back on sale, so a live stay no longer holds them.
  it('frees a room whose occupancy was released while the booking is checked in', () => {
    const released = split({ occupancies: [occupancy('101', 2, false), occupancy('102', 1)] });
    const in101 = toRoomMonth([released], 3, AUG.from, AUG.to, { today: TODAY, roomId: '101' });
    const in102 = toRoomMonth([released], 3, AUG.from, AUG.to, { today: TODAY, roomId: '102' });

    expect(in101.stays).toEqual([]);
    expect(booked(in101)).toBe(0);
    expect(booked(in102)).toBe(1);
  });

  // Check-out makes every occupancy inactive; the month looking back still has to show them.
  it('keeps every occupancy of a checked-out booking as history', () => {
    const done = split({
      disposition: { slug: 'checked-out', name: 'Checked out' },
      occupancies: [occupancy('101', 2, false), occupancy('102', 1, false)],
    });

    expect(booked(toRoomMonth([done], 3, AUG.from, AUG.to, { today: TODAY, roomId: '101' }))).toBe(2);
    expect(booked(toRoomMonth([done], 3, AUG.from, AUG.to, { today: TODAY, roomId: '102' }))).toBe(1);
  });

  it('sums two occupancies of one booking in the same room', () => {
    const twice = split({ occupancies: [occupancy('101', 2), { ...occupancy('101', 1), id: 'o-2' }] });

    expect(booked(toRoomMonth([twice], 4, AUG.from, AUG.to, { today: TODAY, roomId: '101' }))).toBe(3);
  });

  it('counts a room sold whole as one unit, but only where the party is', () => {
    const inRoom = toRoomMonth([split()], 1, AUG.from, AUG.to, { today: TODAY, roomId: '101' });
    const elsewhere = toRoomMonth([split()], 1, AUG.from, AUG.to, { today: TODAY, roomId: '103' });

    expect(booked(inRoom)).toBe(1);
    expect(elsewhere.stays).toEqual([]);
  });

  // Never checked in: no rooms are allocated yet, so the party is what the booking holds.
  it('leaves a booking without occupancies exactly as before', () => {
    const pending = booking({
      guests: 3,
      occupancies: [],
      disposition: { slug: 'pending', name: 'Pending' },
    });

    expect(booked(toRoomMonth([pending], 8, AUG.from, AUG.to, { today: TODAY, roomId: '101' }))).toBe(3);
    expect(booked(toRoomMonth([pending], 1, AUG.from, AUG.to, { today: TODAY, roomId: '101' }))).toBe(1);
  });
});

/**
 * A stay checked out before the nights it booked have run.
 *
 * Its guests have gone, so tonight and every night after are back on sale; the nights before
 * today were slept in and stay on the month as history. Charging every booked night read a
 * three-bed room as four beds full the evening its first party left.
 */
describe('toRoomMonth — checked out early', () => {
  const TODAY = '2026-08-11';
  const left = (over: Partial<HostBooking> = {}) =>
    booking({
      guests: 2,
      disposition: { slug: 'checked-out', name: 'Checked out' },
      occupancies: [occupancy('101', 2, false)],
      ...over,
    });
  const booked = (r: ReturnType<typeof toRoomMonth>, d: string) => day(r.days, d)?.booked;

  it('frees tonight and later, but still counts last night', () => {
    const m = toRoomMonth([left()], 3, AUG.from, AUG.to, { today: TODAY, roomId: '101' });

    expect(booked(m, '2026-08-10')).toBe(2);
    expect(booked(m, '2026-08-11')).toBe(0);
    expect(booked(m, '2026-08-12')).toBe(0);
  });

  // They were still there this morning, so the roster says they left today, and not after.
  it('lists them as leaving today rather than on the booked date', () => {
    const m = toRoomMonth([left()], 3, AUG.from, AUG.to, { today: TODAY, roomId: '101' });

    expect(day(m.days, '2026-08-11')?.booking_ids).toEqual(['b1']);
    expect(day(m.days, '2026-08-12')?.booking_ids).toEqual([]);
    expect(m.stays[0].check_out).toBe(TODAY);
  });

  it('holds no night at all when it left the morning of its first one', () => {
    const m = toRoomMonth([left({ checkIn: TODAY })], 3, AUG.from, AUG.to, { today: TODAY, roomId: '101' });

    expect(booked(m, TODAY)).toBe(0);
    expect(booked(m, '2026-08-12')).toBe(0);
  });

  // The room that read "4 of 3 beds · over 1": the party that left and the party asleep.
  it('charges only the party still in the room tonight', () => {
    const asleep = booking({
      id: 'b2',
      guests: 2,
      checkIn: TODAY,
      occupancies: [occupancy('101', 2)],
    });
    const m = toRoomMonth([left({ checkIn: TODAY }), asleep], 3, AUG.from, AUG.to, { today: TODAY, roomId: '101' });

    expect(booked(m, TODAY)).toBe(2);
  });

  it('leaves a stay that ended as booked exactly as it was', () => {
    const m = toRoomMonth([left({ checkOut: '2026-08-11' })], 3, AUG.from, AUG.to, { today: '2026-08-20', roomId: '101' });

    expect(booked(m, '2026-08-10')).toBe(2);
    expect(m.stays[0].check_out).toBe('2026-08-11');
  });

  it('does not touch a stay that has not checked out', () => {
    for (const slug of ['pending', 'confirmed', 'checked-in']) {
      const live = booking({
        guests: 2,
        disposition: { slug, name: slug },
        occupancies: slug === 'checked-in' ? [occupancy('101', 2)] : [],
      });
      const m = toRoomMonth([live], 3, AUG.from, AUG.to, { today: TODAY, roomId: '101' });

      expect({ slug, tonight: booked(m, '2026-08-12') }).toEqual({ slug, tonight: 2 });
    }
  });
});

/**
 * Where the cut-off falls depends only on the `today` handed in, never on a clock.
 *
 * The same stay read against two hostel dates a day apart is the case that matters: a hostel
 * whose date is ahead of the host's device frees tonight's beds a day sooner.
 */
describe('toRoomMonth — the hostel date moves the cut-off', () => {
  const left = () =>
    booking({
      guests: 2,
      checkIn: '2026-08-10',
      checkOut: '2026-08-13',
      disposition: { slug: 'checked-out', name: 'Checked out' },
    });
  const booked = (r: ReturnType<typeof toRoomMonth>, d: string) => day(r.days, d)?.booked;

  it.each([
    { today: '2026-08-12', lastNight: '2026-08-11', freed: '2026-08-12' },
    { today: '2026-08-13', lastNight: '2026-08-12', freed: '2026-08-13' },
  ])('holds nights before $today and frees it', ({ today, lastNight, freed }) => {
    const m = toRoomMonth([left()], 4, AUG.from, AUG.to, { today });

    expect(booked(m, lastNight)).toBe(2);
    expect(booked(m, freed)).toBe(0);
  });

  it('ends the stay on the date passed in', () => {
    const early = toRoomMonth([left()], 4, AUG.from, AUG.to, { today: '2026-08-12' });
    const late = toRoomMonth([left()], 4, AUG.from, AUG.to, { today: '2026-08-13' });

    expect(early.stays[0].check_out).toBe('2026-08-12');
    expect(late.stays[0].check_out).toBe('2026-08-13');
  });

  // Booked but never arrived, then marked checked out: no run ends before it starts.
  it('holds zero nights, never a negative run, for a stay that starts after today', () => {
    const notYet = booking({
      checkIn: '2026-08-20',
      checkOut: '2026-08-25',
      disposition: { slug: 'checked-out', name: 'Checked out' },
    });
    const m = toRoomMonth([notYet], 4, AUG.from, AUG.to, { today: '2026-08-12' });

    expect(m.stays[0].check_out).toBe('2026-08-20');
    expect(m.days.every((d) => d.booked === 0)).toBe(true);
  });
});

describe('toRoomStay — options object', () => {
  it('shortens a checked-out stay to the date passed in', () => {
    const done = booking({ disposition: { slug: 'checked-out', name: 'Checked out' } });

    expect(toRoomStay(done, 8, { today: '2026-08-11' })?.check_out).toBe('2026-08-11');
    expect(toRoomStay(done, 8, { today: '2026-09-15' })?.check_out).toBe('2026-08-13');
  });

  it('leaves a stay that has not checked out as booked, whatever the date', () => {
    expect(toRoomStay(booking(), 8, { today: '2026-08-11' })?.check_out).toBe('2026-08-13');
  });

  it('scopes the party to the room named in the options', () => {
    const split = booking({
      guests: 3,
      occupancies: [occupancy('101', 2), occupancy('102', 1)],
    });

    expect(toRoomStay(split, 4, { today: TODAY, roomId: '101' })?.beds).toBe(2);
    expect(toRoomStay(split, 4, { today: TODAY, roomId: '103' })).toBeNull();
  });
});
