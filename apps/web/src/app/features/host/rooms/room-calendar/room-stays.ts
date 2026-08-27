import { HostBooking } from '@features/host/bookings/host-bookings-api';

/**
 * A stay as the room calendar needs it: who, which nights, and how many of the room's beds.
 *
 * The calendar used to read the seeker side's `ApiBooking` — a shape built for the booking
 * basket, carrying holds, prices and per-room `lines` — because that is what the fixture it
 * was fed by happened to return. Almost none of it was used. This is the four fields the
 * pips and the roster actually read, so the two screens can no longer drift into each other.
 */
export interface RoomStay {
  id: string;
  guest: { name: string };
  /** `yyyy-MM-dd`, the first night. */
  check_in: string;
  /**
   * `yyyy-MM-dd`, **exclusive** — the morning they leave.
   *
   * A guest checking out on the 5th does not occupy the 5th, so the pip stops on the 4th.
   * Treating it as inclusive would show every room as one night fuller than it is and, worse,
   * would show a clash on the day one guest leaves and the next arrives.
   */
  check_out: string;
  status: string;
  /** Beds this stay holds in this room. One, for a room sold whole. */
  beds: number;
  /**
   * No end date is known — a tenant living here, not a stay that was booked to finish.
   *
   * `check_out` still carries a date because everything downstream counts nights between two
   * of them, but for an open stay that date is the end of the window being drawn, not a
   * departure. Anything that would *tell a host* somebody is leaving has to check this first.
   */
  open?: boolean;
}

/**
 * A day of the month, with how much of the room is sold on it.
 *
 * `booked` and `booking_ids` deliberately disagree on the check-out day: the bed is free that
 * night, so it is not counted, but the guest is still *there* that morning and the roster has
 * to be able to say "leaving today". Counting the departure as occupancy overstates the room
 * by a night; leaving it out of the list loses the departure entirely.
 */
export interface RoomDay {
  date: string;
  /** Beds occupied **overnight**. A stay checking out today has released its bed. */
  booked: number;
  capacity: number;
  /** Stays touching this date, check-out day included — the roster and the hover card. */
  booking_ids: string[];
}

/**
 * A cancelled stay holds no beds.
 *
 * Everything else does, including one already checked out: it occupied those nights, and a
 * month a host is looking back at should say so. Only cancellation un-books a night.
 */
function holdsBeds(b: HostBooking): boolean {
  return b.disposition.slug !== 'cancelled';
}

/**
 * Somebody the host put in this room directly, rather than through a booking.
 *
 * Structurally what `RoomRenter` already is, declared here rather than imported so the
 * calendar keeps depending on a shape instead of on the services layer.
 */
export interface RoomResident {
  id: string;
  name: string;
  /** When they moved in. A date or a full timestamp; only the day is read. */
  moveIn: string;
  status: string;
}

/** The day after `date`, as `yyyy-MM-dd`. Parsed locally — see {@link eachDate}. */
function dayAfter(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

/**
 * A resident as a stay the calendar can draw.
 *
 * They have a move-in and no move-out, so the stay is closed off at the end of the window
 * being rendered: they occupy every night of it from the day they arrived. Extending only to
 * the window keeps the arithmetic honest — nothing here is claiming to know when they leave,
 * and `open` is what says so to anything that would otherwise render a departure.
 *
 * One bed each, in a dorm or a private room alike. A booking holds beds for a party; a
 * resident is one person, which is the whole reason they are counted separately.
 */
function residentStay(r: RoomResident, windowEnd: string): RoomStay {
  return {
    id: `renter:${r.id}`,
    guest: { name: r.name },
    check_in: r.moveIn.slice(0, 10),
    check_out: dayAfter(windowEnd),
    status: r.status,
    beds: 1,
    open: true,
  };
}

/**
 * @param capacity beds in the room, which decides what a booking *holds*.
 *
 * A dorm is sold by the bed, so a party of two holds two of them — reading the room's whole
 * capacity would black it out for a booking that half fills it. A room sold whole is one
 * unit however many people sleep in it: four guests in a single room is one room taken, not
 * a room four times oversold.
 */
export function toRoomStay(b: HostBooking, capacity: number): RoomStay {
  return {
    id: b.id,
    // The renter when the booking names one, the booker otherwise. They are usually
    // different people here -- one account books beds for others -- and the roster is asking
    // who is *in the room*, not who paid for it.
    guest: { name: b.renter?.name || b.guest.name },
    check_in: b.checkIn,
    check_out: b.checkOut,
    status: b.disposition.slug,
    // Floored at one so a stay the server sent without a guest count still draws a pip
    // rather than silently occupying nothing.
    beds: capacity <= 1 ? 1 : Math.max(1, b.guests || 0),
  };
}

/**
 * The month laid out day by day, from the stays that touch it.
 *
 * Derived here rather than asked of the server because the endpoint answers with bookings,
 * not with occupancy — there is no per-day aggregation for a single room. The arithmetic is
 * small and the inputs are exact, so the only thing that could drift is the check-out rule,
 * which is why it has a name and a test rather than living inline.
 *
 * `booked` is allowed to exceed `capacity`. An oversold day is a real state — the calendar
 * has a hatched pattern for it — and clamping would hide precisely the day a host must act on.
 */
export function buildRoomDays(
  stays: readonly RoomStay[],
  capacity: number,
  from: string,
  to: string,
): RoomDay[] {
  const days: RoomDay[] = [];
  for (const date of eachDate(from, to)) {
    // Two windows, and the difference is the check-out day — see {@link RoomDay}.
    const overnight = stays.filter((s) => date >= s.check_in && date < s.check_out);
    const present = stays.filter((s) => date >= s.check_in && date <= s.check_out);
    days.push({
      date,
      booked: overnight.reduce((n, s) => n + s.beds, 0),
      capacity,
      booking_ids: present.map((s) => s.id),
    });
  }
  return days;
}

/** Every `yyyy-MM-dd` from `from` to `to`, both ends included. */
function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  // Parsed as local midnight, not through `new Date('2026-08-01')`, which is UTC and lands on
  // the previous day for anybody west of Greenwich.
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const end = new Date(ty, tm - 1, td);
  for (const d = new Date(fy, fm - 1, fd); d <= end; d.setDate(d.getDate() + 1)) {
    const pad = (n: number) => String(n).padStart(2, '0');
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
}

/** The two together: what the calendar binds to for one room and one month. */
export function toRoomMonth(
  bookings: readonly HostBooking[],
  capacity: number,
  from: string,
  to: string,
  residents: readonly RoomResident[] = [],
): { days: RoomDay[]; stays: RoomStay[] } {
  const stays = [
    ...bookings.filter(holdsBeds).map((b) => toRoomStay(b, capacity)),
    // Residents were missing from this month entirely: the calendar reads the bookings
    // endpoint, and a tenant placed by hand never becomes a booking. The room showed empty
    // on nights somebody was asleep in it, and the pips under-counted by exactly them.
    //
    // Only the ones still here, and only from the day they arrived. Somebody who has already
    // left has no record of when — `renter.room_id` is nulled on the way out — so a past
    // residency cannot be drawn at all until the occupancy ledger has been running.
    ...residents
      .filter((r) => !!r.moveIn && r.moveIn.slice(0, 10) <= to)
      .map((r) => residentStay(r, to)),
  ];
  return { days: buildRoomDays(stays, capacity, from, to), stays };
}
