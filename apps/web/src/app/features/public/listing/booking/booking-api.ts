import { Injectable, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  ApiBooking,
  ApiBookingLine,
  ApiCancellationQuote,
  ApiHold,
  ApiHoldLine,
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
   * `POST /api/bookings` — converts a hold into a booking.
   *
   * Fails whole rather than part-fulfilling when the hold has lapsed. Booking what is left
   * charges for a basket the guest never agreed to, which is a consent problem before it is a
   * UX one.
   */
  book(holdId: string, context: BookingContext): Observable<ApiBooking> {
    const hold = this.holds.get(holdId);
    if (!hold || hold.expiresAt < this.now()) {
      return throwError(() => new Error('Your hold expired before payment completed.'));
    }
    const booking: ApiBooking = {
      id: this.id('bkg'),
      hostel_id: context.hostelId,
      hostel_name: context.hostelName,
      check_in: context.checkIn,
      check_out: context.checkOut,
      guests: context.guests,
      lines: context.lines,
      total: context.total,
      deposit: context.deposit,
      status: 'confirmed',
      created_at: new Date(this.now()).toISOString(),
      cancellation: null,
    };
    this.bookings.update((all) => [booking, ...all]);
    this.holds.delete(holdId);
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
    return of({
      penalty_amount: Math.round(booking.total * 0.1 * 100) / 100,
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
    _hostelId: string,
    roomId: string,
    from: string,
    to: string,
  ): Observable<ApiRoomCalendarResponse> {
    const room = ROOM_OFFERS.find((r) => r.id === roomId);
    const capacity = room ? (room.kind === 'shared' ? room.capacity : 1) : 1;
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
