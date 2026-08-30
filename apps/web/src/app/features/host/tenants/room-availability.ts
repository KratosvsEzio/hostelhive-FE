import { RoomDay } from '@features/host/rooms/room-calendar/room-stays';

/**
 * How far ahead an open-ended tenancy is checked.
 *
 * A tenant placed with no leave date has no end to check against, and "is this room free
 * forever" is not a question the data can answer. Ninety days is far enough to catch the
 * booking that would actually collide — a room sold for next month's exam season — and near
 * enough that a stray reservation in the spring does not stop a host filling a bed today.
 *
 * The verdict says which window it checked, so the number is never a silent assumption.
 */
export const OPEN_ENDED_HORIZON_DAYS = 90;

export interface AvailabilityVerdict {
  /**
   * What the answer was worked out from, because it changes what can honestly be said.
   *
   * `dates` walked the stay night by night, so the message can name the first one that fails.
   * `occupancy` is a present-tense count off the rooms list — how full the room is now, which
   * is what a monthly hostel has and all it needs — and naming a date there would dress a
   * standing fact up as a finding about the range.
   */
  basis: 'dates' | 'occupancy';
  /** False blocks the form; the fields below are what the message is built from. */
  ok: boolean;
  capacity: number;
  /** The fullest the room gets in the window — what the shortfall is measured against. */
  peakBooked: number;
  /** First night with no bed for this tenant, or null when there is none. */
  firstBlocked: string | null;
  /** How many nights of the window are unavailable. One is a clash; forty is the wrong room. */
  blockedNights: number;
  /** Inclusive window actually examined, so the message can name it. */
  from: string;
  to: string;
  /** True when no leave date was given and {@link OPEN_ENDED_HORIZON_DAYS} was assumed. */
  openEnded: boolean;
}

/** `yyyy-MM-dd` from a value that may carry a time — the form's dates do. */
export function dayOf(value: string): string {
  return value.slice(0, 10);
}

/** `date` shifted by `days`, as `yyyy-MM-dd`. Parsed locally, never through `new Date(str)`. */
export function shiftDay(date: string, days: number): string {
  const [y, m, d] = dayOf(date).split('-').map(Number);
  const out = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${out.getFullYear()}-${pad(out.getMonth() + 1)}-${pad(out.getDate())}`;
}

/**
 * The nights a stay needs a bed for.
 *
 * The leave date is **exclusive**, matching the room calendar and the bookings endpoint: a
 * tenant leaving on the 5th sleeps their last night on the 4th, so asking the 5th to be free
 * would refuse a room over a bed nobody is in. Getting this backwards is invisible until two
 * stays meet exactly at a handover, which is the commonest case of all.
 */
export function stayWindow(
  joining: string,
  leave: string,
): { from: string; to: string; openEnded: boolean } {
  const from = dayOf(joining);
  if (!leave) {
    return { from, to: shiftDay(from, OPEN_ENDED_HORIZON_DAYS - 1), openEnded: true };
  }
  const lastNight = shiftDay(leave, -1);
  // A one-day stay, or a leave date at or before the joining date, still asks for the first
  // night. Returning an empty window would read as "available" without checking anything.
  return { from, to: lastNight < from ? from : lastNight, openEnded: false };
}

/**
 * Whether one more person fits in this room for every night of the window.
 *
 * The rule is the same for both kinds of room, and that is the point: a bed is free when
 * `booked < capacity`. A private room is capacity 1, so a single occupied night fills it; a
 * six-bed dorm takes five before it refuses. What differs is only what the host is told —
 * "already taken" against "no beds left" — which is the caller's job, not this one's.
 *
 * `days` must already include *both* sources of occupancy: bookings and the residents the
 * host placed by hand. A room checked against bookings alone reads empty for every tenant
 * who never came through a booking, which is most of them.
 */
export function assessAvailability(days: readonly RoomDay[], capacity: number): AvailabilityVerdict {
  const blocked = days.filter((d) => d.booked >= capacity);
  const peakBooked = days.reduce((n, d) => Math.max(n, d.booked), 0);
  return {
    basis: 'dates',
    ok: blocked.length === 0,
    capacity,
    peakBooked,
    firstBlocked: blocked[0]?.date ?? null,
    blockedNights: blocked.length,
    from: days[0]?.date ?? '',
    to: days[days.length - 1]?.date ?? '',
    openEnded: false,
  };
}
