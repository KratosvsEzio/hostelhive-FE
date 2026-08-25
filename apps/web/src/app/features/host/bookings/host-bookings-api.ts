import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClient } from '@core/api-resource';
import { dayRangeEnd, dayRangeStart } from '@util/date-range-filter';
import { ApiPagination, PAGE_SIZE, pageParams, toPageInfo } from '@util/pagination';

/**
 * One page big enough to hold a whole day's arrivals.
 *
 * The endpoint pages at ten, and the ledger's cards are meant to be *all* of that day's
 * pending allotments. Left at the default a busy day would show the first ten while the
 * lane count directly above them still read the true number — the two disagreeing with
 * nothing on screen to explain it.
 */
const DAY_ARRIVALS_LIMIT = 100;

/**
 * The host's bookings for one hostel — the list and the month, both real endpoints.
 *
 * Distinct from `BookingApi`, which is still a mock standing in for the *guest* booking flow
 * (holds, checkout, cancellation quotes). These two read paths have landed; the write paths
 * this page uses — recording a booking, cancelling one — have not, and still go to the mock.
 *
 * Two param styles here, and the difference is the endpoint's, not a choice: the month
 * aggregation takes `start_date` / `end_date` as plain `yyyy-MM-dd`, matching the dashboard's
 * `monthly_renter_movement` and `occupancy_summaries`, while narrowing the *list* goes through
 * the `f[column][gte]` filters every other host screen uses. Sending one endpoint's style to
 * the other is silent: the params are ignored and the full set comes back looking correct.
 */
@Injectable({ providedIn: 'root' })
export class HostBookingsApi {
  private readonly api = inject(ApiClient);

  /**
   * `GET …/bookings/booking_calender`
   *
   * **The path spelling is the server's.** `booking_calender` is missing its second `a`; it is
   * written exactly as the backend exposes it, and correcting it silently would 404.
   */
  calendar(hostelId: string, startDate: string, endDate: string): Observable<BookingCalendar> {
    return this.api
      .get<ApiBookingCalendarResponse>(
        `/api/host/hostels/${hostelId}/bookings/booking_calender`,
        { start_date: startDate, end_date: endDate },
      )
      .pipe(map(toCalendar));
  }

  /**
   * `GET …/bookings` — one page of the hostel’s bookings, narrowed by the server.
   *
   * This used to take no arguments and hand back an array, which read as "every booking"
   * and was not: the endpoint pages, and it was returning the first page while the caller
   * filtered that page in the browser and presented the result as the whole list. A host
   * asking for cancellations got the cancellations *among the first ten arrivals*.
   *
   * So the narrowing is the server’s now, and what comes back says how much there is.
   */
  list(
    hostelId: string,
    page = 1,
    limit = PAGE_SIZE,
    filters: BookingListParams = {},
  ): Observable<HostBookingPage> {
    return this.api
      .get<ApiHostBookingListResponse>(`/api/host/hostels/${hostelId}/bookings`, {
        ...pageParams(page, limit),
        // Soonest arrival first, and it has to be asked of the server: sorting a page in
        // the browser orders ten rows against each other and says nothing about the ninety
        // behind them, so page 2 could open on earlier dates than page 1 ended on.
        //
        // `sort[field]=order` is the hash the backend reads — a bare `sort=` is dropped by
        // the strong-params permit, which is silent: the rows come back in the default
        // order looking perfectly plausible.
        'sort[checkin_date]': 'asc',
        ...filters,
      })
      .pipe(
        map((res) => {
          const items = (res.bookings ?? []).map(toHostBooking);
          const info = toPageInfo(res.pagination, page, items.length);
          return {
            items,
            page: info.page,
            total: info.total,
            totalPages: info.totalPages,
          };
        }),
      );
  }

  /**
   * `GET …/bookings` narrowed to the stays **arriving on one day** — what the day ledger
   * shows when a host taps a date.
   *
   * Asked of the server rather than filtered out of {@link list}: the full list is loaded for
   * the table's tabs and counts, and a ledger built by filtering it would silently show only
   * as much of the day as that list happened to contain. A day is a question the server can
   * answer exactly, so it is asked.
   *
   * The bounds span the whole day — `T00:00:00` to `T23:59:59` — because `checkin_date` is a
   * datetime, not a date. A bare `2026-08-24` on both ends would match only arrivals recorded
   * at exactly midnight, which is none of them. {@link dayRangeStart}/{@link dayRangeEnd} are
   * the same helpers expenses, invoices and utilities send their ranges with.
   */
  bookingsOn(hostelId: string, date: string): Observable<HostBooking[]> {
    return this.api
      .get<ApiHostBookingListResponse>(`/api/host/hostels/${hostelId}/bookings`, {
        ...pageParams(1, DAY_ARRIVALS_LIMIT),
        'f[checkin_date][gte]': dayRangeStart(date),
        'f[checkin_date][lte]': dayRangeEnd(date),
      })
      .pipe(map((res) => (res.bookings ?? []).map(toHostBooking)));
  }
}

/* ───────────────────────────────────────────────────────────── the month ── */

/**
 * One day's tallies.
 *
 * `by_status` is keyed by **disposition** slug, not by the `status` slug beside it on a
 * booking record — status is the payment state (`paid`), disposition is where the stay is in
 * its life. The two are named confusingly close together on the wire; reading the wrong one
 * gives a calendar of payment states.
 *
 * A day with nothing on it sends `by_status: {}` rather than zeros, so every read of it has
 * to tolerate a missing key.
 */
export interface ApiBookingCalendarDay {
  date: string;
  /** Stays arriving that day. An event, not a disposition — kept distinct on purpose. */
  checkins: number;
  checkouts: number;
  by_status: Record<string, number>;
}

/** Month totals per disposition. Only dispositions with a count appear. */
export interface ApiBookingCalendarStatus {
  slug: string;
  count: number;
  /** Whole rupees, summed across the month. */
  total_price: number;
}

export interface ApiBookingCalendarResponse {
  aggs?: {
    days?: ApiBookingCalendarDay[] | null;
    statuses?: ApiBookingCalendarStatus[] | null;
  } | null;
  success?: boolean;
}

export interface CalendarDayCounts {
  date: string;
  checkins: number;
  checkouts: number;
  byDisposition: Record<string, number>;
}

export interface BookingCalendar {
  days: CalendarDayCounts[];
  /** Disposition slug → month total. Absent slugs mean zero. */
  totals: Record<string, number>;
  /** Disposition slug → month revenue. */
  revenue: Record<string, number>;
}

function toCalendar(res: ApiBookingCalendarResponse): BookingCalendar {
  const totals: Record<string, number> = {};
  const revenue: Record<string, number> = {};
  for (const s of res.aggs?.statuses ?? []) {
    if (!s?.slug) continue;
    totals[s.slug] = s.count ?? 0;
    revenue[s.slug] = s.total_price ?? 0;
  }
  return {
    days: (res.aggs?.days ?? []).map((d) => ({
      date: dateOnly(d?.date),
      checkins: d?.checkins ?? 0,
      checkouts: d?.checkouts ?? 0,
      byDisposition: d?.by_status ?? {},
    })),
    totals,
    revenue,
  };
}

/* ────────────────────────────────────────────────────────────── the list ── */

interface ApiNamedSlug {
  id?: string | number | null;
  name?: string | null;
  slug?: string | null;
}

/** The wire shape. Everything optional: this is a search document, not a serializer. */
export interface ApiHostBooking {
  id: string;
  booking_ref?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  guest_email?: string | null;
  hostel_id?: string | null;
  /** Full offset timestamps (`2026-08-26T22:44:01+05:00`), not calendar dates. */
  checkin_date?: string | null;
  checkout_date?: string | null;
  nights?: number | null;
  guests?: number | null;
  total_price?: number | null;
  deposit?: number | null;
  paid_amount?: number | null;
  balance_due?: number | null;
  notes?: string | null;
  /** Where the booking came from — `Hostelworld`, `Direct`. Often null. */
  source?: string | null;
  created_at?: string | null;
  room_type?:
    | (ApiNamedSlug & {
        occupancy_type?: string | null;
        capacity?: number | null;
        price?: number | null;
      })
    | null;
  /** Payment state — `paid`, `cancelled`. Not what the calendar counts. */
  status?: ApiNamedSlug | null;
  /** Where the stay is in its life. This is what the calendar's `by_status` is keyed by. */
  disposition?: ApiNamedSlug | null;
}

export interface ApiHostBookingListResponse {
  bookings?: ApiHostBooking[] | null;
  /** `{ current_page, next_page, total_pages, total_count }` — the app-wide envelope. */
  pagination?: ApiPagination | null;
  success?: boolean;
}

/**
 * Query params {@link HostBookingsApi.list} passes straight through to the endpoint.
 *
 * An array value is serialised as repeated keys, so a key meant to carry several values
 * has to end in `[]` — `f[disposition.slug][]`. See `bookingFilterParams`, which is the
 * only thing that builds these.
 */
export type BookingListParams = Record<string, string | readonly string[]>;

export interface HostBooking {
  id: string;
  ref: string;
  guest: { name: string; phone: string; email: string };
  /** `yyyy-MM-dd`. The wire sends offset timestamps; the day is what a stay actually is. */
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  roomType: { name: string; occupancyType: string; capacity: number; price: number };
  total: number;
  deposit: number;
  paid: number;
  balanceDue: number;
  /** Payment state. Shown nowhere yet — kept so the table can grow a column without a remap. */
  status: { name: string; slug: string };
  disposition: { name: string; slug: string };
  /** The guest’s own note, shown verbatim on the request panel. */
  notes: string;
  /** Channel, when the record names one. */
  source: string;
  createdAt: string;
}

/** One page of the list, plus what a pager needs to describe where it sits. */
export interface HostBookingPage {
  items: HostBooking[];
  page: number;
  /** Rows matching the filter across every page, not the length of `items`. */
  total: number;
  totalPages: number;
}

/**
 * A calendar day out of a timestamp.
 *
 * Sliced rather than parsed: `checkin_date` arrives as `2026-08-26T22:44:01+05:00`, and
 * `new Date(…).getDate()` would re-read that instant in the *browser's* zone — a 22:44 arrival
 * in Karachi becomes the 26th in Lahore and the 26th in London, but the 26th at 17:44 UTC and
 * so the **25th** for anyone west of it. The server already wrote the day it means.
 */
function dateOnly(v: string | null | undefined): string {
  return (v ?? '').slice(0, 10);
}

export function toHostBooking(b: ApiHostBooking): HostBooking {
  const checkIn = dateOnly(b.checkin_date);
  const checkOut = dateOnly(b.checkout_date);
  return {
    id: String(b.id),
    ref: b.booking_ref ?? '',
    guest: {
      name: b.guest_name?.trim() || 'Guest',
      phone: b.guest_phone ?? '',
      email: b.guest_email ?? '',
    },
    checkIn,
    checkOut,
    // Trust the server's count when it sends one — it knows the property's day boundary.
    nights: b.nights ?? nightsBetween(checkIn, checkOut),
    guests: b.guests ?? 0,
    roomType: {
      name: b.room_type?.name ?? '—',
      occupancyType: b.room_type?.occupancy_type ?? '',
      capacity: b.room_type?.capacity ?? 0,
      // Per night for a bed, per night for the room — whichever the type sells.
      price: b.room_type?.price ?? 0,
    },
    total: b.total_price ?? 0,
    deposit: b.deposit ?? 0,
    paid: b.paid_amount ?? 0,
    balanceDue: b.balance_due ?? 0,
    status: { name: b.status?.name ?? '', slug: b.status?.slug ?? '' },
    disposition: { name: b.disposition?.name ?? '', slug: b.disposition?.slug ?? '' },
    notes: b.notes?.trim() ?? '',
    source: b.source?.trim() ?? '',
    createdAt: b.created_at ?? '',
  };
}

/** Nights between two `yyyy-MM-dd` days. Check-out is exclusive. */
export function nightsBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const n = Math.round(
    (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000,
  );
  return Number.isFinite(n) && n > 0 ? n : 0;
}
