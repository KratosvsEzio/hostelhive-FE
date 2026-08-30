/**
 * The API this feature needs and the backend has not built yet.
 *
 * Every type below is a request or response shape the frontend already codes against. They
 * are written here rather than described in prose so the two sides can disagree at compile
 * time instead of in staging — when the real endpoints land, `BookingApi` swaps its mock
 * implementation for HTTP and nothing else in the feature moves.
 *
 * Money is **PKR minor-unit-free**: whole rupees with two decimal places where a price
 * genuinely has them, matching how the existing listing payload already carries `price`.
 * Dates are local calendar dates (`yyyy-MM-dd`) with no time and no zone — a check-in is a
 * day at the property, not an instant, and sending an ISO timestamp shifts it across the
 * date line for anybody west of Greenwich.
 */

import { RoomKind } from './room-offer';

// ─────────────────────────────────────────────────────────────────────────────
// GET /public/hostels/:id/rooms?check_in=&check_out=
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A bookable room with its availability for the requested range.
 *
 * `available` is the count of sellable units **as seen by this caller** — beds for a shared
 * room, whole rooms for a private one — and it must already add back whatever the caller's
 * own hold is holding. A seeker holding 2 of 3 beds has to be told 3, or their own selection
 * caps their own stepper below what they already have.
 */
export interface ApiRoomOffer {
  id: string;
  title: string;
  description?: string | null;
  room_type: RoomKind;
  /** People the room sleeps. Bed inventory on a shared room; display only on a private one. */
  capacity: number;
  /** Per unit, per night. The list price. */
  actual_price: number;
  /** Per unit, per night. What is charged. Absent when there is no discount; never ≥ actual. */
  discounted_price?: number | null;
  /** Up to 3. */
  images: string[];
  /** The host's online-booking toggle. `false` rooms are omitted from the picker entirely. */
  bookable: boolean;
  /** Units free across the whole range, inclusive of this caller's own hold. */
  available: number;
}

export interface ApiRoomsResponse {
  rooms: ApiRoomOffer[];
  /** `month` | `night`. A hostel-level property — every room shares it. */
  billing_frequency_type: 'month' | 'night';
  success: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/holds · PATCH /api/holds/:id · DELETE /api/holds/:id
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiHoldLine {
  room_id: string;
  /** Rooms on a private line, beds on a shared one. */
  quantity: number;
}

export interface ApiHoldRequest {
  hostel_id: string;
  check_in: string;
  check_out: string;
  guests: number;
  rooms: ApiHoldLine[];
}

/**
 * A reservation of inventory, owned by the authenticated user.
 *
 * `expires_at` is enforced **server-side**. The client releases its hold on leaving, but that
 * call only fires if the tab is alive to send it — closed browsers, dead batteries and
 * backgrounded apps would otherwise strand beds permanently, which is worse than the race the
 * hold exists to prevent.
 */
export interface ApiHold {
  id: string;
  expires_at: string;
  /** Refreshed availability, so the picker re-renders against one consistent snapshot. */
  rooms: ApiRoomOffer[];
  success: boolean;
}

/**
 * PATCH replaces the whole held set atomically.
 *
 * Not a release followed by a fresh hold: the gap between two calls is exactly where a seeker
 * loses beds they already had by trying to add one more.
 */
export type ApiHoldUpdateRequest = Omit<ApiHoldRequest, 'hostel_id'>;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a guest sends from a listing page.
 *
 * No `hold_id`, because there is no payment step to hold inventory across any more: the
 * summary modal is the last thing between choosing rooms and the booking existing, and it is
 * open for seconds. The rooms and dates travel in full so the backend prices the stay itself —
 * a client-supplied total is a number the guest can edit.
 */
export interface ApiBookingRequest {
  hostel_id: string;
  /** `YYYY-MM-DD`. */
  check_in: string;
  /** `YYYY-MM-DD`, exclusive — nobody pays for the morning they leave. */
  check_out: string;
  guests: number;
  lines: { room_id: string; quantity: number }[];
}

/**
 * `unconfirmed` is a booking the host wrote down, not one a guest paid for.
 *
 * Walk-ins and phone bookings are most of the trade for a small hostel, and they exist before
 * any money moves. Kept distinct from `confirmed` rather than folded into it because the two
 * differ in what they entitle: a confirmed booking has a deposit behind it and a cancellation
 * schedule that pays out, and an unconfirmed one has neither.
 */
export type ApiBookingStatus = 'unconfirmed' | 'confirmed' | 'cancelled' | 'completed';

export interface ApiBookingLine {
  room_id: string;
  room_title: string;
  room_type: RoomKind;
  quantity: number;
  /**
   * Captured at booking and never re-read.
   *
   * A discount stands until the host removes it, so hosts will remove them while bookings are
   * live. A line that read today's price would silently reprice a stay already paid for, and
   * refund a later cancellation against a number the guest never agreed to.
   */
  unit_price: number;
  actual_price: number;
}

export interface ApiBooking {
  id: string;
  hostel_id: string;
  hostel_name: string;
  check_in: string;
  check_out: string;
  guests: number;
  lines: ApiBookingLine[];
  /** Whole stay. */
  total: number;
  /** Charged online — 10% of `total`. */
  deposit: number;
  status: ApiBookingStatus;
  created_at: string;
  /** Present once cancelled. */
  cancellation?: ApiCancellation | null;
  /** Guest details, for the host-facing views only. */
  guest?: { name: string; email: string; phone?: string | null } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bookings/:id/cancellation_quote · POST /api/bookings/:id/cancel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What cancelling costs, computed by the backend for this booking right now.
 *
 * Quoted rather than derived in the browser: the band depends on the time remaining to
 * check-in, and a client clock — or a page open since yesterday — would show one figure and
 * charge another. This is the screen where that is least forgivable.
 */
export interface ApiCancellationQuote {
  /** 30 | 40 | 60 | 70 | 85, or absent when cancellation is no longer offered. */
  charge_percent?: number | null;
  charge_amount?: number | null;
  refund_amount?: number | null;
  /** False inside 24 hours of check-in. */
  cancellable: boolean;
  /** Shown when `cancellable` is false, e.g. "Bookings cannot be cancelled within 24 hours". */
  reason?: string | null;
  success: boolean;
}

export interface ApiCancellation {
  cancelled_by: 'guest' | 'host';
  cancelled_at: string;
  charge_amount: number;
  refund_amount: number;
  /** Guest cancellations only — 50% of the charge. Absent on host cancellations. */
  host_share?: number | null;
  /** Host cancellations only — 10% of booking value, retained by HostelHive. */
  host_penalty?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Host side
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/host/hostels/:id/bookings — a booking the host is recording on someone's behalf.
 *
 * No hold and no payment: the host is writing down something that already happened at the
 * desk or on the phone, so it lands as `unconfirmed`. The server still has to check the rooms
 * are free for the range — a host double-booking a bed by hand is the same oversell as a
 * guest doing it, and the guest is the one who finds out at check-in.
 *
 * `email` is optional here and required on the guest-facing path. Somebody standing at a
 * counter may not have one, and refusing the booking over it would push the host back to
 * paper — which is the thing this screen exists to replace.
 */
export interface ApiHostBookingRequest {
  check_in: string;
  check_out: string;
  guests: number;
  lines: { room_id: string; quantity: number }[];
  guest: { name: string; phone?: string | null; email?: string | null };
  /**
   * Taken off the whole stay, in whole rupees. Absent means none.
   *
   * Sent as an amount rather than a percentage because that is what is agreed at a desk
   * — "call it 2,000 less" — and because a percentage has to be resolved against a total
   * anyway, which is the server's number to compute, not the browser's.
   *
   * The server is expected to clamp it: a discount larger than the stay would otherwise
   * make a booking worth less than nothing.
   */
  discount?: number;
}

/** GET /api/host/hostels/:id/bookings — arrivals first. */
export interface ApiHostBookingsResponse {
  bookings: ApiBooking[];
  aggs?: { status: ApiBookingStatus; count: number }[];
  pagination?: { current_page: number; total_pages: number; total_count: number };
  success: boolean;
}

/**
 * GET /api/host/hostels/:hostel_id/rooms/:room_id/calendar?from=&to=
 *
 * One entry per date. `booked`/`capacity` drive the three cell states: free, partly booked
 * (shared rooms only), and full. A private room is binary — its capacity is 1 sellable unit
 * whatever the room sleeps.
 */
export interface ApiCalendarDay {
  date: string;
  booked: number;
  capacity: number;
  /** Bookings touching this date, for the hover card. Several, on a shared room. */
  booking_ids: string[];
}

export interface ApiRoomCalendarResponse {
  days: ApiCalendarDay[];
  bookings: ApiBooking[];
  success: boolean;
}

/** POST /api/host/bookings/:id/cancel — the penalty is quoted first, same as the guest side. */
export interface ApiHostCancellationQuote {
  penalty_amount: number;
  refund_amount: number;
  success: boolean;
}
