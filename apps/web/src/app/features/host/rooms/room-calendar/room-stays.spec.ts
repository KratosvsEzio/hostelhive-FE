import { HostBooking } from '@features/host/bookings/host-bookings-api';
import { toRoomMonth } from './room-stays';

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
    deposit: 0,
    paid: 0,
    balanceDue: 0,
    roomType: { name: 'Dorm', occupancyType: 'shared', capacity: 8, price: 0 },
    status: { slug: 'paid', name: 'Paid' },
    disposition: { slug: 'checked-in', name: 'Checked in' },
    ...over,
  } as HostBooking;
}

const AUG = { from: '2026-08-01', to: '2026-08-31' };

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
    const { days } = toRoomMonth([booking()], 8, AUG.from, AUG.to);

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
    const { days } = toRoomMonth([booking()], 8, AUG.from, AUG.to);

    expect(day(days, '2026-08-13')?.booking_ids).toEqual(['b1']);
    expect(day(days, '2026-08-14')?.booking_ids).toEqual([]);
  });

  it('counts a party as the beds it holds, not as one booking', () => {
    const { days } = toRoomMonth([booking({ guests: 3 })], 8, AUG.from, AUG.to);

    expect(day(days, '2026-08-10')?.booked).toBe(3);
  });

  /**
   * The same party in a room sold whole is one unit, not four.
   *
   * Reading guests here made a single room look four times oversold the moment a family
   * booked it — hatched red across every night of their stay, for a room that is simply taken.
   */
  it('counts a whole-room booking as one, however many guests', () => {
    const { days } = toRoomMonth([booking({ guests: 4 })], 1, AUG.from, AUG.to);

    expect(day(days, '2026-08-10')?.booked).toBe(1);
  });

  // Two separate stays in a one-unit room is a real clash, and must still read as one.
  it('still oversells a private room held by two bookings at once', () => {
    const a = booking({ id: 'a', guests: 2 });
    const b = booking({ id: 'b', guests: 3, checkIn: '2026-08-11', checkOut: '2026-08-14' });
    const { days } = toRoomMonth([a, b], 1, AUG.from, AUG.to);

    expect(day(days, '2026-08-11')?.booked).toBe(2);
  });

  // A stay the server sent without a guest count is still somebody in a bed.
  it('never counts a stay as zero beds', () => {
    const { days } = toRoomMonth([booking({ guests: 0 })], 8, AUG.from, AUG.to);

    expect(day(days, '2026-08-10')?.booked).toBe(1);
  });

  it('gives a cancelled stay no beds and no roster line', () => {
    const cancelled = booking({ disposition: { slug: 'cancelled', name: 'Cancelled' } });
    const { days, stays } = toRoomMonth([cancelled], 8, AUG.from, AUG.to);

    expect(day(days, '2026-08-10')?.booked).toBe(0);
    expect(day(days, '2026-08-10')?.booking_ids).toEqual([]);
    expect(stays).toEqual([]);
  });

  // Checked-out is not cancelled: those nights were sold and the month should say so.
  it('keeps a completed stay on the days it occupied', () => {
    const done = booking({ disposition: { slug: 'checked-out', name: 'Checked out' } });
    const { days } = toRoomMonth([done], 8, AUG.from, AUG.to);

    expect(day(days, '2026-08-10')?.booked).toBe(1);
  });

  /**
   * The reason the endpoint is asked for overlaps rather than arrivals: a guest who checked in
   * last month is the one a host most needs to see at the top of this one.
   */
  it('fills the start of the month for a stay that began before it', () => {
    const early = booking({ checkIn: '2026-07-28', checkOut: '2026-08-03' });
    const { days } = toRoomMonth([early], 8, AUG.from, AUG.to);

    expect(day(days, '2026-08-01')?.booked).toBe(1);
    expect(day(days, '2026-08-02')?.booked).toBe(1);
    expect(day(days, '2026-08-03')?.booked).toBe(0); // leaves that morning
  });

  it('runs a stay to the end of the month when it finishes after it', () => {
    const late = booking({ checkIn: '2026-08-29', checkOut: '2026-09-04' });
    const { days } = toRoomMonth([late], 8, AUG.from, AUG.to);

    expect(day(days, '2026-08-31')?.booked).toBe(1);
  });

  // An oversell is a state a host has to act on. Clamping it to "full" hides the clash.
  it('lets a day be oversold rather than capping it at capacity', () => {
    const { days } = toRoomMonth([booking({ guests: 5 })], 2, AUG.from, AUG.to);

    expect(day(days, '2026-08-10')?.booked).toBe(5);
    expect(day(days, '2026-08-10')?.capacity).toBe(2);
  });

  it('covers every day of the month, empty or not', () => {
    const { days } = toRoomMonth([], 4, AUG.from, AUG.to);

    expect(days).toHaveLength(31);
    expect(days.every((d) => d.booked === 0 && d.capacity === 4)).toBe(true);
  });
});
