import { BasketLine } from './room-offer';

/**
 * Building the body of `POST /api/bookings`.
 *
 * Kept apart from the component that sends it because almost everything that can be wrong
 * here is wrong quietly: a date an hour out, a headcount counted per room instead of per
 * line, a `quantity` on a line that should not carry one. None of those fail — they book
 * something other than what the guest chose, and the guest finds out at reception.
 */

/**
 * Who the booking is for — not necessarily the account holder, since people book for other
 * people — and anything they want the hostel to know before they arrive.
 */
export interface BookingGuest {
  name: string;
  phone: string;
  email: string;
  /** Free text for the hostel: "arriving late", "travelling with a child". Optional. */
  notes?: string;
}

/**
 * One room type on the booking.
 *
 * `guests` is the headcount **on the line**, not per room: two private rooms for a party of
 * four is `{guests: 4, quantity: 2}`, not `{guests: 2}` twice or `{guests: 8}`.
 *
 * `quantity` counts rooms, so it is only meaningful on a private line. A shared line is sold
 * by the bed and seats exactly one person per bed, which makes its bed count and its headcount
 * the same number — sending both would be saying one thing twice, with the chance of the two
 * disagreeing.
 */
export interface ApiBookingLineItem {
  room_type_id: string;
  guests: number;
  quantity?: number;
  /**
   * How the line is sold, in the API's own slugs — `private_room`, not the `private` the rest
   * of this app says. Repeats what the room type already records, but the contract carries it
   * on every line, and it is what tells the server whether `quantity` counts rooms or is absent
   * because the line is counted in beds.
   */
  occupancy_type: ApiOccupancyType;
}

/** The two spellings `POST /api/bookings` accepts. See `@util/occupancy-type` for the others. */
export type ApiOccupancyType = 'private_room' | 'shared';

export interface ApiCreateBookingRequest {
  hostel_id: string;
  booking: {
    /** ISO 8601, UTC. 2pm on the hostel's clock, not the browser's. */
    checkin_date: string;
    /** ISO 8601, UTC. 11am on the hostel's clock. */
    checkout_date: string;
    guest_name: string;
    guest_phone: string;
    guest_email: string;
    /** Absent rather than empty when the guest wrote nothing. */
    notes?: string;
    line_items: ApiBookingLineItem[];
  };
}

/**
 * What the booking is worth quoting afterwards.
 *
 * Only the reference is read. The server answers with the whole booking priced and dated, but
 * everything else on it is either already on screen or the hostel's business rather than the
 * guest's — and a field read here is a field that breaks the confirmation when it is renamed.
 */
export interface CreatedBooking {
  /** `HH-2026-5CW0EZ0N`, or `null` when the answer did not carry one. */
  reference: string | null;
}

/**
 * The wire shape, as far as it is depended on.
 *
 * Both the wrapped and bare spellings are read. Every other endpoint on this API wraps its
 * record — `{booking: …}`, `{attachment: …}` — and the cancel action does too, so wrapped is
 * what this expects; the bare key costs one `??` and covers the create being the exception.
 */
export interface ApiCreatedBookingResponse {
  booking?: { booking_ref?: string | null } | null;
  booking_ref?: string | null;
}

/** The reference off the create response, or `null` — never an empty string. */
export function readCreatedBooking(
  res: ApiCreatedBookingResponse | null | undefined,
): CreatedBooking {
  const ref = res?.booking?.booking_ref ?? res?.booking_ref;
  if (typeof ref !== 'string') return { reference: null };
  const trimmed = ref.trim();
  return { reference: trimmed === '' ? null : trimmed };
}

export interface BookingRequestInput {
  hostelId: string;
  /** Local midnights from the date picker; only their calendar dates are read. */
  checkIn: Date;
  checkOut: Date;
  lines: readonly BasketLine[];
  guest: BookingGuest;
}

/** One basket line as the API wants it. */
export function toLineItem(line: BasketLine): ApiBookingLineItem {
  const item: ApiBookingLineItem = {
    room_type_id: line.roomId,
    guests: line.guests,
    occupancy_type: line.kind === 'private' ? 'private_room' : 'shared',
  };
  // Only private lines carry one — see `ApiBookingLineItem`.
  if (line.kind === 'private') item.quantity = line.quantity;
  return item;
}

/**
 * A calendar day as the API takes it, `yyyy-MM-dd`, from the picker's local midnight.
 *
 * Read from the local components on purpose: the picker's Date is midnight *here*, and
 * `toISOString()` would move it to the previous day for anyone east of Greenwich.
 */
export function calendarDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The whole request.
 *
 * **Dates go as plain days** (Trello #81). The server reads `2026-10-17` in the hostel's own
 * zone — stored on the hostel since azeem-hamza/hostelhive#10 — so a guest in London booking a
 * room in Lahore books Lahore's 17th. The instant used to be worked out here, from a zone
 * guessed off the hostel's country; sending one pins the booking to whatever zone this browser
 * or that guess put it in, which is wrong for any hostel elsewhere.
 *
 * Phone numbers go out as digits. The input renders them spaced and bracketed for reading and
 * the API takes them plain, and stripping here rather than at the input keeps what the guest
 * typed intact in the field they typed it in.
 */
export function toBookingRequest(input: BookingRequestInput): ApiCreateBookingRequest {
  const notes = input.guest.notes?.trim();
  return {
    hostel_id: input.hostelId,
    booking: {
      checkin_date: calendarDay(input.checkIn),
      checkout_date: calendarDay(input.checkOut),
      guest_name: input.guest.name.trim(),
      guest_phone: input.guest.phone.replace(/\D/g, ''),
      guest_email: input.guest.email.trim(),
      ...(notes ? { notes } : {}),
      line_items: input.lines.map(toLineItem),
    },
  };
}
