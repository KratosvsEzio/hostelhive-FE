import { Injectable, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  ApiBooking,
  ApiBookingLine,
  ApiCancellationQuote,
  ApiHold,
  ApiHoldLine,
  ApiBookingRequest,
  ApiHostBookingRequest,
  ApiHostCancellationQuote,
  ApiCalendarDay,
  ApiRoomCalendarResponse,
  ApiHoldRequest,
  ApiHoldUpdateRequest,
  ApiRoomOffer,
  ApiRoomsResponse,
} from './booking-api.contract';
import { ROOM_OFFERS } from './room-offers.fixture';
import { RoomOffer } from './room-offer';

/**
 * Booking API. **Mock implementation pending the real endpoints.**
 *
 * Every method matches a route in `booking-api.contract.ts`, takes the request shape the
 * backend will take and returns the response shape it will return. Swapping this for HTTP is
 * a one-file change: the components call methods, not URLs.
 *
 * The mock is deliberately more than a fixture returned unchanged — holds actually decrement
 * availability and expire, cancellations actually compute their band. A mock that always
 * succeeds teaches the UI nothing, and the states worth building for are the awkward ones.
 */
@Injectable({ providedIn: 'root' })
export class BookingApi {
  /** In-memory stand-in for the hold table. Keyed by hold id. */
  private readonly holds = new Map<string, { lines: ApiHoldLine[]; expiresAt: number }>();
  private readonly bookings = signal<ApiBooking[]>([]);
  private seq = 0;

  /** Round-trip latency, so loading states are exercised rather than assumed away. */
  private static readonly LAG = 220;

  /** How long a hold survives without the client saying anything. */
  static readonly HOLD_TTL_MS = 12 * 60 * 1000;

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  /** Units this caller's own hold is holding, added back so a stepper is not self-capping. */
  private heldByOthers(roomId: string, exceptHoldId?: string): number {
    let n = 0;
    for (const [id, hold] of this.holds) {
      if (id === exceptHoldId || hold.expiresAt < this.now()) continue;
      n += hold.lines.find((l) => l.room_id === roomId)?.quantity ?? 0;
    }
    return n;
  }

  /** Overridable in tests — the mock has no other source of time. */
  protected now(): number {
    return Date.now();
  }

  private toApi(offer: RoomOffer, exceptHoldId?: string): ApiRoomOffer {
    return {
      id: offer.id,
      title: offer.title,
      description: offer.description ?? null,
      room_type: offer.kind,
      capacity: offer.capacity,
      actual_price: offer.actualPrice,
      discounted_price: offer.discountedPrice ?? null,
      images: offer.images,
      bookable: offer.bookable,
      available: Math.max(0, offer.available - this.heldByOthers(offer.id, exceptHoldId)),
    };
  }

  /**
   * `GET /public/hostels/:id/rooms`
   *
   * Rejects a reversed range rather than returning rooms for it. The real endpoint has to do
   * the same — a negative night count prices a stay at less than nothing, and the frontend
   * clamps it to zero, which would quietly show a free booking instead of an error.
   */
  rooms(hostelId: string, checkIn?: string, checkOut?: string): Observable<ApiRoomsResponse> {
    if (!hostelId) return throwError(() => new Error('hostel_id is required'));
    if (checkIn && checkOut && checkOut <= checkIn) {
      return throwError(() => new Error('check_out must be after check_in'));
    }
    return of({
      rooms: ROOM_OFFERS.map((o) => this.toApi(o)),
      billing_frequency_type: 'night' as const,
      success: true,
    }).pipe(delay(BookingApi.LAG));
  }

  /** `POST /api/holds` — authenticated only; an anonymous basket reserves nothing. */
  createHold(req: ApiHoldRequest): Observable<ApiHold> {
    const id = this.id('hold');
    this.holds.set(id, { lines: req.rooms, expiresAt: this.now() + BookingApi.HOLD_TTL_MS });
    return of(this.holdResponse(id)).pipe(delay(BookingApi.LAG));
  }

  /** `PATCH /api/holds/:id` — replaces the held set in one step, never release-then-take. */
  updateHold(holdId: string, req: ApiHoldUpdateRequest): Observable<ApiHold> {
    const existing = this.holds.get(holdId);
    if (!existing) return throwError(() => new Error('hold expired'));
    this.holds.set(holdId, { lines: req.rooms, expiresAt: existing.expiresAt });
    return of(this.holdResponse(holdId)).pipe(delay(BookingApi.LAG));
  }

  /** `DELETE /api/holds/:id` — the fast path. The TTL is what actually guarantees release. */
  releaseHold(holdId: string): Observable<void> {
    this.holds.delete(holdId);
    return of(undefined);
  }

  private holdResponse(id: string): ApiHold {
    const hold = this.holds.get(id);
    return {
      id,
      expires_at: new Date(hold?.expiresAt ?? this.now()).toISOString(),
      rooms: ROOM_OFFERS.map((o) => this.toApi(o, id)),
      success: true,
    };
  }

  /**
   * `POST /api/bookings` — a guest booking rooms from a listing page.
   *
   * **Nothing is paid online.** The guest reviews a summary, confirms, and the booking exists;
   * the money is settled with the hostel. So it lands `unconfirmed` with `deposit: 0`, which
   * is what those two words already mean here — a booking with no money behind it and no
   * cancellation schedule that pays out. The host confirms it, exactly as they confirm the
   * walk-ins they write down themselves.
   *
   * Priced here rather than taken from the request. The basket computes a total to show the
   * guest, but a total that arrives from a browser is a number the guest can edit, and this
   * one decides what a hostel is owed.
   *
   * Availability is checked before anything is created. Overselling a bed is discovered by
   * the person standing in reception, so a booking that cannot be honoured is refused whole
   * rather than part-filled — half a basket is not what anybody agreed to.
   */
  requestBooking(req: ApiBookingRequest): Observable<ApiBooking> {
    if (!req.hostel_id) return throwError(() => new Error('hostel_id is required'));
    if (req.check_out <= req.check_in) {
      return throwError(() => new Error('check_out must be after check_in'));
    }
    if (!req.lines.length) return throwError(() => new Error('Pick at least one room.'));

    const lines: ApiBookingLine[] = [];
    for (const want of req.lines) {
      const offer = ROOM_OFFERS.find((o) => o.id === want.room_id);
      if (!offer) return throwError(() => new Error('That room is no longer available.'));
      const free =
        offer.available -
        this.heldByOthers(offer.id) -
        this.bookedUnits(offer.id, req.check_in, req.check_out);
      if (want.quantity > free) {
        return throwError(
          () => new Error(`Only ${Math.max(0, free)} left of ${offer.title} for those dates.`),
        );
      }
      lines.push({
        room_id: offer.id,
        room_title: offer.title,
        room_type: offer.kind,
        quantity: want.quantity,
        unit_price: offer.discountedPrice ?? offer.actualPrice,
        actual_price: offer.actualPrice,
      });
    }

    // Nights, not dates: a 1–3 Sept stay is two nights. See `hostCreateBooking`.
    const nights = Math.max(
      1,
      Math.round(
        (new Date(req.check_out).getTime() - new Date(req.check_in).getTime()) / 86_400_000,
      ),
    );

    const booking: ApiBooking = {
      id: this.id('bkg'),
      hostel_id: req.hostel_id,
      hostel_name: '',
      check_in: req.check_in,
      check_out: req.check_out,
      guests: req.guests,
      lines,
      total: lines.reduce((n, l) => n + l.unit_price * l.quantity * nights, 0),
      deposit: 0, // nothing is taken online — see above
      status: 'unconfirmed',
      created_at: new Date(this.now()).toISOString(),
      cancellation: null,
    };
    this.bookings.update((all) => [booking, ...all]);
    return of(booking).pipe(delay(BookingApi.LAG));
  }

  /** `GET /api/bookings` — the guest's own. */
  myBookings(): Observable<ApiBooking[]> {
    return of(this.bookings()).pipe(delay(BookingApi.LAG));
  }

  /**
   * `GET /api/bookings/:id/cancellation_quote`
   *
   * Quoted by the server because the band depends on time-to-check-in, and a page left open
   * overnight would otherwise show yesterday's figure and charge today's.
   */
  cancellationQuote(bookingId: string): Observable<ApiCancellationQuote> {
    const booking = this.bookings().find((b) => b.id === bookingId);
    if (!booking) return throwError(() => new Error('not found'));
    const days = this.daysUntil(booking.check_in);
    const percent = chargePercentFor(days);
    if (percent === null) {
      return of({
        cancellable: false,
        reason: 'Bookings cannot be cancelled within 24 hours of check-in.',
        success: true,
      }).pipe(delay(BookingApi.LAG));
    }
    const charge = Math.round(booking.deposit * (percent / 100) * 100) / 100;
    return of({
      charge_percent: percent,
      charge_amount: charge,
      refund_amount: Math.round((booking.deposit - charge) * 100) / 100,
      cancellable: true,
      success: true,
    }).pipe(delay(BookingApi.LAG));
  }

  /** `POST /api/bookings/:id/cancel` */
  cancel(bookingId: string): Observable<ApiBooking> {
    const booking = this.bookings().find((b) => b.id === bookingId);
    if (!booking) return throwError(() => new Error('not found'));
    const percent = chargePercentFor(this.daysUntil(booking.check_in));
    if (percent === null) return throwError(() => new Error('too late to cancel'));
    const charge = Math.round(booking.deposit * (percent / 100) * 100) / 100;
    const updated: ApiBooking = {
      ...booking,
      status: 'cancelled',
      cancellation: {
        cancelled_by: 'guest',
        cancelled_at: new Date(this.now()).toISOString(),
        charge_amount: charge,
        refund_amount: Math.round((booking.deposit - charge) * 100) / 100,
        host_share: Math.round(charge * 0.5 * 100) / 100,
      },
    };
    this.bookings.update((all) => all.map((b) => (b.id === bookingId ? updated : b)));
    return of(updated).pipe(delay(BookingApi.LAG));
  }

  // ── host side ──────────────────────────────────────────────────────────────

  /**
   * `POST /api/host/hostels/:id/bookings` — a walk-in or phone booking, recorded by the host.
   *
   * Lands as `unconfirmed` and takes no deposit: nothing has been paid, so quoting one would
   * put a refundable figure against money that does not exist. `total` is still computed,
   * because the host needs to know what to charge at the desk.
   *
   * Availability is checked the same way the guest path checks it. A host is perfectly capable
   * of double-booking a bed by hand, and the person who finds out is the guest standing in
   * reception — so the mock refuses it here rather than letting the real endpoint be the
   * first thing that ever says no.
   */
  hostCreateBooking(hostelId: string, req: ApiHostBookingRequest): Observable<ApiBooking> {
    if (!hostelId) return throwError(() => new Error('hostel_id is required'));
    if (req.check_out <= req.check_in) {
      return throwError(() => new Error('check_out must be after check_in'));
    }
    if (!req.lines.length) return throwError(() => new Error('Pick at least one room.'));
    if (!req.guest.name.trim()) return throwError(() => new Error('Guest name is required.'));

    const lines: ApiBookingLine[] = [];
    for (const want of req.lines) {
      const offer = ROOM_OFFERS.find((o) => o.id === want.room_id);
      // A room the fixtures do not know is one of the host's own, picked from the real
      // rooms endpoint. There is nothing here to check it against, so it is taken at its
      // word — the alternative is refusing every booking a host actually makes.
      if (!offer) {
        lines.push({
          room_id: want.room_id,
          room_title: '',
          room_type: 'shared',
          quantity: want.quantity,
          unit_price: 0,
          actual_price: 0,
        });
        continue;
      }
      const free = offer.available - this.heldByOthers(offer.id) - this.bookedUnits(offer.id, req.check_in, req.check_out);
      if (want.quantity > free) {
        return throwError(
          () => new Error(`Only ${Math.max(0, free)} left of ${offer.title} for those dates.`),
        );
      }
      const unit = offer.discountedPrice ?? offer.actualPrice;
      lines.push({
        room_id: offer.id,
        room_title: offer.title,
        room_type: offer.kind,
        quantity: want.quantity,
        unit_price: unit,
        actual_price: offer.actualPrice,
      });
    }

    // Nights, not dates. `eachDate` includes both endpoints, so a 1–3 Sept stay lists three
    // days but is billed for two — nobody pays for the morning they leave.
    const nights = Math.max(
      1,
      Math.round(
        (new Date(req.check_out).getTime() - new Date(req.check_in).getTime()) / 86_400_000,
      ),
    );
    const gross = lines.reduce((n, l) => n + l.unit_price * l.quantity * nights, 0);
    // Clamped here as well as in the form: a request can be made without one.
    const total = Math.max(0, gross - Math.max(0, req.discount ?? 0));

    const booking: ApiBooking = {
      id: this.id('bkg'),
      hostel_id: hostelId,
      hostel_name: '',
      check_in: req.check_in,
      check_out: req.check_out,
      guests: req.guests,
      lines,
      total,
      deposit: 0, // nothing taken online — see above
      status: 'unconfirmed',
      created_at: new Date(this.now()).toISOString(),
      cancellation: null,
      guest: {
        name: req.guest.name.trim(),
        email: req.guest.email?.trim() || '',
        phone: req.guest.phone?.trim() || null,
      },
    };
    this.bookings.update((all) => [booking, ...all]);
    return of(booking).pipe(delay(BookingApi.LAG));
  }

  /** Units already booked on `roomId` over a range, so a hand-written booking cannot oversell. */
  private bookedUnits(roomId: string, from: string, to: string): number {
    return this.bookings()
      .filter((b) => b.status !== 'cancelled' && b.check_in < to && b.check_out > from)
      .reduce(
        (n, b) => n + b.lines.filter((l) => l.room_id === roomId).reduce((m, l) => m + l.quantity, 0),
        0,
      );
  }

  /** `GET /api/host/hostels/:id/bookings` — arrivals first, past ones still reachable. */
  hostBookings(hostelId: string): Observable<ApiBooking[]> {
    // The real endpoint is scoped by the route; the mock filters so a host cannot see another
    // property's guests just because both live in the same in-memory list.
    return of(this.bookings().filter((b) => !hostelId || b.hostel_id === hostelId)).pipe(
      delay(BookingApi.LAG),
    );
  }


  /**
   * `GET /api/host/bookings/:id/cancellation_quote`
   *
   * Flat 10% of booking value, unlike the guest's banded schedule. Quoted by the server for
   * the same reason: a host must be charged the figure they were shown, not one a stale page
   * happened to compute.
   */
  hostCancellationQuote(bookingId: string): Observable<ApiHostCancellationQuote> {
    const booking = this.bookings().find((b) => b.id === bookingId);
    if (!booking) return throwError(() => new Error('not found'));
    // An unconfirmed booking took no money and promised the guest nothing, so there is
    // nothing to refund and nothing to penalise. Charging the standard 10% here would bill a
    // host for deleting a row they typed in themselves a minute earlier.
    const penalty = booking.status === 'unconfirmed' ? 0 : booking.total * 0.1;
    return of({
      penalty_amount: Math.round(penalty * 100) / 100,
      // The guest is made whole — everything they paid, which is the deposit.
      refund_amount: booking.deposit,
      success: true,
    }).pipe(delay(BookingApi.LAG));
  }

  /** `POST /api/host/bookings/:id/cancel` */
  hostCancel(bookingId: string): Observable<ApiBooking> {
    const booking = this.bookings().find((b) => b.id === bookingId);
    if (!booking) return throwError(() => new Error('not found'));
    const updated: ApiBooking = {
      ...booking,
      status: 'cancelled',
      cancellation: {
        cancelled_by: 'host',
        cancelled_at: new Date(this.now()).toISOString(),
        charge_amount: 0,
        refund_amount: booking.deposit,
        // Retained by HostelHive rather than passed on: the guest is already whole, and what
        // is being paid for is the damage to a listing the platform vouched for.
        host_penalty: Math.round(booking.total * 0.1 * 100) / 100,
      },
    };
    this.bookings.update((all) => all.map((b) => (b.id === bookingId ? updated : b)));
    return of(updated).pipe(delay(BookingApi.LAG));
  }

  /**
   * `GET /api/host/hostels/:hid/rooms/:rid/calendar`
   *
   * One entry per date in the range, plus the bookings behind them for the hover cards.
   * `booked` against `capacity` is what gives a shared room its third state — a six-bed dorm
   * with four sold is neither free nor full, and two colours cannot say so.
   */
  roomCalendar(
    hostelId: string,
    roomId: string,
    from: string,
    to: string,
  ): Observable<ApiRoomCalendarResponse> {
    const room = ROOM_OFFERS.find((r) => r.id === roomId);
    // A room the fixtures have never heard of came from the host console, whose ids are the
    // backend's. Nothing here can know what is sold in it until the endpoint exists — and an
    // empty calendar looks exactly like a room nobody has booked, which is the one thing this
    // screen must not say by accident. It gets invented stays instead. Goes with the mock.
    if (!room) {
      return of(demoCalendar(hostelId, roomId, from, to)).pipe(delay(BookingApi.LAG));
    }
    const capacity = room.kind === 'shared' ? room.capacity : 1;
    const relevant = this.bookings().filter(
      (b) => b.status === 'confirmed' && b.lines.some((l) => l.room_id === roomId),
    );

    const days: ApiCalendarDay[] = [];
    for (const date of eachDate(from, to)) {
      const touching = relevant.filter((b) => date >= b.check_in && date < b.check_out);
      const booked = touching.reduce(
        (n, b) => n + b.lines.filter((l) => l.room_id === roomId).reduce((m, l) => m + l.quantity, 0),
        0,
      );
      days.push({ date, booked, capacity, booking_ids: touching.map((b) => b.id) });
    }

    return of({ days, bookings: relevant, success: true }).pipe(delay(BookingApi.LAG));
  }

  /** Seeds the mock so the host screens have something to render before any booking is made. */
  seedForDemo(bookings: ApiBooking[]): void {
    this.bookings.set(bookings);
  }

  private daysUntil(checkIn: string): number {
    const [y, m, d] = checkIn.split('-').map(Number);
    const target = new Date(y, m - 1, d).getTime();
    return (target - this.now()) / 86_400_000;
  }
}

/**
 * Every `yyyy-MM-dd` from `from` up to and including `to`.
 *
 * Steps by calendar day rather than adding 86 400 000ms, so a month spanning a clock change
 * does not drift an hour and skip or repeat a date.
 */
export function eachDate(from: string, to: string): string[] {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const pad = (n: number) => String(n).padStart(2, '0');
  const out: string[] = [];
  const end = parse(to);
  for (const cursor = parse(from); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    out.push(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`);
  }
  return out;
}

/** What the frontend already knows and the backend would recompute from the hold. */
export interface BookingContext {
  hostelId: string;
  hostelName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  lines: ApiBookingLine[];
  total: number;
  deposit: number;
}

/**
 * The cancellation schedule, as bands of days remaining before check-in.
 *
 * Written as contiguous windows because the brief phrased each as "before N days", which read
 * literally makes every band apply at once — a cancellation 45 days out is also "before 30".
 * `null` means cancellation is no longer offered.
 */
export function chargePercentFor(daysUntilCheckIn: number): number | null {
  if (daysUntilCheckIn >= 30) return 30;
  if (daysUntilCheckIn >= 15) return 40;
  if (daysUntilCheckIn >= 7) return 60;
  if (daysUntilCheckIn >= 2) return 70;
  if (daysUntilCheckIn >= 1) return 85;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo calendar — remove with the mock, once the real endpoint lands.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A plausible month of stays for a room this file knows nothing about.
 *
 * Derived from the room id and the month rather than drawn at random, and that is the whole
 * point: the calendar re-requests on every arrow press, and a random pattern would rewrite
 * history each time you stepped back a month. The same room in the same month always
 * produces the same stays, in this tab and the next one.
 *
 * Capacity is invented too, for the same reason the stays are — the endpoint that would
 * report it is the endpoint that does not exist yet. It lands between one and six so both a
 * private room and a part-sold dorm are reachable, which is what the calendar's three states
 * need in order to be seen at all.
 */
function demoCalendar(
  hostelId: string,
  roomId: string,
  from: string,
  to: string,
): ApiRoomCalendarResponse {
  const dates = eachDate(from, to);
  if (!dates.length) return { days: [], bookings: [], success: true };

  const month = dates[0].slice(0, 7);
  const capacity = 1 + (hash(roomId) % 6);
  const bookings = demoStays(hostelId, roomId, month, dates, capacity);

  const days: ApiCalendarDay[] = dates.map((date) => {
    const touching = bookings.filter((b) => date >= b.check_in && date < b.check_out);
    const booked = touching.reduce(
      (n, b) => n + b.lines.reduce((m, l) => m + l.quantity, 0),
      0,
    );
    // Never oversell the room it is pretending to describe: two overlapping stays on a
    // one-bed room would report `booked: 2` against `capacity: 1`, and the calendar would
    // render a state that cannot happen.
    return { date, booked: Math.min(booked, capacity), capacity, booking_ids: touching.map((b) => b.id) };
  });

  return { days, bookings, success: true };
}

/** Two or three stays, spaced so the free gaps between them are visible. */
function demoStays(
  hostelId: string,
  roomId: string,
  month: string,
  dates: string[],
  capacity: number,
): ApiBooking[] {
  const seed = hash(`${roomId}:${month}`);
  const out: ApiBooking[] = [];
  const last = dates.length - 1;

  // Start a few days in, so the first of the month is not always booked.
  let i = 1 + (seed % 5);
  for (let n = 0; i < last && n < 3; n++) {
    const nights = 3 + ((seed >> (n * 4 + 2)) % 6);
    const end = Math.min(i + nights, last);
    const quantity = 1 + ((seed >> (n * 3 + 5)) % capacity);
    out.push({
      id: `demo-${roomId}-${month}-${n}`,
      hostel_id: hostelId,
      hostel_name: 'Demo data',
      check_in: dates[i],
      // Exclusive, matching a real check-out: the guest is gone by this date.
      check_out: dates[end],
      guests: quantity,
      lines: [
        {
          room_id: roomId,
          room_title: 'Demo data',
          // The generator has no idea which it is — the room came from the host console,
          // and `shared` is the one that lets a stay hold more than one unit.
          room_type: 'shared',
          quantity,
          unit_price: 0,
          actual_price: 0,
        },
      ],
      // Zero rather than an invented figure: the calendar never shows money, and a made-up
      // total would be a number somebody could quote back at a host.
      total: 0,
      deposit: 0,
      status: 'confirmed',
      created_at: dates[0],
      guest: { name: DEMO_GUESTS[(seed >> (n * 2)) % DEMO_GUESTS.length], email: '' },
    });
    // A gap before the next stay, so the month does not read as one unbroken band.
    i = end + 2 + ((seed >> (n * 5 + 7)) % 5);
  }
  return out;
}

/** Names for the hover card, so it is not a column of "Guest". */
const DEMO_GUESTS = [
  'Ayesha Khan',
  'Bilal Ahmed',
  'Fatima Noor',
  'Hamza Iqbal',
  'Sana Malik',
  'Usman Raza',
];

/** FNV-1a. Small, dependency-free, and stable across reloads — which is all this needs. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
