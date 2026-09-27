import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiClient } from '@core/api-resource';
import {
  ApiMyBooking,
  MY_BOOKINGS_LIMIT,
  MyBookingsApi,
  stageFor,
  timingOf,
  toGuestBooking,
  wallTime,
} from './my-bookings-api';

/** The row `GET /api/bookings` returned live on 2026-09-27, contact details removed. */
function raw(over: Partial<ApiMyBooking> = {}): ApiMyBooking {
  return {
    id: 'RbNKwO',
    booking_ref: 'HH-2026-LI9V1AQC',
    guest_name: 'hassan Khossa',
    guest_phone: '923000000000',
    guest_email: 'guest@example.com',
    hostel_id: 'MjvuEl',
    checkin_date: '2026-09-30T14:00:00.000+05:00',
    checkout_date: '2026-10-25T11:00:00.000+05:00',
    nights: 25,
    guests: 5,
    total_price: 310000,
    deposit: 31000,
    paid_amount: 0,
    balance_due: 310000,
    notes: 'Testing the notes',
    created_at: '2026-09-27T14:57:46.693+05:00',
    hostel: { id: 'MjvuEl', name: 'Backpacker', area: 'Bahria Orchard, Phare 4', city: 'Lahore' },
    line_items: [
      {
        id: 'giRYjo',
        room_type_id: 'KGJwMC',
        room_type_name: 'King size room',
        guests: 3,
        quantity: 1,
        occupancy_type: 'private_room',
        subtotal: 250000,
      },
      {
        id: 'VPHELB',
        room_type_id: 'MqVuEl',
        room_type_name: 'Dormitory',
        guests: 2,
        quantity: 2,
        occupancy_type: 'shared',
        subtotal: 60000,
      },
    ],
    status: { id: 'sTikBJ', name: 'Pending', slug: 'pending' },
    disposition: { id: 'YUyQxm', name: 'Pending', slug: 'pending' },
    ...over,
  };
}

describe('wallTime', () => {
  it('reads the date and time as written, without converting zones', () => {
    // 14:00 in Lahore is 09:00Z; a browser in any zone must still say 14:00.
    expect(wallTime('2026-09-30T14:00:00.000+05:00')).toEqual({ date: '2026-09-30', time: '14:00' });
  });

  it('keeps the calendar day even when the instant falls on another day in UTC', () => {
    expect(wallTime('2026-10-01T02:00:00.000+05:00').date).toBe('2026-10-01');
  });

  it('tolerates a bare date and nothing at all', () => {
    expect(wallTime('2026-09-30')).toEqual({ date: '2026-09-30', time: '' });
    expect(wallTime(null)).toEqual({ date: '', time: '' });
  });
});

describe('stageFor', () => {
  it('treats the guest-side and host-side spellings of "no room yet" alike', () => {
    expect(stageFor('pending')).toBe('requested');
    expect(stageFor('pending-allotment')).toBe('requested');
  });

  it('maps the rest of the lifecycle', () => {
    expect(stageFor('room-assigned')).toBe('assigned');
    expect(stageFor('checked-in')).toBe('checked-in');
    expect(stageFor('checked-out')).toBe('checked-out');
    expect(stageFor('cancelled')).toBe('cancelled');
  });

  it('answers null for a disposition it has never seen, so the page can show the server name', () => {
    expect(stageFor('on-hold')).toBeNull();
    expect(stageFor(undefined)).toBeNull();
  });
});

describe('toGuestBooking', () => {
  it('maps what the card shows', () => {
    const b = toGuestBooking(raw());

    expect(b.ref).toBe('HH-2026-LI9V1AQC');
    expect(b.guest).toEqual({ name: 'hassan Khossa', phone: '923000000000', email: 'guest@example.com' });
    expect(b.hostel).toEqual({ id: 'MjvuEl', name: 'Backpacker', place: 'Bahria Orchard, Phare 4, Lahore' });
    expect(b.checkIn).toEqual({ date: '2026-09-30', time: '14:00' });
    expect(b.checkOut).toEqual({ date: '2026-10-25', time: '11:00' });
    expect(b.nights).toBe(25);
    expect(b.guests).toBe(5);
    expect([b.total, b.deposit, b.paid, b.due]).toEqual([310000, 31000, 0, 310000]);
    expect(b.notes).toBe('Testing the notes');
    expect(b.bookedOn).toBe('2026-09-27');
    expect(b.stage).toBe('requested');
    expect(b.stageName).toBe('Pending');
  });

  it('tracks the disposition, not the payment status', () => {
    const b = toGuestBooking(
      raw({
        status: { name: 'Paid', slug: 'paid' },
        disposition: { name: 'Room Assigned', slug: 'room-assigned' },
      }),
    );
    expect(b.stage).toBe('assigned');
  });

  it('reads rooms off a private line and beds off a shared one', () => {
    const [king, dorm] = toGuestBooking(raw()).lines;
    expect(king).toEqual({ id: 'giRYjo', name: 'King size room', shared: false, units: 1, guests: 3, subtotal: 250000 });
    expect(dorm).toMatchObject({ name: 'Dormitory', shared: true, units: 2, guests: 2 });
  });

  it('falls back to the guest count when a shared line omits quantity', () => {
    const b = toGuestBooking(
      raw({ line_items: [{ id: 'x', room_type_name: 'Dorm', guests: 3, occupancy_type: 'shared' }] }),
    );
    expect(b.lines[0].units).toBe(3);
  });

  it('survives a row missing the optional parts', () => {
    const b = toGuestBooking({
      id: 'z',
      checkin_date: '2026-09-30T14:00:00.000+05:00',
      checkout_date: '2026-10-01T11:00:00.000+05:00',
      hostel_id: 'H1',
    });
    expect(b.hostel).toEqual({ id: 'H1', name: '', place: '' });
    expect(b.lines).toEqual([]);
    expect(b.total).toBe(0);
    expect(b.stage).toBeNull();
  });
});

describe('timingOf', () => {
  const at = (iso: string) => Date.parse(iso);
  const b = (over: Partial<ApiMyBooking> = {}) => toGuestBooking(raw(over));

  it('is upcoming before check-in', () => {
    expect(timingOf(b(), at('2026-09-29T12:00:00+05:00'))).toBe('upcoming');
  });

  it('is current between check-in and check-out', () => {
    expect(timingOf(b(), at('2026-10-05T12:00:00+05:00'))).toBe('current');
  });

  it('is past once check-out has gone by', () => {
    expect(timingOf(b(), at('2026-10-25T11:00:01+05:00'))).toBe('past');
  });

  it('lets a checked-in stage win over the dates', () => {
    const early = b({ disposition: { slug: 'checked-in' } });
    expect(timingOf(early, at('2026-09-29T12:00:00+05:00'))).toBe('current');
  });

  it('lets a checked-out stage win over the dates', () => {
    const left = b({ disposition: { slug: 'checked-out' } });
    expect(timingOf(left, at('2026-10-05T12:00:00+05:00'))).toBe('past');
  });

  it('never calls a cancelled stay current', () => {
    const off = b({ disposition: { slug: 'cancelled' } });
    expect(timingOf(off, at('2026-09-29T12:00:00+05:00'))).toBe('upcoming');
    expect(timingOf(off, at('2026-10-05T12:00:00+05:00'))).toBe('past');
  });
});

describe('MyBookingsApi', () => {
  it('asks for one page and maps the envelope', () => {
    const get = vi.fn().mockReturnValue(
      of({
        bookings: [raw()],
        pagination: { current_page: 1, next_page: 2, total_pages: 2, total_count: 21 },
        success: true,
      }),
    );
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });

    let result: unknown;
    TestBed.inject(MyBookingsApi)
      .list(1)
      .subscribe((r) => (result = r));

    expect(get).toHaveBeenCalledWith('/api/bookings', { page: 1, limit: MY_BOOKINGS_LIMIT });
    expect(result).toMatchObject({
      bookings: [{ id: 'RbNKwO', ref: 'HH-2026-LI9V1AQC' }],
      page: { page: 1, total: 21, hasNextPage: true },
    });
  });

  it('reads an empty answer as no bookings', () => {
    const get = vi.fn().mockReturnValue(of({ success: true }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });

    let result: unknown;
    TestBed.inject(MyBookingsApi)
      .list()
      .subscribe((r) => (result = r));

    expect(result).toMatchObject({ bookings: [], page: { total: 0, hasNextPage: false } });
  });

  it('reads one booking out of its envelope', () => {
    const get = vi.fn().mockReturnValue(of({ booking: raw(), success: true }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });

    let result: unknown;
    TestBed.inject(MyBookingsApi)
      .get('RbNKwO')
      .subscribe((r) => (result = r));

    expect(get).toHaveBeenCalledWith('/api/bookings/RbNKwO');
    expect(result).toMatchObject({ id: 'RbNKwO', hostel: { name: 'Backpacker' } });
  });

  it('errors on an envelope with no booking, rather than emitting blanks', () => {
    const get = vi.fn().mockReturnValue(of({ success: true }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });

    let failed = false;
    TestBed.inject(MyBookingsApi)
      .get('gone')
      .subscribe({ error: () => (failed = true) });

    expect(failed).toBe(true);
  });

  it('escapes the id into the path', () => {
    const get = vi.fn().mockReturnValue(of({ booking: raw() }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });

    TestBed.inject(MyBookingsApi).get('a/b').subscribe();

    expect(get).toHaveBeenCalledWith('/api/bookings/a%2Fb');
  });
});
