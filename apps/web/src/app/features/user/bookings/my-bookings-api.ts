import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClient } from '@core/api-resource';
import { ApiPagination, PageInfo, pageParams, toPageInfo } from '@util/pagination';

/**
 * A guest's page of their own bookings is short — a handful a year for anyone. One page this
 * size holds all of them for nearly everybody, and "Show more" covers the rest.
 */
export const MY_BOOKINGS_LIMIT = 20;

/* ─────────────────────────────────────────────────────────────── wire ── */

export interface ApiNamedSlug {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
}

/**
 * Money and counts as the two endpoints send them: the list sends numbers (`310000`), the
 * single booking sends decimal strings (`"310000.0"`). Both are read the same way.
 */
export type ApiNumber = number | string | null | undefined;

export interface ApiMyBookingLine {
  id: string;
  room_type_id?: string | null;
  /** The list's flat name. */
  room_type_name?: string | null;
  /** The single booking's nested one. */
  room_type?: { id?: string | null; name?: string | null } | null;
  /** Total people on the line — not per room. */
  guests?: ApiNumber;
  /** Rooms on a private line, beds on a shared one. */
  quantity?: ApiNumber;
  occupancy_type?: string | null;
  subtotal?: ApiNumber;
}

/**
 * One booking, as either `GET /api/bookings` or `GET /api/bookings/:id` sends it — both
 * verified live 2026-09-27, and **they are not the same serializer**. The list carries
 * `nights`, `balance_due` and flat `room_type_name`s, all as numbers; the single booking
 * drops `nights` and `balance_due`, nests each line's name under `room_type`, and sends
 * every amount as a decimal string. The mapper reads both, deriving what one of them omits.
 *
 * Dates arrive as timestamps carrying the **hostel's** offset
 * (`2026-09-30T14:00:00.000+05:00`), which is the zone the stay happens in.
 */
export interface ApiMyBooking {
  id: string;
  booking_ref?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  guest_email?: string | null;
  checkin_date: string;
  checkout_date: string;
  nights?: ApiNumber;
  guests?: ApiNumber;
  total_price?: ApiNumber;
  deposit?: ApiNumber;
  paid_amount?: ApiNumber;
  balance_due?: ApiNumber;
  notes?: string | null;
  /** ISO-4217, single booking only (`"PKR"`). */
  currency?: string | null;
  created_at?: string | null;
  hostel_id?: string | null;
  hostel?: {
    id?: string | null;
    name?: string | null;
    area?: string | null;
    city?: string | null;
    /** Single booking only, like the coordinates below. */
    address_1?: string | null;
    /** Decimal strings (`"31.31401"`). */
    latitude?: ApiNumber;
    longitude?: ApiNumber;
  } | null;
  line_items?: ApiMyBookingLine[] | null;
  /** The lifecycle group (`pending`, `confirmed`, …) the server's edit and cancel rules read. */
  status?: ApiNamedSlug | null;
  /** Where the stay is in its life — the one a guest tracks. */
  disposition?: ApiNamedSlug | null;
}

/** `GET /api/bookings/:id` — the same row, wrapped. */
export interface ApiMyBookingResponse {
  booking?: ApiMyBooking | null;
  success?: boolean;
}

export interface ApiMyBookingsResponse {
  bookings?: ApiMyBooking[] | null;
  pagination?: ApiPagination | null;
  success?: boolean;
}

/* ─────────────────────────────────────────────────────────────── view ── */

/**
 * The steps a stay moves through, in order. `cancelled` sits outside the sequence: a
 * cancelled booking has left the track rather than reached a point on it.
 */
export type BookingStage = 'requested' | 'assigned' | 'checked-in' | 'checked-out' | 'cancelled';

export const STAGE_ORDER: readonly Exclude<BookingStage, 'cancelled'>[] = [
  'requested',
  'assigned',
  'checked-in',
  'checked-out',
];

/**
 * Disposition slug → stage.
 *
 * A guest's own booking arrives as `pending`; the host's view of the same record calls it
 * `pending-allotment`. Both mean the hostel has not given it a room yet.
 */
const STAGE_BY_SLUG: Record<string, BookingStage> = {
  pending: 'requested',
  'pending-allotment': 'requested',
  'room-assigned': 'assigned',
  'checked-in': 'checked-in',
  'checked-out': 'checked-out',
  cancelled: 'cancelled',
};

/** Which section of the page a booking belongs in. */
export type BookingTiming = 'upcoming' | 'current' | 'past';

export interface WallTime {
  /** `yyyy-MM-dd` at the hostel. */
  date: string;
  /** `HH:mm` at the hostel. */
  time: string;
}

export interface GuestBookingLine {
  id: string;
  name: string;
  shared: boolean;
  /** Rooms on a private line, beds on a shared one. */
  units: number;
  guests: number;
  subtotal: number;
}

export interface GuestBooking {
  id: string;
  ref: string;
  /** Who the booking is for — often not the account holder. */
  guest: { name: string; phone: string; email: string };
  hostel: {
    id: string;
    name: string;
    place: string;
    /** The street address — only the single-booking payload carries it. */
    address: string;
    /** Only the single-booking payload carries these; `null` from the list. */
    lat: number | null;
    lng: number | null;
  };
  checkIn: WallTime;
  checkOut: WallTime;
  /** The instants, for deciding upcoming / current / past. */
  checkInAt: number;
  checkOutAt: number;
  nights: number;
  guests: number;
  total: number;
  deposit: number;
  paid: number;
  due: number;
  notes: string;
  /** ISO-4217 code, `''` when the payload did not say — the symbol pipe then uses the default. */
  currency: string;
  bookedOn: string;
  lines: GuestBookingLine[];
  /** `null` for a disposition this app does not know — the page falls back to `stageName`. */
  stage: BookingStage | null;
  /** The server's own name for the disposition. */
  stageName: string;
  /**
   * The booking's status group — `pending`, `confirmed`, … — which is what the server's edit
   * and cancel rules read. Not the disposition above: a `pending-payment` disposition sits
   * under the `pending` status and is still editable.
   */
  statusSlug: string;
}

export interface GuestBookingPage {
  bookings: GuestBooking[];
  page: PageInfo;
}

/**
 * The wall-clock date and time written in an offset timestamp, *as written*.
 *
 * Not `new Date(…)`: that converts to the browser's zone, and a guest planning a Lahore stay
 * from Dubai would see check-in an hour early. The string already carries the hostel's own
 * clock, so it is read, not converted.
 */
export function wallTime(iso: string | null | undefined): WallTime {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(iso ?? '');
  return { date: m?.[1] ?? '', time: m?.[2] ?? '' };
}

function instant(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** A number or a numeric string, or `null` when it is neither. */
function numOrNull(v: ApiNumber): number | null {
  const n = typeof v === 'string' ? (v.trim() ? Number(v) : NaN) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function num(v: ApiNumber): number {
  return numOrNull(v) ?? 0;
}

/**
 * A usable position, or none. `0,0` is in the Gulf of Guinea and is what an unset pair
 * parses to, so it is treated as missing rather than sent to a map.
 */
function coordinates(lat: ApiNumber, lng: ApiNumber): { lat: number | null; lng: number | null } {
  const a = numOrNull(lat);
  const b = numOrNull(lng);
  const valid = a !== null && b !== null && Math.abs(a) <= 90 && Math.abs(b) <= 180 && (a !== 0 || b !== 0);
  return valid ? { lat: a, lng: b } : { lat: null, lng: null };
}

/**
 * A Google Maps link to a hostel: its exact position when known, otherwise a search for its
 * address. Empty when there is nothing to point at.
 */
export function mapsUrl(place: { lat: number | null; lng: number | null; query?: string }): string {
  if (typeof place.lat === 'number' && typeof place.lng === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  }
  const q = place.query?.trim();
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
}

/** Nights between two wall dates, for the endpoint that does not send them. */
function nightsBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const n = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function stageFor(slug: string | null | undefined): BookingStage | null {
  return STAGE_BY_SLUG[slug ?? ''] ?? null;
}

export function toGuestBooking(b: ApiMyBooking): GuestBooking {
  const hostel = b.hostel ?? {};
  const checkIn = wallTime(b.checkin_date);
  const checkOut = wallTime(b.checkout_date);
  const total = num(b.total_price);
  const paid = num(b.paid_amount);
  return {
    id: b.id,
    ref: b.booking_ref ?? '',
    guest: { name: b.guest_name ?? '', phone: b.guest_phone ?? '', email: b.guest_email ?? '' },
    hostel: {
      id: hostel.id ?? b.hostel_id ?? '',
      name: hostel.name ?? '',
      place: [hostel.area, hostel.city].filter((s) => !!s?.trim()).join(', '),
      address: hostel.address_1?.trim() ?? '',
      ...coordinates(hostel.latitude, hostel.longitude),
    },
    checkIn,
    checkOut,
    checkInAt: instant(b.checkin_date),
    checkOutAt: instant(b.checkout_date),
    nights: numOrNull(b.nights) ?? nightsBetween(checkIn.date, checkOut.date),
    guests: num(b.guests),
    total,
    deposit: num(b.deposit),
    paid,
    due: numOrNull(b.balance_due) ?? Math.max(total - paid, 0),
    notes: b.notes?.trim() ?? '',
    currency: b.currency?.trim().toUpperCase() ?? '',
    bookedOn: wallTime(b.created_at).date,
    lines: (b.line_items ?? []).map((l) => ({
      id: l.id,
      name: l.room_type_name ?? l.room_type?.name ?? '',
      shared: l.occupancy_type === 'shared',
      units: num(l.quantity) || num(l.guests),
      guests: num(l.guests),
      subtotal: num(l.subtotal),
    })),
    stage: stageFor(b.disposition?.slug),
    stageName: b.disposition?.name ?? '',
    statusSlug: b.status?.slug ?? '',
  };
}

/**
 * Where a booking sits relative to `now`.
 *
 * The stage wins where it is decisive — a checked-out stay is past even if the host marked it
 * early, a checked-in one is current — and the dates decide the rest. A cancelled booking is
 * never "current", whatever its dates say.
 */
export function timingOf(b: GuestBooking, now: number): BookingTiming {
  if (b.stage === 'checked-out') return 'past';
  if (b.stage === 'checked-in') return 'current';
  if (b.checkOutAt && b.checkOutAt <= now) return 'past';
  if (b.stage === 'cancelled') return b.checkInAt > now ? 'upcoming' : 'past';
  if (b.checkInAt && b.checkInAt <= now) return 'current';
  return 'upcoming';
}

/** The signed-in guest's own bookings. */
@Injectable({ providedIn: 'root' })
export class MyBookingsApi {
  private readonly api = inject(ApiClient);

  /** `GET /api/bookings` — scoped by the server to the caller's JWT. */
  list(page = 1, limit = MY_BOOKINGS_LIMIT): Observable<GuestBookingPage> {
    return this.api
      .get<ApiMyBookingsResponse>('/api/bookings', pageParams(page, limit))
      .pipe(
        map((res) => {
          const rows = res?.bookings ?? [];
          return {
            bookings: rows.map(toGuestBooking),
            page: toPageInfo(res?.pagination, page, rows.length),
          };
        }),
      );
  }

  /**
   * `GET /api/bookings/:id` — one of the caller's bookings. Someone else's answers 404.
   */
  get(id: string): Observable<GuestBooking> {
    return this.api
      .get<ApiMyBookingResponse>(`/api/bookings/${encodeURIComponent(id)}`)
      .pipe(map((res) => readBooking(res, id)));
  }

  /**
   * `PATCH /api/bookings/:id` — the guest's contact details and note, while it is pending.
   *
   * Deliberately only these four. The endpoint also takes dates, `guests` and `line_items`,
   * but as built (azeem-hamza/hostelhive#7) none of them is safe to send: totals are priced
   * once, on create, so new dates would keep the old total; `guests` is a separate column
   * from the lines it should be the sum of; and `line_items` goes to the association as bare
   * hashes, which Rails cannot assign. The server answers 422 once the booking has left
   * pending.
   */
  update(id: string, patch: GuestBookingPatch): Observable<GuestBooking> {
    return this.api
      .patch<ApiMyBookingResponse>(`/api/bookings/${encodeURIComponent(id)}`, {
        booking: {
          guest_name: patch.guestName.trim(),
          guest_phone: patch.guestPhone.trim(),
          guest_email: patch.guestEmail.trim(),
          notes: patch.notes.trim(),
        },
      })
      .pipe(map((res) => readBooking(res, id)));
  }

  /** `POST /api/bookings/:id/mark_as_cancelled` — from pending or confirmed; 422 after that. */
  cancel(id: string): Observable<GuestBooking> {
    return this.api
      .post<ApiMyBookingResponse>(`/api/bookings/${encodeURIComponent(id)}/mark_as_cancelled`, {})
      .pipe(map((res) => readBooking(res, id)));
  }
}

/** What the guest may change on a booking. See {@link MyBookingsApi.update} for why only this. */
export interface GuestBookingPatch {
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  notes: string;
}

/**
 * The booking out of a single-booking envelope. One with no booking in it errors rather
 * than emitting an empty one, so the page shows "not found" instead of a card of blanks.
 */
function readBooking(res: ApiMyBookingResponse | null | undefined, id: string): GuestBooking {
  if (!res?.booking?.id) throw new Error(`booking ${id} not in response`);
  return toGuestBooking(res.booking);
}

/** Changing the details is allowed only while the booking is pending. */
export function canEdit(b: GuestBooking): boolean {
  return b.statusSlug === 'pending';
}

/** Cancelling is allowed while pending or confirmed. */
export function canCancel(b: GuestBooking): boolean {
  return b.statusSlug === 'pending' || b.statusSlug === 'confirmed';
}
