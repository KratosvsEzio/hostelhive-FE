import { countryTimeZone } from '@core/geo/country-time-zones';
import { localDateAtWallTime } from '@util/zoned-time';
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
 * When a stay starts and ends, on the hostel's clock.
 *
 * Two fixed hours rather than anything the guest picks, because the picker asks for dates and
 * a hostel's check-in window is the hostel's to set. They are the hours the API's own example
 * carries, and 2pm-in / 11am-out is the near-universal arrangement besides.
 */
export const CHECK_IN_HOUR = 14;
export const CHECK_OUT_HOUR = 11;

/** Who the booking is for. Not necessarily the account holder — people book for other people. */
export interface BookingGuest {
  name: string;
  phone: string;
  email: string;
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
}

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
  /** The country on the hostel record — what its clock runs on. See `countryTimeZone`. */
  hostelCountry: string | null | undefined;
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
  };
  // Only private lines carry one — see `ApiBookingLineItem`.
  if (line.kind === 'private') item.quantity = line.quantity;
  return item;
}

/**
 * The whole request.
 *
 * The dates are resolved against the hostel's zone, so a guest in London booking a room in
 * Lahore agrees to arrive at 2pm Lahore time. Reading the browser's zone instead is the bug
 * this exists to prevent, and it is a five-hour one in the app's home market — enough to move
 * a check-in onto the previous day.
 *
 * Phone numbers go out as digits. The input renders them spaced and bracketed for reading and
 * the API takes them plain, and stripping here rather than at the input keeps what the guest
 * typed intact in the field they typed it in.
 */
export function toBookingRequest(input: BookingRequestInput): ApiCreateBookingRequest {
  const zone = countryTimeZone(input.hostelCountry);
  return {
    hostel_id: input.hostelId,
    booking: {
      checkin_date: localDateAtWallTime(input.checkIn, CHECK_IN_HOUR, 0, zone).toISOString(),
      checkout_date: localDateAtWallTime(input.checkOut, CHECK_OUT_HOUR, 0, zone).toISOString(),
      guest_name: input.guest.name.trim(),
      guest_phone: input.guest.phone.replace(/\D/g, ''),
      guest_email: input.guest.email.trim(),
      line_items: input.lines.map(toLineItem),
    },
  };
}
