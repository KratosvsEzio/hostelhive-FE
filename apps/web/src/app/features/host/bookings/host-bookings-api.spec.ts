import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiClient } from '@core/api-resource';
import {
  ApiHostBooking,
  HostBookingPage,
  HostBookingsApi,
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
    deposit: 61600,
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

  it('spans the whole day rather than a bare date', () => {
    const { api, calls } = capture();
    api.bookingsOn('nHelLt', '2026-08-24').subscribe();

    const p = calls[0].params as Record<string, unknown>;
    expect(p['f[checkin_date][gte]']).toBe('2026-08-24T00:00:00');
    expect(p['f[checkin_date][lte]']).toBe('2026-08-24T23:59:59');
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