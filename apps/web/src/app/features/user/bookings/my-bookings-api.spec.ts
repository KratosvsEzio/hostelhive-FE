import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiClient } from '@core/api-resource';
import {
  ApiMyBooking,
  MY_BOOKINGS_LIMIT,
  MyBookingsApi,
  canCancel,
  canEdit,
  withinChangeCutoff,
  mapsUrl,
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
    expect(stageFor('confirmed')).toBe('confirmed');
    expect(stageFor('checked-in')).toBe('checked-in');
    expect(stageFor('checked-out')).toBe('checked-out');
    expect(stageFor('cancelled')).toBe('cancelled');
    expect(stageFor('no-show')).toBe('no-show');
  });

  it("reads the host side's older names too", () => {
    expect(stageFor('room-assigned')).toBe('confirmed');
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
    expect(b.hostel).toMatchObject({ id: 'MjvuEl', name: 'Backpacker', place: 'Bahria Orchard, Phare 4, Lahore' });
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
        disposition: { name: 'Confirmed', slug: 'confirmed' },
      }),
    );
    expect(b.stage).toBe('confirmed');
  });

  it('reads rooms off a private line and beds off a shared one', () => {
    const [king, dorm] = toGuestBooking(raw()).lines;
    expect(king).toEqual({ id: 'giRYjo', roomTypeId: 'KGJwMC', name: 'King size room', shared: false, units: 1, guests: 3, subtotal: 250000 });
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
    expect(b.hostel).toEqual({ id: 'H1', name: '', place: '', address: '', lat: null, lng: null });
    expect(b.lines).toEqual([]);
    expect(b.total).toBe(0);
    expect(b.stage).toBeNull();
  });
});

/**
 * `GET /api/bookings/:id` for the same booking, live 2026-09-27 — a different serializer:
 * amounts are decimal strings, `nights` and `balance_due` are absent, and each line's name
 * is nested under `room_type`. Read as-is, it drew a detail page of zeroes.
 */
const DETAIL = {
  id: 'RbNKwO',
  checkin_date: '2026-09-30T14:00:00.000+05:00',
  checkout_date: '2026-10-25T11:00:00.000+05:00',
  guests: 5,
  total_price: '310000.0',
  deposit: '31000.0',
  paid_amount: '0.0',
  currency: 'PKR',
  hostel: { name: 'Backpacker', area: 'Bahria Orchard, Phare 4', city: 'Lahore', id: 'MjvuEl' },
  booking_ref: 'HH-2026-LI9V1AQC',
  guest_name: 'hassan Khossa',
  notes: 'Testing the notes',
  created_at: '2026-09-27T14:57:46.693+05:00',
  line_items: [
    {
      id: 'giRYjo',
      guests: 3,
      quantity: 1,
      occupancy_type: 'private_room',
      unit_price: '10000.0',
      subtotal: '250000.0',
      room_type: { id: 'KGJwMC', name: 'King size room', occupancy_type: 'private_room', capacity: 4 },
    },
    {
      id: 'VPHELB',
      guests: 2,
      quantity: 2,
      occupancy_type: 'shared',
      unit_price: '1200.0',
      subtotal: '60000.0',
      room_type: { id: 'MqVuEl', name: 'Dormitory', occupancy_type: 'shared', capacity: 12 },
    },
  ],
  status: { id: 'sTikBJ', name: 'Pending', slug: 'pending' },
  disposition: { id: 'YUyQxm', name: 'Pending', slug: 'pending' },
} as ApiMyBooking;

describe('mapsUrl', () => {
  it('points at the coordinates when there are some', () => {
    expect(mapsUrl({ lat: 31.31401, lng: 74.23497, query: 'ignored' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=31.31401,74.23497',
    );
  });

  it('searches the query, encoded, when there are none', () => {
    expect(mapsUrl({ lat: null, lng: null, query: 'Backpacker, Bahria Orchard & Lahore' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Backpacker%2C%20Bahria%20Orchard%20%26%20Lahore',
    );
  });

  it('is empty with nothing to point at', () => {
    expect(mapsUrl({ lat: null, lng: null, query: '  ' })).toBe('');
  });
});

describe('toGuestBooking on the single-booking payload', () => {
  it('reads the street address and the coordinates, which arrive as strings', () => {
    const b = toGuestBooking({
      ...DETAIL,
      hostel: { ...DETAIL.hostel, address_1: ' 355-G1, Bahria Orchard ', latitude: '31.31401', longitude: '74.23497' },
    });
    expect(b.hostel).toMatchObject({ address: '355-G1, Bahria Orchard', lat: 31.31401, lng: 74.23497 });
  });

  it('refuses coordinates that cannot be a place', () => {
    const at = (latitude: string, longitude: string) =>
      toGuestBooking({ ...DETAIL, hostel: { ...DETAIL.hostel, latitude, longitude } }).hostel;
    expect(at('0', '0')).toMatchObject({ lat: null, lng: null });
    expect(at('95', '74')).toMatchObject({ lat: null, lng: null });
    expect(at('', '74')).toMatchObject({ lat: null, lng: null });
  });

  it('has no coordinates from the list, which does not send them', () => {
    expect(toGuestBooking(raw()).hostel).toMatchObject({ address: '', lat: null, lng: null });
  });

  it('reads amounts sent as decimal strings', () => {
    const b = toGuestBooking(DETAIL);
    expect([b.total, b.deposit, b.paid]).toEqual([310000, 31000, 0]);
  });

  it('derives what the endpoint omits: nights from the dates, due from total less paid', () => {
    const b = toGuestBooking(DETAIL);
    expect(b.nights).toBe(25);
    expect(b.due).toBe(310000);
  });

  it('reads each line name from the nested room type', () => {
    const lines = toGuestBooking(DETAIL).lines;
    expect(lines.map((l) => [l.name, l.units, l.subtotal])).toEqual([
      ['King size room', 1, 250000],
      ['Dormitory', 2, 60000],
    ]);
  });

  it('draws the same booking the list does', () => {
    const fromList = toGuestBooking(raw());
    const fromDetail = toGuestBooking(DETAIL);
    for (const key of ['total', 'deposit', 'paid', 'due', 'nights', 'guests', 'ref'] as const) {
      expect(fromDetail[key]).toEqual(fromList[key]);
    }
    expect(fromDetail.lines.map((l) => l.name)).toEqual(fromList.lines.map((l) => l.name));
    expect(fromDetail.hostel).toEqual(fromList.hostel);
  });

  it('never reports more due than is owed', () => {
    const b = toGuestBooking({ ...DETAIL, paid_amount: '400000.0' });
    expect(b.due).toBe(0);
  });

  it('treats a blank or non-numeric amount as zero rather than NaN', () => {
    const b = toGuestBooking({ ...DETAIL, total_price: '', deposit: 'n/a' });
    expect(b.total).toBe(0);
    expect(b.deposit).toBe(0);
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

describe('what the guest may change', () => {
  const withStatus = (slug: string) => toGuestBooking(raw({ status: { name: slug, slug } }));

  it('reads the status group off the row', () => {
    expect(withStatus('confirmed').statusSlug).toBe('confirmed');
    expect(toGuestBooking(raw({ status: null })).statusSlug).toBe('');
  });

  // raw() checks in at 14:00 Lahore on 30 Sep 2026 — 09:00Z.
  const WEEK_BEFORE = Date.parse('2026-09-23T09:00:00Z');
  const JUST_OVER_3_DAYS = Date.parse('2026-09-27T08:59:00Z');
  const EXACTLY_3_DAYS = Date.parse('2026-09-27T09:00:00Z');
  const DAY_BEFORE = Date.parse('2026-09-29T09:00:00Z');

  it('changes and cancels a pending booking at any time — the hostel has not committed', () => {
    for (const now of [WEEK_BEFORE, DAY_BEFORE]) {
      expect(canEdit(withStatus('pending'), now)).toBe(true);
      expect(canCancel(withStatus('pending'), now)).toBe(true);
    }
  });

  it('changes and cancels a confirmed booking only while check-in is more than 3 days away', () => {
    const b = withStatus('confirmed');
    expect(canEdit(b, WEEK_BEFORE)).toBe(true);
    expect(canCancel(b, WEEK_BEFORE)).toBe(true);
    expect(canEdit(b, JUST_OVER_3_DAYS)).toBe(true);
    // The server's `checkin_date <= 3.days.from_now` refuses at exactly three days.
    expect(canEdit(b, EXACTLY_3_DAYS)).toBe(false);
    expect(canCancel(b, EXACTLY_3_DAYS)).toBe(false);
    expect(canEdit(b, DAY_BEFORE)).toBe(false);
  });

  it('says a confirmed booking is inside the cutoff, and never a pending one', () => {
    expect(withinChangeCutoff(withStatus('confirmed'), DAY_BEFORE)).toBe(true);
    expect(withinChangeCutoff(withStatus('confirmed'), WEEK_BEFORE)).toBe(false);
    expect(withinChangeCutoff(withStatus('pending'), DAY_BEFORE)).toBe(false);
  });

  it('changes nothing once it is checked in, over, cancelled or a no-show', () => {
    for (const slug of ['checked-in', 'checked-out', 'cancelled', 'no-show', '']) {
      expect(canEdit(withStatus(slug), WEEK_BEFORE)).toBe(false);
      expect(canCancel(withStatus(slug), WEEK_BEFORE)).toBe(false);
    }
  });

  it('follows the status, not the disposition beside it', () => {
    // A `pending-payment` disposition sits under the `pending` status and is still editable.
    const b = toGuestBooking(
      raw({ status: { slug: 'pending' }, disposition: { slug: 'pending-payment', name: 'Pending payment' } }),
    );
    expect(canEdit(b)).toBe(true);
  });
});

describe('MyBookingsApi — changing a booking', () => {
  function api(response: unknown = { booking: raw({ notes: 'changed' }), success: true }) {
    const patch = vi.fn().mockReturnValue(of(response));
    const post = vi.fn().mockReturnValue(of(response));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { patch, post } }] });
    return { svc: TestBed.inject(MyBookingsApi), patch, post };
  }

  const DETAILS = { guestName: ' Hassan ', guestPhone: '+92 300 1234567', guestEmail: ' a@b.co ', notes: ' late ' };

  it('sends only the details when the stay did not change — trimmed, phone as digits', () => {
    const { svc, patch } = api();
    let result: unknown;
    svc.update('RbNKwO', DETAILS).subscribe((r) => (result = r));

    expect(patch).toHaveBeenCalledWith('/api/bookings/RbNKwO', {
      booking: { guest_name: 'Hassan', guest_phone: '923001234567', guest_email: 'a@b.co', notes: 'late' },
    });
    const body = patch.mock.calls[0][1] as { booking: Record<string, unknown> };
    for (const key of ['checkin_date', 'checkout_date', 'guests', 'line_items']) {
      expect(body.booking).not.toHaveProperty(key);
    }
    expect(result).toMatchObject({ id: 'RbNKwO', notes: 'changed' });
  });

  it('sends an emptied note, since clearing it is a change', () => {
    const { svc, patch } = api();
    svc.update('RbNKwO', { ...DETAILS, notes: '   ' }).subscribe();
    expect((patch.mock.calls[0][1] as { booking: { notes: string } }).booking.notes).toBe('');
  });

  it("sends new dates and rooms in create's shape, at the hostel's check-in and check-out hours", () => {
    const { svc, patch } = api();
    svc
      .update('RbNKwO', {
        ...DETAILS,
        stay: {
          checkIn: new Date(2026, 9, 1),
          checkOut: new Date(2026, 9, 4),
          hostelCountry: 'Pakistan',
          lines: [
            { roomId: 'KGJwMC', title: 'King size room', kind: 'private', quantity: 2, unitPrice: 10000, actualPrice: 12000, capacity: 4, guests: 5 },
            { roomId: 'MqVuEl', title: 'Dormitory', kind: 'shared', quantity: 2, unitPrice: 1200, actualPrice: 2000, capacity: 12, guests: 2 },
          ],
        },
      })
      .subscribe();

    const { booking } = patch.mock.calls[0][1] as { booking: Record<string, unknown> };
    // 14:00 and 11:00 in Lahore (UTC+5), whatever zone the browser is in.
    expect(booking['checkin_date']).toBe('2026-10-01T09:00:00.000Z');
    expect(booking['checkout_date']).toBe('2026-10-04T06:00:00.000Z');
    expect(booking['line_items']).toEqual([
      { room_type_id: 'KGJwMC', guests: 5, quantity: 2, occupancy_type: 'private_room' },
      // A shared line's bed count is its guests, so it carries no quantity.
      { room_type_id: 'MqVuEl', guests: 2, occupancy_type: 'shared' },
    ]);
    // The headcount is the server's sum of the lines, never sent on its own.
    expect(booking).not.toHaveProperty('guests');
    expect(booking['guest_name']).toBe('Hassan');
  });

  it('cancels through mark_as_cancelled and returns the stored booking', () => {
    const { svc, post } = api({ booking: raw({ disposition: { slug: 'cancelled', name: 'Cancelled' } }) });
    let result: { stage?: string | null } | undefined;
    svc.cancel('RbNKwO').subscribe((r) => (result = r));

    expect(post).toHaveBeenCalledWith('/api/bookings/RbNKwO/mark_as_cancelled', {});
    expect(result?.stage).toBe('cancelled');
  });

  it('errors when the reply carries no booking', () => {
    const { svc } = api({ success: true });
    let failed = false;
    svc.cancel('RbNKwO').subscribe({ error: () => (failed = true) });
    expect(failed).toBe(true);
  });
});
