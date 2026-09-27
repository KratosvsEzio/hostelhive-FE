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

export interface ApiMyBookingLine {
  id: string;
  room_type_id?: string | null;
  room_type_name?: string | null;
  /** Total people on the line — not per room. */
  guests?: number | null;
  /** Rooms on a private line, beds on a shared one. */
  quantity?: number | null;
  occupancy_type?: string | null;
  subtotal?: number | null;
}

/**
 * One row of `GET /api/bookings`, verified live 2026-09-27.
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
  nights?: number | null;
  guests?: number | null;
  total_price?: number | null;
  deposit?: number | null;
  paid_amount?: number | null;
  balance_due?: number | null;
  notes?: string | null;
  created_at?: string | null;
  hostel_id?: string | null;
  hostel?: { id?: string | null; name?: string | null; area?: string | null; city?: string | null } | null;
  line_items?: ApiMyBookingLine[] | null;
  /** The payment state. */
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
  hostel: { id: string; name: string; place: string };
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
  bookedOn: string;
  lines: GuestBookingLine[];
  /** `null` for a disposition this app does not know — the page falls back to `stageName`. */
  stage: BookingStage | null;
  /** The server's own name for the disposition. */
  stageName: string;
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

function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function stageFor(slug: string | null | undefined): BookingStage | null {
  return STAGE_BY_SLUG[slug ?? ''] ?? null;
}

export function toGuestBooking(b: ApiMyBooking): GuestBooking {
  const hostel = b.hostel ?? {};
  return {
    id: b.id,
    ref: b.booking_ref ?? '',
    guest: { name: b.guest_name ?? '', phone: b.guest_phone ?? '', email: b.guest_email ?? '' },
    hostel: {
      id: hostel.id ?? b.hostel_id ?? '',
      name: hostel.name ?? '',
      place: [hostel.area, hostel.city].filter((s) => !!s?.trim()).join(', '),
    },
    checkIn: wallTime(b.checkin_date),
    checkOut: wallTime(b.checkout_date),
    checkInAt: instant(b.checkin_date),
    checkOutAt: instant(b.checkout_date),
    nights: num(b.nights),
    guests: num(b.guests),
    total: num(b.total_price),
    deposit: num(b.deposit),
    paid: num(b.paid_amount),
    due: num(b.balance_due),
    notes: b.notes?.trim() ?? '',
    bookedOn: wallTime(b.created_at).date,
    lines: (b.line_items ?? []).map((l) => ({
      id: l.id,
      name: l.room_type_name ?? '',
      shared: l.occupancy_type === 'shared',
      units: num(l.quantity) || num(l.guests),
      guests: num(l.guests),
      subtotal: num(l.subtotal),
    })),
    stage: stageFor(b.disposition?.slug),
    stageName: b.disposition?.name ?? '',
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
   * `GET /api/bookings/:id` — one of the caller's bookings.
   *
   * An envelope with no booking in it errors rather than emitting an empty one, so the page
   * shows "not found" instead of a card of blanks.
   */
  get(id: string): Observable<GuestBooking> {
    return this.api.get<ApiMyBookingResponse>(`/api/bookings/${encodeURIComponent(id)}`).pipe(
      map((res) => {
        if (!res?.booking?.id) throw new Error(`booking ${id} not in response`);
        return toGuestBooking(res.booking);
      }),
    );
  }
}
