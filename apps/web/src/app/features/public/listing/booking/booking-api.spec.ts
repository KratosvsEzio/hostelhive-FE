import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom, of } from 'rxjs';
import { ApiClient } from '@core/api-resource';
import { BasketLine } from './room-offer';
import { BookingApi, chargePercentFor } from './booking-api';
import { ApiHostBookingRequest } from './booking-api.contract';

/** Records the one real call this service makes. Everything else on it is still in memory. */
class ApiClientStub {
  url = '';
  body: unknown = null;

  post<T>(url: string, body: unknown): Observable<T> {
    this.url = url;
    this.body = body;
    return of(undefined as T);
  }
}

/**
 * Through the injector rather than `new`, now that one method reaches for `ApiClient`.
 *
 * The rest of the service is unchanged and still answers from memory — only `createBooking`
 * has an endpoint behind it.
 */
function makeApi(): { api: BookingApi; http: ApiClientStub } {
  TestBed.resetTestingModule();
  const http = new ApiClientStub();
  TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: http }] });
  return { api: TestBed.inject(BookingApi), http };
}

/**
 * The cancellation schedule from section 07 of the PRD.
 *
 * Tested as a pure function rather than through the service because these five bands are the
 * part a guest disputes, and the boundaries are where a dispute lands — the brief phrased them
 * as "before N days", which read literally makes every band apply at once.
 */
describe('chargePercentFor', () => {
  it('charges least the earliest', () => {
    expect(chargePercentFor(90)).toBe(30);
    expect(chargePercentFor(30)).toBe(30);
  });

  it('steps up as check-in approaches', () => {
    expect(chargePercentFor(29)).toBe(40);
    expect(chargePercentFor(15)).toBe(40);
    expect(chargePercentFor(14)).toBe(60);
    expect(chargePercentFor(7)).toBe(60);
    expect(chargePercentFor(6)).toBe(70);
    expect(chargePercentFor(2)).toBe(70);
    expect(chargePercentFor(1)).toBe(85);
  });

  // Contiguous windows, no overlap and no gap — the boundary belongs to the milder band.
  it('puts each boundary in exactly one band', () => {
    const bands = [30, 15, 7, 2, 1];
    for (const edge of bands) {
      expect(chargePercentFor(edge)).not.toBe(chargePercentFor(edge - 0.01));
    }
  });

  it('refuses inside 24 hours', () => {
    expect(chargePercentFor(0.99)).toBeNull();
    expect(chargePercentFor(0)).toBeNull();
    // Already started: still not cancellable, rather than wrapping to the mildest band.
    expect(chargePercentFor(-3)).toBeNull();
  });

  // Never charges more the further out you are — the schedule has to be monotonic or a guest
  // is rewarded for cancelling later.
  it('never gets cheaper as check-in nears', () => {
    let previous = 0;
    for (let d = 40; d >= 1; d -= 0.5) {
      const percent = chargePercentFor(d) ?? 100;
      expect(percent).toBeGreaterThanOrEqual(previous);
      previous = percent;
    }
  });
});

/**
 * The booking a host records for a walk-in.
 *
 * Worth testing through the service rather than as a pure function: the parts that can go
 * wrong are the ones that touch stored state — what status it lands in, whether it can
 * oversell a bed that is already spoken for, and whether cancelling it bills the host for a
 * row they typed in themselves.
 */
describe('BookingApi.hostCreateBooking', () => {
  const base: ApiHostBookingRequest = {
    check_in: '2026-09-01',
    check_out: '2026-09-03',
    guests: 2,
    lines: [{ room_id: 's-mixed-12', quantity: 2 }],
    guest: { name: 'Ayesha' },
  };

  function api(): BookingApi {
    return makeApi().api;
  }

  it('records it as unconfirmed, with no deposit', async () => {
    const b = await firstValueFrom(api().hostCreateBooking('h1', base));

    expect(b.status).toBe('unconfirmed');
    expect(b.deposit).toBe(0);
    expect(b.guest?.name).toBe('Ayesha');
  });

  it('prices the whole stay, not one night', async () => {
    const one = await firstValueFrom(
      api().hostCreateBooking('h1', { ...base, check_out: '2026-09-02' }),
    );
    const two = await firstValueFrom(api().hostCreateBooking('h1', base));

    expect(two.total).toBe(one.total * 2);
  });

  it('shows up in that hostel’s list and not another’s', async () => {
    const svc = api();
    await firstValueFrom(svc.hostCreateBooking('h1', base));

    expect((await firstValueFrom(svc.hostBookings('h1'))).length).toBe(1);
    expect((await firstValueFrom(svc.hostBookings('h2'))).length).toBe(0);
  });

  it('refuses a range that ends before it starts', async () => {
    await expect(
      firstValueFrom(api().hostCreateBooking('h1', { ...base, check_out: '2026-08-30' })),
    ).rejects.toThrow(/check_out/);
  });

  it('refuses a booking with no rooms on it', async () => {
    await expect(
      firstValueFrom(api().hostCreateBooking('h1', { ...base, lines: [] })),
    ).rejects.toThrow(/at least one room/i);
  });

  it('refuses a nameless guest', async () => {
    await expect(
      firstValueFrom(api().hostCreateBooking('h1', { ...base, guest: { name: '  ' } })),
    ).rejects.toThrow(/name/i);
  });

  // The reason availability is checked on a host-facing form at all: the person who finds
  // out about a double-booked bed is the guest standing in reception.
  it('refuses to oversell a room', async () => {
    await expect(
      firstValueFrom(
        api().hostCreateBooking('h1', {
          ...base,
          lines: [{ room_id: 's-mixed-8', quantity: 99 }],
        }),
      ),
    ).rejects.toThrow(/only/i);
  });

  it('counts an existing booking against what is left', async () => {
    const svc = api();
    await firstValueFrom(
      svc.hostCreateBooking('h1', { ...base, lines: [{ room_id: 's-mixed-8', quantity: 2 }] }),
    );

    await expect(
      firstValueFrom(
        svc.hostCreateBooking('h1', { ...base, lines: [{ room_id: 's-mixed-8', quantity: 1 }] }),
      ),
    ).rejects.toThrow(/only 0 left/i);
  });

  it('leaves a non-overlapping range alone', async () => {
    const svc = api();
    await firstValueFrom(
      svc.hostCreateBooking('h1', { ...base, lines: [{ room_id: 's-mixed-8', quantity: 2 }] }),
    );

    const later = await firstValueFrom(
      svc.hostCreateBooking('h1', {
        ...base,
        check_in: '2026-10-01',
        check_out: '2026-10-03',
        lines: [{ room_id: 's-mixed-8', quantity: 2 }],
      }),
    );
    expect(later.status).toBe('unconfirmed');
  });

  it('costs the host nothing to cancel', async () => {
    const svc = api();
    const b = await firstValueFrom(svc.hostCreateBooking('h1', base));
    const quote = await firstValueFrom(svc.hostCancellationQuote(b.id));

    expect(quote.penalty_amount).toBe(0);
    expect(quote.refund_amount).toBe(0);
  });
});


/**
 * A guest booking from a listing page — the one call on this service that leaves the browser.
 *
 * What is asserted is the request, not the answer. A booking that goes out with the wrong
 * shape does not fail loudly: the server takes it, and the guest finds out at reception that
 * they booked two rooms for eight people instead of four, or arrived a day early. The payload
 * is built by `toBookingRequest` and tested in full there; this checks it is that payload,
 * sent to that URL.
 */
describe('BookingApi.createBooking', () => {
  const LINE: BasketLine = {
    roomId: 'KGJwMC',
    title: 'King size room',
    kind: 'private',
    quantity: 2,
    unitPrice: 10_000,
    actualPrice: 12_000,
    capacity: 4,
    guests: 4,
  };

  function send() {
    const { api, http } = makeApi();
    api
      .createBooking({
        hostelId: 'MjvuEl',
        hostelCountry: 'Pakistan',
        checkIn: new Date(2026, 8, 20),
        checkOut: new Date(2026, 8, 23),
        lines: [LINE],
        guest: { name: 'Ali Raza', phone: '923001234567', email: 'ali@example.com' },
      })
      .subscribe();
    return http;
  }

  it('posts to the guest bookings endpoint', () => {
    expect(send().url).toBe('/api/bookings');
  });

  it('sends the hostel outside the booking and everything else inside it', () => {
    const body = send().body as { hostel_id: string; booking: Record<string, unknown> };

    expect(body.hostel_id).toBe('MjvuEl');
    expect(Object.keys(body.booking).sort()).toEqual([
      'checkin_date',
      'checkout_date',
      'guest_email',
      'guest_name',
      'guest_phone',
      'line_items',
    ]);
  });

  // 2pm at the hostel, not 2pm in the browser — five hours apart in the home market.
  it('dates the stay on the hostel’s clock', () => {
    const body = send().body as { booking: { checkin_date: string; checkout_date: string } };

    expect(body.booking.checkin_date).toBe('2026-09-20T09:00:00.000Z');
    expect(body.booking.checkout_date).toBe('2026-09-23T06:00:00.000Z');
  });

  it('sends the basket as line items', () => {
    const body = send().body as { booking: { line_items: unknown[] } };

    expect(body.booking.line_items).toEqual([
      { room_type_id: 'KGJwMC', guests: 4, quantity: 2 },
    ]);
  });
});
