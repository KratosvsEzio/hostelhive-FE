import { firstValueFrom } from 'rxjs';
import { BookingApi, chargePercentFor } from './booking-api';
import { ApiBookingRequest, ApiHostBookingRequest } from './booking-api.contract';

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
    return new BookingApi();
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
 * A guest booking from a listing page, now that nothing is paid online.
 *
 * The old path took a deposit and turned a hold into a `confirmed` booking. With the payment
 * gone there is no money behind the booking and no cancellation schedule to pay out of, which
 * is precisely what `unconfirmed` already meant here — so a guest's booking now lands in the
 * host's list beside the walk-ins they write down themselves, for the host to confirm.
 */
describe('BookingApi.requestBooking', () => {
  const base: ApiBookingRequest = {
    hostel_id: 'h1',
    check_in: '2026-09-01',
    check_out: '2026-09-03',
    guests: 2,
    lines: [{ room_id: 's-mixed-12', quantity: 2 }],
  };

  function api(): BookingApi {
    return new BookingApi();
  }

  it('lands unconfirmed, with nothing taken', async () => {
    const b = await firstValueFrom(api().requestBooking(base));

    expect(b.status).toBe('unconfirmed');
    expect(b.deposit).toBe(0);
  });

  it('prices the whole stay, not one night', async () => {
    const one = await firstValueFrom(
      api().requestBooking({ ...base, check_out: '2026-09-02' }),
    );
    const two = await firstValueFrom(api().requestBooking(base));

    expect(two.total).toBe(one.total * 2);
  });

  /**
   * The total is computed here, never read from the request.
   *
   * The basket works one out to show the guest, but a figure that arrives from a browser is
   * a figure the guest can edit, and this one decides what a hostel is owed.
   */
  it('ignores any total the caller tries to supply', async () => {
    const b = await firstValueFrom(
      api().requestBooking({ ...base, total: 1 } as ApiBookingRequest & { total: number }),
    );

    expect(b.total).toBeGreaterThan(1);
  });

  it('reaches the hostel’s own booking list', async () => {
    const svc = api();
    await firstValueFrom(svc.requestBooking(base));

    expect((await firstValueFrom(svc.hostBookings('h1'))).length).toBe(1);
    expect((await firstValueFrom(svc.hostBookings('h2'))).length).toBe(0);
  });

  // Whole or not at all. Part-filling gives the guest a stay they never agreed to, and the
  // person who discovers the missing bed is standing in reception.
  it('refuses the basket outright when one room cannot be honoured', async () => {
    const svc = api();
    const greedy = { ...base, lines: [{ room_id: 's-mixed-12', quantity: 999 }] };

    await expect(firstValueFrom(svc.requestBooking(greedy))).rejects.toThrow(/left of/i);
    expect((await firstValueFrom(svc.hostBookings('h1'))).length).toBe(0);
  });

  it('refuses a stay that ends before it starts', async () => {
    await expect(
      firstValueFrom(api().requestBooking({ ...base, check_out: '2026-08-31' })),
    ).rejects.toThrow(/check_out/);
  });

  it('refuses an empty basket', async () => {
    await expect(
      firstValueFrom(api().requestBooking({ ...base, lines: [] })),
    ).rejects.toThrow(/at least one room/i);
  });
});
