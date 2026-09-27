import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { ApiClient } from '@core/api-resource';
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
 * One page big enough to hold a month of one room's stays.
 *
 * The room calendar draws every stay touching the month, and a page boundary would not show
 * as an error — it would show as a fortnight that looks free. A four-bed room turning over
 * weekly tops out near twenty; a hundred leaves room for a hostel that sells by the night.
 */
const ROOM_MONTH_LIMIT = 100;

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
   * **Plain days on both ends** (Trello #81): the server applies the hostel's own day
   * boundaries, so `2026-08-24` means that day at the property. A time with this browser's
   * offset — what used to be sent — pins the day to wherever the host happens to be.
   */
  bookingsOn(hostelId: string, date: string): Observable<HostBooking[]> {
    return this.api
      .get<ApiHostBookingListResponse>(`/api/host/hostels/${hostelId}/bookings`, {
        ...pageParams(1, DAY_ARRIVALS_LIMIT),
        'f[checkin_date][gte]': date,
        'f[checkin_date][lte]': date,
      })
      .pipe(map((res) => (res.bookings ?? []).map(toHostBooking)));
  }

  /**
   * Every stay **touching** `[from, to]` in one room — what the room calendar draws.
   *
   * Two filters, both verified against the live endpoint rather than assumed:
   *
   *  - `f[room.id]`, **not** `f[room_id]`. The flat key is accepted and matches nothing: it
   *    returns zero rows for a room with nine stays, exactly as it does for an id that does
   *    not exist. That failure is silent and it is the dangerous kind here — an empty
   *    calendar is indistinguishable from a room nobody has booked. The dotted form is the
   *    same convention `f[disposition.slug][]` already uses for the list's filters.
   *
   *  - **Overlap, not arrival.** A stay belongs on August's calendar if it is in the room on
   *    any August day, so the test is `checkin_date <= end AND checkout_date >= start`.
   *    Filtering on `checkin_date` alone — the obvious thing, and what the day ledger above
   *    correctly does for a different question — drops every stay that began in July and is
   *    still running, which is precisely the guest a host is looking for when they open a
   *    room's month.
   *
   * A room with no bookings answers with none, and that is a fact worth rendering. It used to
   * be a fixture: a room the seeker-side offers had never heard of was given invented stays,
   * on the reasoning that an empty calendar might be mistaken for a broken one. That trade is
   * only worth making while the endpoint does not exist.
   */
  bookingsInRoom(
    hostelId: string,
    roomId: string,
    from: string,
    to: string,
  ): Observable<HostBooking[]> {
    if (!hostelId || !roomId) return of([]);
    return this.api
      .get<ApiHostBookingListResponse>(`/api/host/hostels/${hostelId}/bookings`, {
        ...pageParams(1, ROOM_MONTH_LIMIT),
        'f[room.id]': roomId,
        'f[checkin_date][lte]': to,
        'f[checkout_date][gte]': from,
      })
      .pipe(map((res) => (res.bookings ?? []).map(toHostBooking)));
  }

  /* ── the lifecycle (Trello #80) ────────────────────────────────────────────────
   *
   * Each answers with the booking as the server now stores it, and the page draws that
   * rather than guessing what the move did. Every guard is the server's; the page offers each
   * action only from the state it is valid in, because two of them are not guarded there —
   * confirm would re-confirm a cancelled booking, check-in would skip confirming.
   */

  /**
   * `POST …/bookings` — a walk-in or phone booking the host writes down.
   *
   * The same body the guest endpoint takes: room types and how many, not rooms — rooms are
   * placed at check-in. Dates go as plain days, which the server reads in the hostel's zone.
   */
  create(hostelId: string, input: HostBookingInput): Observable<HostBooking> {
    return this.api
      .post<{ booking?: ApiHostBooking | null }>(`/api/host/hostels/${hostelId}/bookings`, {
        booking: {
          checkin_date: input.checkIn,
          checkout_date: input.checkOut,
          guest_name: input.guestName.trim(),
          guest_phone: input.guestPhone.replace(/\D/g, ''),
          ...(input.guestEmail.trim() ? { guest_email: input.guestEmail.trim() } : {}),
          line_items: input.lines.map((l) => ({
            room_type_id: l.roomTypeId,
            guests: l.guests,
            occupancy_type: l.shared ? 'shared' : 'private_room',
            // A shared line's bed count is its guests; only a private line says how many rooms.
            ...(l.shared ? {} : { quantity: l.quantity }),
          })),
        },
      })
      .pipe(
        map((res) => {
          if (!res?.booking?.id) throw new Error('booking not in response');
          return toHostBooking(res.booking);
        }),
      );
  }

  /** `POST …/mark_as_confirmed` — pending → confirmed. The guest is emailed the PDF. */
  confirm(hostelId: string, bookingId: string): Observable<HostBooking> {
    return this.post(hostelId, bookingId, 'mark_as_confirmed', {});
  }

  /**
   * `POST …/mark_as_checked_in` — confirmed → checked-in, placing guests in rooms.
   *
   * One allocation per room, any room type; the server refuses a room without that many free
   * beds, and the booking's headcount becomes the sum of what was placed.
   */
  checkIn(hostelId: string, bookingId: string, allocations: readonly CheckInAllocation[]): Observable<HostBooking> {
    return this.post(hostelId, bookingId, 'mark_as_checked_in', {
      allocations: allocations.map((a) => ({ room_id: a.roomId, guests: a.guests })),
    });
  }

  /**
   * `POST …/mark_as_paid` — the guest settled at the property (Trello #81). Sets what was paid
   * to the total, so nothing is left due. Confirmed, checked in, checked out or no-show only;
   * 422 on anything else, and on a booking already paid. It does not touch the invoice, which
   * is marked paid on its own.
   */
  markPaid(hostelId: string, bookingId: string): Observable<HostBooking> {
    return this.post(hostelId, bookingId, 'mark_as_paid', {});
  }

  /** `POST …/mark_as_checked_out` — checked-in → checked-out, releasing every bed. */
  checkOut(hostelId: string, bookingId: string): Observable<HostBooking> {
    return this.post(hostelId, bookingId, 'mark_as_checked_out', {});
  }

  /** `POST …/mark_as_cancelled` — any time, with a reason the server requires. */
  cancel(hostelId: string, bookingId: string, reason: string): Observable<HostBooking> {
    return this.post(hostelId, bookingId, 'mark_as_cancelled', { reason: reason.trim() });
  }

  /** `POST …/mark_as_no_show` — confirmed only: the guest never arrived. */
  markNoShow(hostelId: string, bookingId: string, reason: string): Observable<HostBooking> {
    return this.post(hostelId, bookingId, 'mark_as_no_show', { reason: reason.trim() });
  }

  /**
   * `POST …/generate_invoice` — after check-in, once per booking; the server says 422 to a
   * second. Answers with the bill, not the booking, so this reports only that it worked.
   */
  generateInvoice(hostelId: string, bookingId: string): Observable<void> {
    return this.api
      .post<unknown>(`${this.base(hostelId, bookingId)}/generate_invoice`, {})
      .pipe(map(() => undefined));
  }

  /** `GET …/occupancies` — who is in which room, for a checked-in booking. */
  occupancies(hostelId: string, bookingId: string): Observable<BookingOccupancy[]> {
    return this.api
      .get<ApiOccupanciesResponse>(`${this.base(hostelId, bookingId)}/occupancies`, pageParams(1, 100))
      .pipe(map((res) => (res?.occupancies ?? []).map(toOccupancy)));
  }

  /** `PUT …/occupancies/:id/mark_as_inactive` — releases one room's beds before check-out. */
  releaseOccupancy(hostelId: string, bookingId: string, occupancyId: string): Observable<void> {
    return this.api
      .put<unknown>(
        `${this.base(hostelId, bookingId)}/occupancies/${encodeURIComponent(occupancyId)}/mark_as_inactive`,
        {},
      )
      .pipe(map(() => undefined));
  }

  private base(hostelId: string, bookingId: string): string {
    return `/api/host/hostels/${hostelId}/bookings/${encodeURIComponent(bookingId)}`;
  }

  private post(hostelId: string, bookingId: string, action: string, body: object): Observable<HostBooking> {
    return this.api
      .post<{ booking?: ApiHostBooking | null }>(`${this.base(hostelId, bookingId)}/${action}`, body)
      .pipe(
        map((res) => {
          if (!res?.booking?.id) throw new Error(`booking ${bookingId} not in response`);
          return toHostBooking(res.booking);
        }),
      );
  }
}

export interface HostBookingInput {
  /** Plain `yyyy-MM-dd` days — the server reads them in the hostel's zone (Trello #81). */
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  lines: readonly { roomTypeId: string; shared: boolean; quantity: number; guests: number }[];
}

export interface CheckInAllocation {
  roomId: string;
  guests: number;
}

/** One room a checked-in booking holds beds in. */
export interface BookingOccupancy {
  id: string;
  roomId: string;
  roomNumber: string;
  guests: number;
  active: boolean;
}

interface ApiOccupanciesResponse {
  occupancies?:
    | {
        id: string;
        room_id?: string | null;
        /** Flat on the booking payload; nested under `room` on the occupancies endpoint. */
        room_number?: string | null;
        guests?: HostApiNumber;
        status?: string | null;
        room?: { id?: string | null; room_number?: string | null } | null;
      }[]
    | null;
}

function toOccupancy(o: NonNullable<ApiOccupanciesResponse['occupancies']>[number]): BookingOccupancy {
  return {
    id: String(o.id),
    roomId: o.room?.id ?? o.room_id ?? '',
    roomNumber: o.room?.room_number ?? o.room_number ?? '—',
    guests: num(o.guests),
    active: (o.status ?? 'active') === 'active',
  };
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

export type HostApiNumber = number | string | null | undefined;

/** A number or a numeric string (`"310000.0"`), as either shape of the booking sends it. */
function num(v: HostApiNumber): number {
  const n = typeof v === 'string' ? (v.trim() ? Number(v) : NaN) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
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
  nights?: HostApiNumber;
  guests?: HostApiNumber;
  /** Numbers from the list (a search document), decimal strings from a single booking. */
  total_price?: HostApiNumber;
  deposit?: HostApiNumber;
  paid_amount?: HostApiNumber;
  balance_due?: HostApiNumber;
  currency?: string | null;
  notes?: string | null;
  /**
   * What was booked, one line per room type. The list sends a flat `room_type_name`; a
   * single booking nests it under `room_type`.
   */
  line_items?:
    | {
        id?: string | null;
        room_type_id?: string | null;
        room_type_name?: string | null;
        room_type?: { id?: string | null; name?: string | null } | null;
        guests?: HostApiNumber;
        quantity?: HostApiNumber;
        occupancy_type?: string | null;
        subtotal?: HostApiNumber;
      }[]
    | null;
  /** Written by a host cancel or no-show. Not serialised yet; read when it is. */
  cancellation_reason?: string | null;
  /**
   * The rooms the party was checked into, one per room (Trello #81). `inactive` means released
   * or checked out. On both the list and a single booking.
   */
  occupancies?: ApiOccupanciesResponse['occupancies'];
  /** Where the booking came from — `Hostelworld`, `Direct`. Often null. */
  source?: string | number | null;
  created_at?: string | null;
  room_type?:
    | (ApiNamedSlug & {
        occupancy_type?: string | null;
        capacity?: HostApiNumber;
        price?: HostApiNumber;
      })
    | null;
  /**
   * The room this stay was allotted, or null while it is still pending allotment.
   *
   * Both forms travel: the flat id, and the nested record carrying the number a host reads.
   * A booking can be paid and roomless \x2D\x2D that is what `pending-allotment` means \x2D\x2D so this
   * being null is an ordinary state, not missing data.
   */
  room_id?: string | null;
  room?: { id?: string | null; room_number?: string | null } | null;
  /**
   * The person actually staying, once one is on file.
   *
   * Distinct from `guest_name`, which is whoever made the booking. They are often different
   * people and in this data usually are \x2D\x2D one account booking beds for others.
   */
  renter_id?: string | null;
  renter?: {
    id?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
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
  /** Allotted room, or null while the booking is still pending allotment. */
  room: { id: string; number: string } | null;
  /**
   * Who is actually staying, when the record names someone.
   *
   * Null on a booking nobody has been assigned to yet, in which case {@link guest} \x2D\x2D the
   * person who made the booking \x2D\x2D is the only name there is.
   */
  renter: { id: string; name: string; email: string; phone: string } | null;
  /** Payment state. Shown nowhere yet — kept so the table can grow a column without a remap. */
  status: { name: string; slug: string };
  disposition: { name: string; slug: string };
  /** The guest’s own note, shown verbatim on the request panel. */
  notes: string;
  /** What was booked, one line per room type — a stay can mix private rooms and dorm beds. */
  lines: HostBookingLine[];
  /** ISO-4217, when the record says; `''` lets the symbol pipe use the default. */
  currency: string;
  /** Why the host cancelled it or marked it a no-show, once the server sends it. */
  cancellationReason: string;
  /** Which rooms the party is (or was) in, and how many in each. Empty until checked in. */
  occupancies: BookingOccupancy[];
  /** Channel, when the record names one. */
  source: string;
  createdAt: string;
}

export interface HostBookingLine {
  roomTypeId: string;
  name: string;
  shared: boolean;
  /** Rooms on a private line, beds on a shared one. */
  units: number;
  guests: number;
  subtotal: number;
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
    nights: b.nights != null && b.nights !== '' ? num(b.nights) : nightsBetween(checkIn, checkOut),
    guests: num(b.guests),
    roomType: {
      name: b.room_type?.name ?? '—',
      occupancyType: b.room_type?.occupancy_type ?? '',
      capacity: num(b.room_type?.capacity),
      // Per night for a bed, per night for the room — whichever the type sells.
      price: num(b.room_type?.price),
    },
    total: num(b.total_price),
    deposit: num(b.deposit),
    paid: num(b.paid_amount),
    // A single booking omits it; what is owed is then what is not yet paid.
    balanceDue:
      b.balance_due != null && b.balance_due !== ''
        ? num(b.balance_due)
        : Math.max(num(b.total_price) - num(b.paid_amount), 0),
    room: b.room?.id
      ? { id: String(b.room.id), number: b.room.room_number ?? '—' }
      : b.room_id
        ? { id: String(b.room_id), number: '—' }
        : null,
    renter: b.renter?.id
      ? {
          id: String(b.renter.id),
          name: b.renter.full_name?.trim() || 'Guest',
          email: b.renter.email ?? '',
          phone: b.renter.phone ?? '',
        }
      : null,
    status: { name: b.status?.name ?? '', slug: b.status?.slug ?? '' },
    disposition: { name: b.disposition?.name ?? '', slug: b.disposition?.slug ?? '' },
    notes: b.notes?.trim() ?? '',
    lines: (b.line_items ?? []).map((l) => ({
      roomTypeId: l.room_type_id ?? l.room_type?.id ?? '',
      name: l.room_type_name ?? l.room_type?.name ?? '',
      shared: l.occupancy_type === 'shared',
      units: num(l.quantity) || num(l.guests),
      guests: num(l.guests),
      subtotal: num(l.subtotal),
    })),
    currency: b.currency?.trim().toUpperCase() ?? '',
    cancellationReason: b.cancellation_reason?.trim() ?? '',
    occupancies: (b.occupancies ?? []).map(toOccupancy),
    // A number (`0`) on a single booking, a channel name on the list.
    source: typeof b.source === 'string' ? b.source.trim() : '',
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
