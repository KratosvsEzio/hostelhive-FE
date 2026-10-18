import { HttpContext } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Invoice } from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';
import { ApiClientRecorder, RecordedApiCall, suppressesErrorToast } from '@app/testing/api-client-recorder';
import {
  ApiHostBooking,
  HostBooking,
  HostBookingPage,
  HostBookingsApi,
  confirmationLink,
  nightsBetween,
  toHostBooking,
} from './host-bookings-api';

function raw(over: Partial<ApiHostBooking> = {}): ApiHostBooking {
  return {
    id: 'vKkMIE',
    booking_ref: 'HH-2026-00009',
    guest_name: 'Andy',
    guest_phone: '+13449434559',
    guest_email: 'andy@andy.com',
    checkin_date: '2026-08-26T22:44:01.867+05:00',
    checkout_date: '2026-09-02T22:44:01.867+05:00',
    nights: 7,
    guests: 4,
    total_price: 616000,
    paid_amount: 0,
    balance_due: 616000,
    room_type: { id: 'TPVAMD', name: 'Dormitory', occupancy_type: 'shared', capacity: 15 },
    status: { id: 'xCZrhs', name: 'Paid', slug: 'paid' },
    disposition: { id: 'HJSTkZ', name: 'Pending Allotment', slug: 'pending-allotment' },
    ...over,
  };
}

describe('toHostBooking', () => {
  it('maps the fields the table and the ledger read', () => {
    const b = toHostBooking(raw());

    expect(b.id).toBe('vKkMIE');
    expect(b.ref).toBe('HH-2026-00009');
    expect(b.guest.name).toBe('Andy');
    expect(b.roomType.name).toBe('Dormitory');
    expect(b.total).toBe(616000);
    expect(b.balanceDue).toBe(616000);
  });

  /**
   * The one that would be invisible in Karachi and wrong everywhere west of it.
   *
   * `checkin_date` is a 22:44 local timestamp with a +05:00 offset. Parsing it into a `Date`
   * and reading `getDate()` re-reads that instant in the *browser's* zone — still the 26th in
   * Lahore, but 17:44 UTC, and so the 25th for anyone in the Americas. The server already
   * wrote the day it means; slicing keeps it.
   */
  it('takes the calendar day off the wire rather than re-deriving it', () => {
    const b = toHostBooking(raw());

    expect(b.checkIn).toBe('2026-08-26');
    expect(b.checkOut).toBe('2026-09-02');
  });

  it('separates disposition from payment status', () => {
    const b = toHostBooking(raw());

    // `status` is where the money is; `disposition` is where the stay is. The calendar counts
    // the second, and reading the first would give a calendar of payment states.
    expect(b.status.slug).toBe('paid');
    expect(b.disposition.slug).toBe('pending-allotment');
    expect(b.disposition.name).toBe('Pending Allotment');
  });

  it('trusts the server’s night count', () => {
    expect(toHostBooking(raw({ nights: 7 })).nights).toBe(7);
  });

  it('derives nights only when the server omits them', () => {
    expect(toHostBooking(raw({ nights: null })).nights).toBe(7);
  });

  // A search document, not a serializer — any field can be absent.
  it('survives a record with nothing but an id', () => {
    const b = toHostBooking({ id: 'x' });

    expect(b.guest.name).toBe('Guest');
    expect(b.roomType.name).toBe('—');
    expect(b.disposition.slug).toBe('');
    expect(b.nights).toBe(0);
    expect(b.total).toBe(0);
  });

  it('falls back to a readable name rather than an empty cell', () => {
    expect(toHostBooking(raw({ guest_name: '   ' })).guest.name).toBe('Guest');
  });
});

describe('nightsBetween', () => {
  it('counts nights, not dates — nobody pays for the morning they leave', () => {
    expect(nightsBetween('2026-08-26', '2026-09-02')).toBe(7);
  });

  // Parsed at local midnight on both sides, so a clock change cannot add or drop a night.
  it('is unaffected by a daylight-saving boundary', () => {
    expect(nightsBetween('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('returns zero for a missing or reversed range', () => {
    expect(nightsBetween('', '2026-09-02')).toBe(0);
    expect(nightsBetween('2026-09-02', '2026-08-26')).toBe(0);
  });
});

/**
 * The day filter, which is the part that fails quietly.
 *
 * A wrong param name is not an error: the server ignores what it does not recognise and
 * returns the whole hostel's bookings, so the ledger fills with plausible rows for the wrong
 * day and nothing on screen says so. These pin the shape the request actually goes out in.
 */
describe('HostBookingsApi.bookingsOn', () => {
  /** A stand-in ApiClient that records the request instead of making it. */
  function capture() {
    const calls: { path: string; params?: Record<string, unknown> }[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ApiClient,
          useValue: {
            get: (path: string, params?: Record<string, unknown>) => {
              calls.push({ path, params });
              return of({ bookings: [], success: true });
            },
          },
        },
      ],
    });
    return { api: TestBed.inject(HostBookingsApi), calls };
  }

  // Plain days: the server applies the hostel's own day boundaries (Trello #81).
  it('asks for the day as a plain date on both ends', () => {
    const { api, calls } = capture();
    api.bookingsOn('nHelLt', '2026-08-24').subscribe();

    const p = calls[0].params as Record<string, unknown>;
    expect(p['f[checkin_date][gte]']).toBe('2026-08-24');
    expect(p['f[checkin_date][lte]']).toBe('2026-08-24');
  });

  /**
   * The endpoint pages at ten, and these cards are meant to be *all* of the day's pending
   * allotments. Without a size the ledger would show the first ten while the lane count
   * directly above it kept reading the true number.
   */
  it('asks for more than one default page of arrivals', () => {
    const { api, calls } = capture();
    api.bookingsOn('nHelLt', '2026-08-24').subscribe();

    const p = calls[0].params as Record<string, number>;
    expect(p['page']).toBe(1);
    expect(p['limit']).toBeGreaterThan(10);
  });

  // Both bounds are the same day: one date in, one day out.
  it('asks for one day, not a range that runs to the next', () => {
    const { api, calls } = capture();
    api.bookingsOn('nHelLt', '2026-12-31').subscribe();

    const p = calls[0].params as Record<string, string>;
    expect(p['f[checkin_date][gte]'].slice(0, 10)).toBe('2026-12-31');
    expect(p['f[checkin_date][lte]'].slice(0, 10)).toBe('2026-12-31');
  });

  it('hits the list endpoint, not the month aggregation', () => {
    const { api, calls } = capture();
    api.bookingsOn('nHelLt', '2026-08-24').subscribe();

    expect(calls[0].path).toBe('/api/host/hostels/nHelLt/bookings');
    expect(calls[0].path).not.toContain('booking_calender');
  });
});

/**
 * One room's month, asked of the server two ways.
 *
 * `room.id` is the first room a party was checked into, so a booking whose second room is
 * this one is only reachable through `occupied_room_ids`. The two answers overlap whenever a
 * party's first room is this one, and a booking drawn twice would double its beds.
 */
describe('HostBookingsApi.bookingsInRoom', () => {
  function capture(byRoom: ApiHostBooking[], byOccupancy: ApiHostBooking[]) {
    const calls: { path: string; params: Record<string, unknown> }[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ApiClient,
          useValue: {
            get: (path: string, params: Record<string, unknown>) => {
              calls.push({ path, params });
              const bookings = 'f[occupied_room_ids]' in params ? byOccupancy : byRoom;
              return of({ bookings, success: true });
            },
          },
        },
      ],
    });
    return { api: TestBed.inject(HostBookingsApi), calls };
  }

  it('asks by first room and by occupied room, over the same window', () => {
    const { api, calls } = capture([], []);
    api.bookingsInRoom('nHelLt', 'R101', '2026-10-01', '2026-10-31').subscribe();

    expect(calls).toHaveLength(2);
    const window = { 'f[checkin_date][lte]': '2026-10-31', 'f[checkout_date][gte]': '2026-10-01' };
    expect(calls.map((c) => c.path)).toEqual([
      '/api/host/hostels/nHelLt/bookings',
      '/api/host/hostels/nHelLt/bookings',
    ]);
    expect(calls[0].params).toMatchObject({ 'f[room.id]': 'R101', ...window });
    expect(calls[0].params).not.toHaveProperty('f[occupied_room_ids]');
    expect(calls[1].params).toMatchObject({ 'f[occupied_room_ids]': 'R101', ...window });
    expect(calls[1].params).not.toHaveProperty('f[room.id]');
  });

  it('returns the union, each booking once', () => {
    const { api } = capture(
      [raw({ id: 'first' }), raw({ id: 'both' })],
      [raw({ id: 'both' }), raw({ id: 'second' })],
    );
    let ids: string[] = [];
    api.bookingsInRoom('nHelLt', 'R101', '2026-10-01', '2026-10-31').subscribe((b) => (ids = b.map((x) => x.id)));

    expect(ids).toEqual(['first', 'both', 'second']);
  });

  it('asks nothing without a hostel or a room', () => {
    const { api, calls } = capture([], []);
    let out: HostBooking[] | undefined;
    api.bookingsInRoom('nHelLt', '', '2026-10-01', '2026-10-31').subscribe((b) => (out = b));

    expect(calls).toHaveLength(0);
    expect(out).toEqual([]);
  });
});

/**
 * The list request, which fails quietly in the same way the day filter does.
 *
 * Every param here is one the server drops silently when it is wrong: an unrecognised sort
 * key leaves the rows in default order, a missing `limit` returns the default page size, and
 * a filter it cannot parse returns everything. All three come back looking like a working
 * list, so the shape is worth pinning even though the response is not.
 */
describe('HostBookingsApi.list', () => {
  function capture(body: unknown = { bookings: [], success: true }) {
    const calls: { path: string; params?: Record<string, unknown> }[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ApiClient,
          useValue: {
            get: (path: string, params?: Record<string, unknown>) => {
              calls.push({ path, params });
              return of(body);
            },
          },
        },
      ],
    });
    return { api: TestBed.inject(HostBookingsApi), calls };
  }

  it('asks for one page at a time', () => {
    const { api, calls } = capture();
    api.list('nHelLt', 3, 10).subscribe();

    const p = calls[0].params as Record<string, unknown>;
    expect(p['page']).toBe(3);
    expect(p['limit']).toBe(10);
  });

  // A bare `sort=` is dropped by the strong-params permit; the hash form is what it reads.
  it('sorts by arrival on the server, as a hash', () => {
    const { api, calls } = capture();
    api.list('nHelLt').subscribe();

    const p = calls[0].params as Record<string, unknown>;
    expect(p['sort[checkin_date]']).toBe('asc');
    expect(p['sort']).toBeUndefined();
  });

  it('passes the filter params through untouched', () => {
    const { api, calls } = capture();
    api.list('nHelLt', 1, 10, {
      'f[disposition.slug][]': ['checked-in', 'checked-out'],
      'f[checkin_date][gte]': '2026-08-01T00:00:00',
    }).subscribe();

    const p = calls[0].params as Record<string, unknown>;
    expect(p['f[disposition.slug][]']).toEqual(['checked-in', 'checked-out']);
    expect(p['f[checkin_date][gte]']).toBe('2026-08-01T00:00:00');
  });

  it('reads the page envelope rather than counting the rows on screen', () => {
    const { api } = capture({
      bookings: [raw()],
      pagination: { current_page: 2, next_page: 3, total_pages: 9, total_count: 87 },
    });

    let page: HostBookingPage | undefined;
    api.list('nHelLt', 2).subscribe((p) => (page = p));

    expect(page?.page).toBe(2);
    expect(page?.totalPages).toBe(9);
    // 87, not 1 — the count is the whole filtered set, not the length of this page.
    expect(page?.total).toBe(87);
    expect(page?.items).toHaveLength(1);
  });

  // Some endpoints omit the envelope; reporting zero would blank a list with rows in it.
  it('falls back to the rows it got when no envelope comes back', () => {
    const { api } = capture({ bookings: [raw(), raw()], success: true });

    let page: HostBookingPage | undefined;
    api.list('nHelLt').subscribe((p) => (page = p));

    expect(page?.total).toBe(2);
    expect(page?.page).toBe(1);
  });
});
/**
 * The room and the renter, both of which arrive on the booking and neither of which the
 * model carried until the room calendar needed them.
 *
 * Two things here are easy to read as bugs and are not:
 *
 *  - **`room` is null on a paid booking.** That is what `pending-allotment` *is* \x2D\x2D money
 *    taken, bed not yet chosen. Treating it as missing data would put a placeholder room on
 *    the calendar for a stay that has not been given one.
 *  - **`guest_name` is not who is staying.** In this data one account books beds for other
 *    people, so the booker is "Andy" while the renter is somebody else. A roster that reads
 *    the booker lists the same name against every bed in the room.
 */
describe('toHostBooking room and renter', () => {
  it('reads the allotted room from the nested record', () => {
    const b = toHostBooking(
      raw({ room_id: 'eTcpbc', room: { id: 'eTcpbc', room_number: '1111' } }),
    );

    expect(b.room).toEqual({ id: 'eTcpbc', number: '1111' });
  });

  it('leaves the room null while the booking is pending allotment', () => {
    const b = toHostBooking(raw({ room_id: null, room: null }));

    expect(b.room).toBeNull();
  });

  // The flat id without the nested record still says which room, just not its number.
  it('falls back to the flat id when only that travels', () => {
    const b = toHostBooking(raw({ room_id: 'eTcpbc' }));

    expect(b.room?.id).toBe('eTcpbc');
    expect(b.room?.number).toBe('—');
  });

  it('reads the renter, who is not the booker', () => {
    const b = toHostBooking(
      raw({
        renter_id: 'ksVzCJ',
        renter: {
          id: 'ksVzCJ',
          full_name: 'AASHIR AZEEM',
          email: 'jadude19+hostelhive4@gmail.com',
          phone: '03030491909',
        },
      }),
    );

    expect(b.guest.name).toBe('Andy');
    expect(b.renter?.name).toBe('AASHIR AZEEM');
    expect(b.renter?.phone).toBe('03030491909');
  });

  it('leaves the renter null when nobody has been assigned', () => {
    expect(toHostBooking(raw()).renter).toBeNull();
  });
});

/**
 * `GET …/bookings/:id` and every lifecycle reply are the serializer, not the search document:
 * amounts arrive as decimal strings, `source` as a number, and each line's name nested.
 */
describe('toHostBooking on a single booking', () => {
  const single = raw({
    total_price: '310000.0',
    paid_amount: '0.0',
    balance_due: undefined,
    nights: undefined,
    source: 0,
    currency: 'pkr',
    line_items: [
      { id: 'a', guests: 3, quantity: 1, occupancy_type: 'private_room', subtotal: '250000.0', room_type: { id: 'KGJwMC', name: 'King size room' } },
      { id: 'b', guests: 2, quantity: 2, occupancy_type: 'shared', subtotal: '60000.0', room_type: { id: 'MqVuEl', name: 'Dormitory' } },
    ],
    cancellation_reason: ' Water leak ',
  });

  it('reads amounts sent as strings, and derives what is still due', () => {
    const b = toHostBooking(single);
    expect([b.total, b.paid, b.balanceDue]).toEqual([310000, 0, 310000]);
  });

  it('does not choke on a numeric source', () => {
    expect(toHostBooking(single).source).toBe('');
  });

  it('reads the lines, names nested or flat', () => {
    expect(toHostBooking(single).lines).toEqual([
      { roomTypeId: 'KGJwMC', name: 'King size room', shared: false, units: 1, guests: 3, subtotal: 250000 },
      { roomTypeId: 'MqVuEl', name: 'Dormitory', shared: true, units: 2, guests: 2, subtotal: 60000 },
    ]);
    const flat = toHostBooking(raw({ line_items: [{ room_type_id: 'x', room_type_name: 'Dorm', guests: 1, occupancy_type: 'shared' }] }));
    expect(flat.lines[0]).toMatchObject({ roomTypeId: 'x', name: 'Dorm', units: 1 });
  });

  it('keeps the currency and the reason', () => {
    const b = toHostBooking(single);
    expect(b.currency).toBe('PKR');
    expect(b.cancellationReason).toBe('Water leak');
  });
});

describe('HostBookingsApi — the lifecycle', () => {
  const reply = { booking: raw({ disposition: { name: 'Confirmed', slug: 'confirmed' } }), success: true };
  let post: ReturnType<typeof vi.fn>;
  let put: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;

  function svc(): HostBookingsApi {
    post = vi.fn().mockReturnValue(of(reply));
    put = vi.fn().mockReturnValue(of({ message: 'Occupancy released' }));
    get = vi.fn().mockReturnValue(
      of({
        occupancies: [
          { id: 'o1', guests: 2, status: 'active', room: { id: 'r1', room_number: '101' } },
          { id: 'o2', guests: 1, status: 'inactive', room_id: 'r2' },
        ],
      }),
    );
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { post, put, get } }] });
    return TestBed.inject(HostBookingsApi);
  }
  const base = '/api/host/hostels/MjvuEl/bookings/vKkMIE';

  it('confirms, and returns the booking the server now holds', () => {
    let out: HostBooking | undefined;
    svc().confirm('MjvuEl', 'vKkMIE').subscribe((b) => (out = b));
    expect(post).toHaveBeenCalledWith(`${base}/mark_as_confirmed`, {});
    expect(out?.disposition.slug).toBe('confirmed');
  });

  it('checks in with one allocation per room', () => {
    svc()
      .checkIn('MjvuEl', 'vKkMIE', [
        { roomId: 'aVXGyz', guests: 2 },
        { roomId: 'AmBKhx', guests: 1 },
      ])
      .subscribe();
    expect(post).toHaveBeenCalledWith(`${base}/mark_as_checked_in`, {
      allocations: [
        { room_id: 'aVXGyz', guests: 2 },
        { room_id: 'AmBKhx', guests: 1 },
      ],
    });
  });

  it('checks out', () => {
    svc().checkOut('MjvuEl', 'vKkMIE').subscribe();
    expect(post).toHaveBeenCalledWith(`${base}/mark_as_checked_out`, {});
  });

  it('cancels and marks a no show with the reason, trimmed', () => {
    const api = svc();
    api.cancel('MjvuEl', 'vKkMIE', '  Water leak in dorm ').subscribe();
    api.markNoShow('MjvuEl', 'vKkMIE', 'Guest did not arrive').subscribe();
    expect(post).toHaveBeenCalledWith(`${base}/mark_as_cancelled`, { reason: 'Water leak in dorm' });
    expect(post).toHaveBeenCalledWith(`${base}/mark_as_no_show`, { reason: 'Guest did not arrive' });
  });

  it('generates the invoice, and returns the bill the server answers with, mapped', () => {
    post = vi.fn();
    const api = svc();
    post.mockReturnValue(
      of({
        renter_bill: {
          id: 'x',
          bill_type: 'booking',
          billable_type: 'Booking',
          amount: '616000.0',
          issued_date: '2026-09-02T10:00:00.000+05:00',
          due_date: '2026-09-02T22:44:01.867+05:00',
          status: { name: 'Due', slug: 'due' },
          break_down: { room_rent: '616000.0', mess_charges: '0.0', transportation_charges: '0.0' },
          booking: { id: 'vKkMIE', booking_ref: 'HH-2026-00009', guest_name: 'Andy', guest_phone: '+13449434559' },
        },
        message: 'Invoice generated',
        success: true,
      }),
    );
    let out: Invoice | undefined;
    api.generateInvoice('MjvuEl', 'vKkMIE').subscribe((b) => (out = b));
    expect(post).toHaveBeenCalledWith(`${base}/generate_invoice`, {});
    expect(out?.id).toBe('x');
    expect(out?.kind).toBe('booking');
    expect(out?.amount).toBe(616000);
    expect(out?.due).toBe('2026-09-02');
    expect(out?.booking).toEqual({ id: 'vKkMIE', ref: 'HH-2026-00009', guestName: 'Andy', phone: '+13449434559' });
    expect(out?.lines).toEqual([{ label: 'Room Rent', amount: 616000 }]);
  });

  it('errors on a generate reply with no bill in it', () => {
    post = vi.fn();
    const api = svc();
    post.mockReturnValue(of({ success: true }));
    let failed = false;
    api.generateInvoice('MjvuEl', 'vKkMIE').subscribe({ error: () => (failed = true) });
    expect(failed).toBe(true);
  });

  it('errors on a reply with no booking in it', () => {
    const api = svc();
    post.mockReturnValue(of({ success: true }));
    let failed = false;
    api.confirm('MjvuEl', 'vKkMIE').subscribe({ error: () => (failed = true) });
    expect(failed).toBe(true);
  });

  it('reads the rooms a checked-in booking holds, and releases one', () => {
    const api = svc();
    let rows: unknown;
    api.occupancies('MjvuEl', 'vKkMIE').subscribe((r) => (rows = r));
    expect(get).toHaveBeenCalledWith(`${base}/occupancies`, { page: 1, limit: 100 });
    expect(rows).toEqual([
      { id: 'o1', roomId: 'r1', roomNumber: '101', guests: 2, active: true },
      { id: 'o2', roomId: 'r2', roomNumber: '—', guests: 1, active: false },
    ]);

    api.releaseOccupancy('MjvuEl', 'vKkMIE', 'o1').subscribe();
    expect(put).toHaveBeenCalledWith(`${base}/occupancies/o1/mark_as_inactive`, {});
  });

  it('creates a walk-in in the guest booking shape: room types, per-line guests, phone as digits', () => {
    svc()
      .create('MjvuEl', {
        checkIn: '2026-10-10',
        checkOut: '2026-10-12',
        guestName: ' Walk In ',
        guestPhone: '+92 300 5556666',
        guestEmail: '',
        lines: [
          { roomTypeId: 'KGJwMC', shared: false, quantity: 1, guests: 2 },
          { roomTypeId: 'MqVuEl', shared: true, quantity: 2, guests: 2 },
        ],
      })
      .subscribe();
    expect(post).toHaveBeenCalledWith('/api/host/hostels/MjvuEl/bookings', {
      booking: {
        checkin_date: '2026-10-10',
        checkout_date: '2026-10-12',
        guest_name: 'Walk In',
        guest_phone: '923005556666',
        line_items: [
          { room_type_id: 'KGJwMC', guests: 2, occupancy_type: 'private_room', quantity: 1 },
          { room_type_id: 'MqVuEl', guests: 2, occupancy_type: 'shared' },
        ],
      },
    }, expect.any(HttpContext));
  });
});

describe('HostBookingsApi — mark as paid (Trello #81)', () => {
  it('posts to mark_as_paid with no body, and returns the settled booking', () => {
    const post = vi.fn().mockReturnValue(of({ booking: raw({ paid_amount: '616000.0', total_price: '616000.0', balance_due: undefined }) }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { post } }] });
    let out: HostBooking | undefined;
    TestBed.inject(HostBookingsApi).markPaid('MjvuEl', 'vKkMIE').subscribe((b) => (out = b));

    expect(post).toHaveBeenCalledWith('/api/host/hostels/MjvuEl/bookings/vKkMIE/mark_as_paid', {});
    expect(out?.paid).toBe(616000);
    expect(out?.balanceDue).toBe(0);
  });
});

describe('HostBookingsApi — per-call request options', () => {
  const base = '/api/host/hostels/MjvuEl/bookings/vKkMIE';
  const optOut = { suppressErrorToast: true } as const;
  let rec: ApiClientRecorder;
  let api: HostBookingsApi;

  const billReply = {
    renter_bill: {
      id: 'x',
      bill_type: 'booking',
      amount: '1.0',
      status: { name: 'Due', slug: 'due' },
      break_down: { room_rent: '1.0' },
    },
  };

  beforeEach(() => {
    rec = new ApiClientRecorder();
    rec.reply = (call: RecordedApiCall) =>
      of(call.path.endsWith('/generate_invoice') ? billReply : { booking: raw() });
    TestBed.configureTestingModule({ providers: [rec.provider()] });
    api = TestBed.inject(HostBookingsApi);
  });

  describe('get', () => {
    it('sends a GET to the booking and maps its occupancies', () => {
      rec.replyWith({
        booking: raw({
          occupancies: [{ id: 'o1', room_id: 'r1', room_number: '101', guests: 2, status: 'active' }],
        }),
      });
      let out: HostBooking | undefined;
      api.get('MjvuEl', 'vKkMIE').subscribe((b) => (out = b));

      expect(rec.last().verb).toBe('get');
      expect(rec.last().path).toBe(base);
      expect(out?.id).toBe('vKkMIE');
      expect(out?.occupancies).toEqual([
        { id: 'o1', roomId: 'r1', roomNumber: '101', guests: 2, active: true },
      ]);
    });

    it('errors on a reply with no booking in it', () => {
      rec.replyWith({ success: true });
      let failed = false;
      api.get('MjvuEl', 'vKkMIE').subscribe({ error: () => (failed = true) });

      expect(failed).toBe(true);
    });

    it('sends the toast opt-out as the third argument when asked', () => {
      api.get('MjvuEl', 'vKkMIE', optOut).subscribe();

      const call = rec.last('get');
      expect(call.argCount).toBe(3);
      expect(call.params).toBeUndefined();
      expect(suppressesErrorToast(call)).toBe(true);
    });

    it('passes no extra argument without options', () => {
      api.get('MjvuEl', 'vKkMIE').subscribe();

      const call = rec.last('get');
      expect(call.argCount).toBe(2);
      expect(suppressesErrorToast(call)).toBe(false);
    });
  });

  describe('lifecycle writes', () => {
    const moves: [string, string, (a: HostBookingsApi, o?: typeof optOut) => unknown, unknown][] = [
      ['confirm', 'mark_as_confirmed', (a, o) => a.confirm('MjvuEl', 'vKkMIE', o), {}],
      ['checkIn', 'mark_as_checked_in', (a, o) => a.checkIn('MjvuEl', 'vKkMIE', [{ roomId: 'r1', guests: 2 }], o), { allocations: [{ room_id: 'r1', guests: 2 }] }],
      ['markPaid', 'mark_as_paid', (a, o) => a.markPaid('MjvuEl', 'vKkMIE', o), {}],
      ['checkOut', 'mark_as_checked_out', (a, o) => a.checkOut('MjvuEl', 'vKkMIE', o), {}],
      ['cancel', 'mark_as_cancelled', (a, o) => a.cancel('MjvuEl', 'vKkMIE', ' why ', o), { reason: 'why' }],
      ['markNoShow', 'mark_as_no_show', (a, o) => a.markNoShow('MjvuEl', 'vKkMIE', ' why ', o), { reason: 'why' }],
      ['generateInvoice', 'generate_invoice', (a, o) => a.generateInvoice('MjvuEl', 'vKkMIE', o), {}],
    ];

    it.each(moves)('%s sends the toast opt-out as the third argument when asked', (_n, action, run, body) => {
      (run(api, optOut) as { subscribe: () => void }).subscribe();

      const call = rec.last('post');
      expect(call.path).toBe(`${base}/${action}`);
      expect(call.body).toEqual(body);
      expect(call.argCount).toBe(3);
      expect(suppressesErrorToast(call)).toBe(true);
    });

    it.each(moves)('%s passes no extra argument without options', (_n, action, run, body) => {
      (run(api) as { subscribe: () => void }).subscribe();

      const call = rec.last('post');
      expect(call.path).toBe(`${base}/${action}`);
      expect(call.body).toEqual(body);
      expect(call.argCount).toBe(2);
      expect(suppressesErrorToast(call)).toBe(false);
    });
  });

  describe('create', () => {
    // The booking drawer says why a save failed in translated copy; a toast would repeat it untranslated.
    it('always opts out of the global error toast', () => {
      rec.replyWith({ booking: raw() });
      api
        .create('MjvuEl', {
          checkIn: '2026-10-10',
          checkOut: '2026-10-12',
          guestName: 'Walk In',
          guestPhone: '923005556666',
          guestEmail: '',
          lines: [{ roomTypeId: 'KGJwMC', shared: true, quantity: 1, guests: 1 }],
        })
        .subscribe();

      const call = rec.last('post');
      expect(call.path).toBe('/api/host/hostels/MjvuEl/bookings');
      expect(call.argCount).toBe(3);
      expect(suppressesErrorToast(call)).toBe(true);
    });
  });

  describe('releaseOccupancy', () => {
    it('puts an empty body and the toast opt-out, with the occupancy id encoded', () => {
      api.releaseOccupancy('MjvuEl', 'vKkMIE', 'o/1 x', optOut).subscribe();

      const call = rec.last('put');
      expect(call.path).toBe(`${base}/occupancies/o%2F1%20x/mark_as_inactive`);
      expect(call.body).toEqual({});
      expect(call.argCount).toBe(3);
      expect(suppressesErrorToast(call)).toBe(true);
    });

    it('passes no extra argument without options', () => {
      api.releaseOccupancy('MjvuEl', 'vKkMIE', 'o1').subscribe();

      const call = rec.last('put');
      expect(call.argCount).toBe(2);
      expect(suppressesErrorToast(call)).toBe(false);
    });
  });

  describe('list', () => {
    const filters = { 'f[disposition.slug][]': ['confirmed'], 'f[checkin_date][gte]': '2026-08-01' };

    it('passes the opt-out as the third GET argument and leaves sort and filters unchanged', () => {
      api.list('MjvuEl', 2, 10, filters, optOut).subscribe();

      const call = rec.last('get');
      expect(call.path).toBe('/api/host/hostels/MjvuEl/bookings');
      expect(call.argCount).toBe(3);
      expect(suppressesErrorToast(call)).toBe(true);
      expect(call.params).toMatchObject({ page: 2, limit: 10, 'sort[checkin_date]': 'asc', ...filters });
    });

    it('passes no extra argument without options', () => {
      api.list('MjvuEl', 2, 10, filters).subscribe();

      const call = rec.last('get');
      expect(call.argCount).toBe(2);
      expect(suppressesErrorToast(call)).toBe(false);
      expect(call.params).toMatchObject({ page: 2, limit: 10, 'sort[checkin_date]': 'asc', ...filters });
    });
  });
});

describe('toHostBooking occupancies (Trello #81)', () => {
  it('reads the rooms a party was checked into, flat on the booking payload', () => {
    const b = toHostBooking(
      raw({
        occupancies: [
          { id: 'o1', room_id: 'aVXGyz', room_number: '101', guests: 2, status: 'active' },
          { id: 'o2', room_id: 'AmBKhx', room_number: '102', guests: 1, status: 'inactive' },
        ],
      }),
    );
    expect(b.occupancies).toEqual([
      { id: 'o1', roomId: 'aVXGyz', roomNumber: '101', guests: 2, active: true },
      { id: 'o2', roomId: 'AmBKhx', roomNumber: '102', guests: 1, active: false },
    ]);
  });

  it('has none before check-in', () => {
    expect(toHostBooking(raw()).occupancies).toEqual([]);
  });
});

describe('the confirmation PDF', () => {
  const FULL = 'https://img.example.test/unprocessed/ns-4/documents/0a6d51e8-host-confirmation.pdf';
  const SLIM = 'https://img.example.test/unprocessed/ns-4/documents/e94b30c7-host-list-confirmation.pdf';

  it('reads the url off the full attachment a single booking carries', () => {
    const pdf = { id: 'AtH1', file_name: 'booking-confirmation.pdf', content_type: 'application/pdf', url: FULL, byte_size: 2048 };
    expect(toHostBooking(raw({ confirmation_pdf: pdf })).confirmationPdfUrl).toBe(FULL);
  });

  it('reads the url off the slim attachment a list row carries', () => {
    const pdf = { id: 'AtH2', file_name: 'booking-confirmation.pdf', content_type: 'application/pdf', url: SLIM };
    expect(toHostBooking(raw({ confirmation_pdf: pdf })).confirmationPdfUrl).toBe(SLIM);
  });

  it('is empty while the booking has no attachment, null or missing', () => {
    expect(toHostBooking(raw({ confirmation_pdf: null })).confirmationPdfUrl).toBe('');
    expect(toHostBooking(raw()).confirmationPdfUrl).toBe('');
    expect(toHostBooking({ id: 'x' }).confirmationPdfUrl).toBe('');
  });

  it('is empty for a blank or whitespace url, and trims a padded one', () => {
    expect(toHostBooking(raw({ confirmation_pdf: { url: '' } })).confirmationPdfUrl).toBe('');
    expect(toHostBooking(raw({ confirmation_pdf: { url: '   ' } })).confirmationPdfUrl).toBe('');
    expect(toHostBooking(raw({ confirmation_pdf: { url: null } })).confirmationPdfUrl).toBe('');
    expect(toHostBooking(raw({ confirmation_pdf: { url: `  ${FULL} ` } })).confirmationPdfUrl).toBe(FULL);
  });

  it('ignores the removed string field on its own', () => {
    const legacy = { ...raw(), confirmation_pdf_url: 'https://old.example.test/legacy-host-confirmation.pdf' };
    expect(toHostBooking(legacy as ApiHostBooking).confirmationPdfUrl).toBe('');
  });
});

describe('confirmationLink', () => {
  const URL = 'https://img.example.test/unprocessed/ns-9/documents/5b18f3a9-host.pdf';
  const bookingAt = (slug: string, url = URL) =>
    toHostBooking(raw({ disposition: { id: 'd1', name: slug, slug }, confirmation_pdf: { url } }));

  it.each(['confirmed', 'room-assigned', 'checked-in', 'checked-out'])('offers the link once the booking is %s', (slug) => {
    expect(confirmationLink(bookingAt(slug))).toBe(URL);
  });

  it.each(['pending', 'pending-allotment', 'cancelled', 'no-show', 'something-new'])('offers nothing while the booking is %s', (slug) => {
    expect(confirmationLink(bookingAt(slug))).toBe('');
  });

  it('offers nothing for a confirmed booking whose PDF is not stored', () => {
    expect(confirmationLink(bookingAt('confirmed', ''))).toBe('');
  });
});
