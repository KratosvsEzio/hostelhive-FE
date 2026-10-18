import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { ApiClient, ApiRequestOptions } from '@core/api-resource';
import { Invoice } from '@hostelhive/data-access';
import { ApiClientRecorder, suppressesErrorToast } from '@app/testing/api-client-recorder';
import {
  HOSTEL_ID,
  apiBookingBillDoc,
  apiBookingBillReply,
  apiRentalBillDoc,
  apiUtilityBillDoc,
} from '@app/testing/host-builders';
import { HostOpsApi, toInvoice } from './host-ops-api';

class ApiClientStub {
  lastGetPath = '';
  lastGetParams: Record<string, unknown> = {};
  puts: { path: string; body: unknown }[] = [];
  rooms: unknown[] = [];

  get<T>(path: string, params?: Record<string, unknown>): Observable<T> {
    this.lastGetPath = path;
    this.lastGetParams = params ?? {};
    return of({
      rooms: this.rooms,
      pagination: { total_count: this.rooms.length, total_pages: 1, current_page: 1 },
    } as T);
  }

  put<T>(path: string, body: unknown): Observable<T> {
    this.puts.push({ path, body });
    return of(null as T);
  }
}

function setUp(): { api: HostOpsApi; http: ApiClientStub } {
  const http = new ApiClientStub();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: http }] });
  return { api: TestBed.inject(HostOpsApi), http };
}

/**
 * Listing the rooms built on a room type, which is what the delete dialog is built around.
 *
 * The filter key is the whole risk. `f[room_type.id]` names the association path; the flat
 * `f[room_type_id]` that reads more naturally is not a field this endpoint filters on, and an
 * unrecognised filter comes back 200 with the *unfiltered* set — so a typo lists every room in
 * the hostel as needing to be moved, and the host is asked to rehome rooms that were never
 * affected. Verified against the live endpoint: filtered total 2, unfiltered 3.
 */
describe('HostOpsApi.roomsOfType', () => {
  it('filters on the association path', () => {
    const { api, http } = setUp();
    http.rooms = [{ id: 'uLDavp', room_number: '101' }];

    api.roomsOfType('nHelLt', 'VEnHEL').subscribe();

    expect(http.lastGetPath).toBe('/api/host/hostels/nHelLt/rooms');
    expect(http.lastGetParams['f[room_type.id]']).toBe('VEnHEL');
  });

  it('returns the rooms, which is also the count', () => {
    const { api, http } = setUp();
    http.rooms = [
      { id: 'uLDavp', room_number: '101', floor: 'ground' },
      { id: 'qWer12', room_number: '102', floor: 'first' },
    ];

    let rooms: { id: string; number: string }[] | undefined;
    api.roomsOfType('nHelLt', 'VEnHEL').subscribe((r) => (rooms = r));

    expect(rooms?.length).toBe(2);
    expect(rooms?.map((r) => r.id)).toEqual(['uLDavp', 'qWer12']);
    expect(rooms?.[0].number).toBe('101');
  });

  // An empty list is the "nothing is built on this" answer, not an error state.
  it('comes back empty when nothing is built on the type', () => {
    const { api, http } = setUp();
    http.rooms = [];

    let rooms: unknown[] | undefined;
    api.roomsOfType('nHelLt', 'VEnHEL').subscribe((r) => (rooms = r));

    expect(rooms).toEqual([]);
  });

  // Ids are hashids on the wire whatever the models say, so nothing may coerce them.
  it('keeps a hashid intact rather than coercing it', () => {
    const { api, http } = setUp();
    api.roomsOfType('nHelLt', 'VEnHEL').subscribe();

    expect(http.lastGetParams['f[room_type.id]']).toBe('VEnHEL');
    expect(Number.isNaN(Number(http.lastGetParams['f[room_type.id]']))).toBe(true);
  });
});

/**
 * The call each row's Update button makes.
 *
 * Pinned because the room update is a general endpoint — it also carries capacity, floor and
 * renters — and a reassignment must send the room type and nothing else. A stray key here
 * would overwrite a field the host never opened.
 */
describe('HostOpsApi.updateRoom for a reassignment', () => {
  it('puts only the new room type, at the room path', () => {
    const { api, http } = setUp();

    api.updateRoom('nHelLt', 'uLDavp', { room_type_id: 'NewTyp' }).subscribe();

    expect(http.puts).toEqual([
      {
        path: '/api/host/hostels/nHelLt/rooms/uLDavp',
        body: { room: { room_type_id: 'NewTyp' } },
      },
    ]);
  });
});

/**
 * What create and update hand back.
 *
 * Both endpoints answer with `{ room }` — the full serialized room, id and resolved room type
 * included. These returned `Observable<unknown>` and the caller threw the body away, then
 * re-read every room in the property to display the one it had just been told about.
 *
 * Mapped through the same `toRoom` the list uses, so a card built from a create response and
 * one built from a page load cannot disagree about what a room is.
 */
describe('HostOpsApi room writes', () => {
  const SERVER_ROOM = {
    id: 'AmBKhx',
    room_number: '102',
    floor: 'ground',
    capacity: 4,
    current_occupancy: 0,
    renters: [],
    created_at: '2026-08-31T02:20:38.275+05:00',
    room_type: { id: 'KGJwMC', name: 'King size room', price: '12000.0', capacity: 4 },
  };

  function withWrites() {
    const calls: { path: string; body: unknown }[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ApiClient,
          useValue: {
            post: (path: string, body: unknown) => { calls.push({ path, body }); return of({ room: SERVER_ROOM, success: true }); },
            put:  (path: string, body: unknown) => { calls.push({ path, body }); return of({ room: SERVER_ROOM, success: true }); },
          },
        },
      ],
    });
    return { api: TestBed.inject(HostOpsApi), calls };
  }

  it('returns the created room, mapped', () => {
    const { api } = withWrites();

    let room: { id?: string; number?: string; type?: string; capacity?: number; occupied?: number; rentPerBed?: number } | undefined;
    api.createRoom('MjvuEl', { room_number: '102', room_type_id: 'KGJwMC', capacity: 4, floor: 'ground' })
      .subscribe((r) => (room = r));

    expect(room).toMatchObject({
      id: 'AmBKhx',
      number: '102',
      floor: 'ground',
      type: 'King size room',
      capacity: 4,
      occupied: 0,
      rentPerBed: 12000,
    });
  });

  it('returns the updated room, mapped the same way', () => {
    const { api } = withWrites();

    let room: { id?: string; capacity?: number } | undefined;
    api.updateRoom('MjvuEl', 'AmBKhx', { capacity: 4 }).subscribe((r) => (room = r));

    expect(room?.id).toBe('AmBKhx');
    expect(room?.capacity).toBe(4);
  });

  // A new room is never already occupied, which is what lets the header add its whole
  // capacity to the free-bed count without asking the server again.
  it('reports a new room as entirely free', () => {
    const { api } = withWrites();

    let room: { capacity?: number; occupied?: number } | undefined;
    api.createRoom('MjvuEl', { room_number: '102', room_type_id: 'KGJwMC', capacity: 4 }).subscribe((r) => (room = r));

    expect(room?.occupied).toBe(0);
    expect(room?.capacity).toBe(4);
  });
});

/**
 * Bulk create, which is the hostel update wearing a different hat.
 *
 * `PUT /api/hostels/:id` with nested `rooms_attributes`, so the response is the whole hostel
 * — and `HostelSerializer` declares `has_many :rooms` through the same `RoomSerializer` the
 * list uses. That makes `hostel.rooms` the complete set, not just the rooms added, which is
 * why the caller can replace the grid outright instead of re-reading it.
 */
/**
 * Saving an edited utility bill.
 *
 * The path was the singular `/api/host/hostel/…`, which has no route, and each renter bill id
 * went through `Number(...)`, which turns an obfuscated id into NaN. The backend decodes the
 * ids as strings since azeem-hamza/hostelhive#34.
 */
describe('HostOpsApi.updateUtilityBill', () => {
  const body = {
    total_amount: 27900,
    consumed_units: 300,
    previous_units: 2000,
    current_units: 2300,
    cost_per_unit: 93,
    issued_date: '2026-10-01',
    due_date: '2026-10-30',
    renter_bills_attributes: [
      { id: 'rB1aaa', amount: 18600, bill_days: 31, due_date: '2026-10-30', issued_date: '2026-10-01', break_down: { electricity_bill: 18600 } },
      { id: 'rB2bbb', amount: 9300, bill_days: 31, due_date: '2026-10-30', issued_date: '2026-10-01', break_down: { electricity_bill: 9300 } },
    ],
  };

  it('puts to the plural hostels route', () => {
    const { api, http } = setUp();

    api.updateUtilityBill('MjvuEl', 'Xk3pQa', body).subscribe();

    expect(http.puts[0].path).toBe('/api/host/hostels/MjvuEl/utility_bills/Xk3pQa');
  });

  it('sends the bill figures and the shares together, renter bill ids as the strings they are', () => {
    const { api, http } = setUp();

    api.updateUtilityBill('MjvuEl', 'Xk3pQa', body).subscribe();

    expect(http.puts[0].body).toEqual({ utility_bill: body });
  });
});

/**
 * Reading one utility bill back for the edit form.
 *
 * The edit form matches renter bills to renters and the bill to a room by these ids, against
 * the renters and rooms endpoints, which use the obfuscated ids. Where a payload also carries
 * the raw number (the list's `room_id` is `19` next to `room.id` `bCGPAU`, seen live on
 * 2026-10-11), the nested obfuscated id has to win.
 */
describe('HostOpsApi.getUtilityBill', () => {
  function withBill(bill: unknown): HostOpsApi {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: { get: () => of({ renter_bill: bill }) } }],
    });
    return TestBed.inject(HostOpsApi);
  }

  it('takes the room and renter ids from the nested objects over the raw numbers', () => {
    const api = withBill({
      id: 'aVXGyz',
      room_id: 19,
      room: { id: 'bCGPAU', room_number: '01' },
      total_amount: '27600.0',
      renter_bills: [{ id: 'ZNmJnB', renter_id: 7, renter: { id: 'EIpOsF', full_name: 'Aashir Azeem' }, amount: '27600.0', bill_days: 31 }],
    });
    let bill: { roomId: string; splits?: { tenantId: string }[] } | undefined;

    api.getUtilityBill('DZNqAc', 'aVXGyz').subscribe((b) => (bill = b));

    expect(bill?.roomId).toBe('bCGPAU');
    expect(bill?.splits?.[0].tenantId).toBe('EIpOsF');
  });

  it('falls back to the flat ids when there is no nested object', () => {
    const api = withBill({
      id: 'aVXGyz',
      room_id: 'bCGPAU',
      renter_bills: [{ id: 'ZNmJnB', renter_id: 'EIpOsF', amount: 100 }],
    });
    let bill: { roomId: string; splits?: { tenantId: string }[] } | undefined;

    api.getUtilityBill('DZNqAc', 'aVXGyz').subscribe((b) => (bill = b));

    expect(bill?.roomId).toBe('bCGPAU');
    expect(bill?.splits?.[0].tenantId).toBe('EIpOsF');
  });
});

describe('HostOpsApi.bulkCreateRooms', () => {
  function withPut(body: unknown) {
    const calls: { path: string; body: unknown }[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: {
        put: (path: string, sent: unknown) => { calls.push({ path, body: sent }); return of(body); },
      } }],
    });
    return { api: TestBed.inject(HostOpsApi), calls };
  }

  const ROOMS = [
    { id: 'a1', room_number: '101', floor: 'ground', capacity: 12, current_occupancy: 3, renters: [], room_type: { name: 'Dormitory', price: '2000.0' } },
    { id: 'a2', room_number: '102', floor: 'ground', capacity: 4,  current_occupancy: 0, renters: [], room_type: { name: 'King size room', price: '12000.0' } },
  ];

  it('sends the rooms nested under the hostel', () => {
    const { api, calls } = withPut({ hostel: { rooms: [] } });

    api.bulkCreateRooms('MjvuEl', [{ room_number: '201', room_type_id: 'rt1', capacity: 4 }]).subscribe();

    expect(calls[0].path).toBe('/api/hostels/MjvuEl');
    expect(calls[0].body).toEqual({ hostel: { rooms_attributes: [{ room_number: '201', room_type_id: 'rt1', capacity: 4 }] } });
  });

  it('returns every room the hostel now has, mapped', () => {
    const { api } = withPut({ hostel: { rooms: ROOMS }, success: true });

    let out: { id: string; number: string; capacity: number; occupied: number }[] = [];
    api.bulkCreateRooms('MjvuEl', []).subscribe((r) => (out = r));

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'a1', number: '101', capacity: 12, occupied: 3, type: 'Dormitory' });
    expect(out[1]).toMatchObject({ id: 'a2', number: '102', capacity: 4, occupied: 0 });
  });

  // A hostel serialized without its rooms must not read as "the hostel has no rooms" — the
  // caller treats an empty list as a reason to re-read rather than to blank the grid.
  it('yields an empty list when the payload carries no rooms', () => {
    const { api } = withPut({ hostel: {} });

    let out: unknown[] = ['untouched'];
    api.bulkCreateRooms('MjvuEl', []).subscribe((r) => (out = r));

    expect(out).toEqual([]);
  });
});

/**
 * Bills past their due date now really move to `over-due` (Trello #81) — a nightly job does it,
 * where before the status never changed. It has to survive the mapper as its own state, not
 * fold into `due`, or the overdue badge, filter and counts never show anything.
 */
describe('HostOpsApi.invoices — bill statuses', () => {
  function withBills(bills: unknown[], statuses: unknown[] = []): HostOpsApi {
    const http = new ApiClientStub();
    http.get = <T>() =>
      of({ renter_bills: bills, pagination: { total_count: bills.length, total_pages: 1 }, aggs: { statuses } } as T);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: http }] });
    return TestBed.inject(HostOpsApi);
  }

  it('keeps over-due apart from due and paid', () => {
    const api = withBills([
      { id: 'a', status: { slug: 'due', name: 'Due' } },
      { id: 'b', status: { slug: 'over-due', name: 'Over Due' } },
      { id: 'c', status: { slug: 'paid', name: 'Paid' } },
    ]);
    let statuses: string[] = [];
    api.invoices('h1').subscribe((r) => (statuses = r.bills.map((b) => b.status)));
    expect(statuses).toEqual(['due', 'over-due', 'paid']);
  });

  it('passes the over-due tally through for the counts and the filter', () => {
    const api = withBills([], [{ name: 'Over Due', slug: 'over-due', count: 3, total_amount: 4500 }]);
    let tally: unknown;
    api.invoices('h1').subscribe((r) => (tally = r.statuses));
    expect(tally).toEqual([{ name: 'Over Due', slug: 'over-due', count: 3, totalAmount: 4500 }]);
  });
});

/**
 * The booking bill, from both wire shapes.
 *
 * A booking bill has no renter, so the guest stands in for the tenant everywhere a name is read.
 * The list sends search documents (`booking.phone`, numeric zeros); the serializer replies send
 * `booking.guest_phone` and decimal strings. Both have to land on the same `Invoice`.
 */
describe('toInvoice — booking bills', () => {
  const asBreakDown = (v: Record<string, unknown>) => v as unknown as Record<string, number>;

  it('maps a search document to a booking invoice with the guest as tenant', () => {
    const inv = toInvoice(apiBookingBillDoc());

    expect(inv.kind).toBe('booking');
    expect(inv.renterId).toBe('');
    expect(inv.tenantName).toBe('Ali Raza');
    expect(inv.booking).toEqual({ id: 'bk-1', ref: 'BK-0001', guestName: 'Ali Raza', phone: '923001234567' });
  });

  it('reads the phone from guest_phone on a serializer reply', () => {
    const inv = toInvoice(apiBookingBillReply());

    expect(inv.booking?.phone).toBe('923001234567');
  });

  it('prefers phone over guest_phone when both are present', () => {
    const inv = toInvoice(
      apiBookingBillDoc({ booking: { id: 'bk-1', booking_ref: 'BK-0001', guest_name: 'Ali', phone: '111', guest_phone: '222' } }),
    );

    expect(inv.booking?.phone).toBe('111');
  });

  it('gives an empty phone when neither key is present', () => {
    const inv = toInvoice(apiBookingBillDoc({ booking: { id: 'bk-1', booking_ref: 'BK-0001', guest_name: 'Ali' } }));

    expect(inv.booking?.phone).toBe('');
  });

  it('falls back to billable_id when the booking carries no id', () => {
    const inv = toInvoice(
      apiBookingBillDoc({ billable_id: 'bk-9', booking: { booking_ref: 'BK-0009', guest_name: 'Ali' } }),
    );

    expect(inv.booking?.id).toBe('bk-9');
  });

  it('gives an empty booking id when neither the booking nor billable_id has one', () => {
    const inv = toInvoice(
      apiBookingBillDoc({ billable_id: undefined, booking: { booking_ref: 'BK-0009', guest_name: 'Ali' } }),
    );

    expect(inv.booking?.id).toBe('');
  });

  it('drops zero mess and transport lines from a search document', () => {
    const inv = toInvoice(apiBookingBillDoc());

    expect(inv.lines).toEqual([{ label: 'Room Charges', amount: 24000 }]);
  });

  it('drops mess and transport sent as the string "0.0" on a serializer reply', () => {
    const inv = toInvoice(apiBookingBillReply());

    expect(inv.lines).toEqual([{ label: 'Room Charges', amount: 24000 }]);
  });

  it('coerces string amounts to numbers on the lines it keeps', () => {
    const inv = toInvoice(apiBookingBillReply({ break_down: asBreakDown({ room_charges: '24000.0', mess_charges: '0.0' }) }));

    expect(inv.lines).toEqual([{ label: 'Room Charges', amount: 24000 }]);
    expect(typeof inv.lines[0].amount).toBe('number');
  });

  it('keeps non-zero mess and transport lines', () => {
    const inv = toInvoice(
      apiBookingBillReply({
        break_down: asBreakDown({ room_charges: 24000, mess_charges: 1500, transportation_charges: '250.0' }),
      }),
    );

    expect(inv.lines).toEqual([
      { label: 'Room Charges', amount: 24000 },
      { label: 'Mess Charges', amount: 1500 },
      { label: 'Transportation Charges', amount: 250 },
    ]);
  });

  it('falls back to a single "Stay charges" line when there is no breakdown', () => {
    const inv = toInvoice(apiBookingBillDoc({ break_down: undefined, line_items: undefined }));

    expect(inv.lines).toEqual([{ label: 'Stay charges', amount: 24000 }]);
  });

  it('maps a booking bill with a null booking to a booking invoice with no booking block', () => {
    const inv = toInvoice(apiBookingBillDoc({ booking: null }));

    expect(inv.kind).toBe('booking');
    expect(inv.booking).toBeUndefined();
    expect(inv.tenantName).toBe('—');
  });

  it('names the tenant after the renter when one is present, not the guest', () => {
    const inv = toInvoice(apiBookingBillDoc({ renter: { id: 't-7', full_name: 'Saad Ali' } }));

    expect(inv.tenantName).toBe('Saad Ali');
    expect(inv.booking?.guestName).toBe('Ali Raza');
  });

  it('keeps over-due as its own status on a booking bill', () => {
    const inv = toInvoice(apiBookingBillDoc({ status: { id: 3, name: 'Over Due', slug: 'over-due' } }));

    expect(inv.status).toBe('over-due');
  });
});

/**
 * Rental and utility bills must come through the booking changes untouched: they keep their
 * zero lines (the booking filter is booking-only) and never grow a booking block.
 */
describe('toInvoice — non-booking bills are unchanged', () => {
  it('keeps the zero mess and transport lines on a rental bill and adds no booking', () => {
    const inv = toInvoice(apiRentalBillDoc({ break_down: { rent: 14000, mess_charges: 0, transportation_charges: 0 } }));

    expect(inv.kind).toBe('rental');
    expect(inv.booking).toBeUndefined();
    expect(inv.lines).toEqual([
      { label: 'Rent', amount: 14000 },
      { label: 'Mess Charges', amount: 0 },
      { label: 'Transportation Charges', amount: 0 },
    ]);
  });

  it('keeps zero lines on a utility bill and adds no booking', () => {
    const inv = toInvoice(
      apiUtilityBillDoc({ line_items: undefined, break_down: { electricity: 3600, mess_charges: 0 } }),
    );

    expect(inv.kind).toBe('utility');
    expect(inv.booking).toBeUndefined();
    expect(inv.lines).toEqual([
      { label: 'Electricity', amount: 3600 },
      { label: 'Mess Charges', amount: 0 },
    ]);
  });

  it('adds no booking block to a rental bill even when the payload carries one', () => {
    const inv = toInvoice(apiRentalBillDoc({ booking: { id: 'bk-1', guest_name: 'Ali' } }));

    expect(inv.booking).toBeUndefined();
  });

  it('treats an unknown bill_type as a rental bill', () => {
    const inv = toInvoice(apiRentalBillDoc({ bill_type: 'something-new' }));

    expect(inv.kind).toBe('rental');
  });
});

describe('HostOpsApi.invoice', () => {
  function setUpRecorder(): { api: HostOpsApi; http: ApiClientRecorder } {
    const http = new ApiClientRecorder();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [http.provider()] });
    return { api: TestBed.inject(HostOpsApi), http };
  }

  it('gets the one bill and maps it through the invoice mapper', () => {
    const { api, http } = setUpRecorder();
    const doc = apiBookingBillReply({ id: 'rb-9' });
    http.replyWith({ renter_bill: doc });

    let got: Invoice | undefined;
    api.invoice(HOSTEL_ID, 'rb-9').subscribe((i) => (got = i));

    const call = http.last('get');
    expect(call.path).toBe(`/api/host/hostels/${HOSTEL_ID}/renter_bills/rb-9`);
    expect(call.params).toBeUndefined();
    expect(got).toEqual(toInvoice(doc));
    expect(got?.id).toBe('rb-9');
  });

  // The page reads an empty id as "no such bill", so a reply without one must not invent an id.
  it('yields an empty id when the reply carries no renter_bill', () => {
    const { api, http } = setUpRecorder();
    http.replyWith({});

    let got: Invoice | undefined;
    api.invoice(HOSTEL_ID, 'rb-9').subscribe((i) => (got = i));

    expect(got?.id).toBe('');
  });
});

describe('HostOpsApi.bookingInvoices', () => {
  function setUpRecorder(): { api: HostOpsApi; http: ApiClientRecorder } {
    const http = new ApiClientRecorder();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [http.provider()] });
    return { api: TestBed.inject(HostOpsApi), http };
  }

  it('answers an empty map and sends no request for an empty id list', () => {
    const { api, http } = setUpRecorder();

    let got: Map<string, Invoice> | undefined;
    api.bookingInvoices(HOSTEL_ID, []).subscribe((m) => (got = m));

    expect(got).toBeInstanceOf(Map);
    expect(got?.size).toBe(0);
    expect(http.calls).toHaveLength(0);
  });

  it('asks one page sized to the id count, filtered to booking bills, with the ids as an array', () => {
    const { api, http } = setUpRecorder();
    http.replyWith({ renter_bills: [] });

    api.bookingInvoices(HOSTEL_ID, ['ewPcpb', 'bk-2', 'bk-3']).subscribe();

    const call = http.last('get');
    expect(http.calls).toHaveLength(1);
    expect(call.path).toBe(`/api/host/hostels/${HOSTEL_ID}/renter_bills`);
    expect(call.params).toEqual({
      page: 1,
      limit: 3,
      'f[billable_type]': 'Booking',
      'f[bill_type]': 'booking',
      'f[billable_id.keyword][]': ['ewPcpb', 'bk-2', 'bk-3'],
    });
    expect(Array.isArray(call.params?.['f[billable_id.keyword][]'])).toBe(true);
  });

  // The plain field is analysed text on the index, so a mixed-case id sent there matches nothing.
  it('filters the ids on the exact keyword field, never the analysed one', () => {
    const { api, http } = setUpRecorder();
    http.replyWith({ renter_bills: [] });

    api.bookingInvoices(HOSTEL_ID, ['ewPcpb']).subscribe();

    const params = http.last('get').params ?? {};
    expect(params['f[billable_id.keyword][]']).toEqual(['ewPcpb']);
    expect(params).not.toHaveProperty('f[billable_id][]');
    expect(params).not.toHaveProperty('f[billable_id]');
  });

  it('keys the bills by booking id and leaves out a booking that has none', () => {
    const { api, http } = setUpRecorder();
    http.replyWith({
      renter_bills: [
        apiBookingBillDoc({ id: 'rb-1', booking: { id: 'bk-1', booking_ref: 'BK-1', guest_name: 'Ali' } }),
        apiBookingBillDoc({ id: 'rb-2', booking: { id: 'bk-2', booking_ref: 'BK-2', guest_name: 'Sana' } }),
      ],
    });

    let got: Map<string, Invoice> | undefined;
    api.bookingInvoices(HOSTEL_ID, ['bk-1', 'bk-2', 'bk-3']).subscribe((m) => (got = m));

    expect([...(got?.keys() ?? [])]).toEqual(['bk-1', 'bk-2']);
    expect(got?.get('bk-1')?.id).toBe('rb-1');
    expect(got?.get('bk-2')?.id).toBe('rb-2');
    expect(got?.has('bk-3')).toBe(false);
  });

  it('skips a bill that carries no booking id', () => {
    const { api, http } = setUpRecorder();
    http.replyWith({
      renter_bills: [
        apiBookingBillDoc({ id: 'rb-1', billable_id: undefined, booking: { booking_ref: 'BK-1', guest_name: 'Ali' } }),
        apiBookingBillDoc({ id: 'rb-2', billable_id: undefined, booking: null }),
        apiBookingBillDoc({ id: 'rb-3', booking: { id: 'bk-3', booking_ref: 'BK-3', guest_name: 'Sana' } }),
      ],
    });

    let got: Map<string, Invoice> | undefined;
    api.bookingInvoices(HOSTEL_ID, ['bk-1', 'bk-2', 'bk-3']).subscribe((m) => (got = m));

    expect([...(got?.keys() ?? [])]).toEqual(['bk-3']);
  });

  it('reads the bills from data when renter_bills is absent', () => {
    const { api, http } = setUpRecorder();
    http.replyWith({ data: [apiBookingBillDoc({ id: 'rb-1' })] });

    let got: Map<string, Invoice> | undefined;
    api.bookingInvoices(HOSTEL_ID, ['bk-1']).subscribe((m) => (got = m));

    expect(got?.get('bk-1')?.id).toBe('rb-1');
  });
});

/**
 * The toast opt-out travels as a trailing `HttpContext` argument, and only when asked for, so
 * a plain call stays exactly the call it always was.
 */
describe('HostOpsApi request options', () => {
  const calls: { name: string; run: (api: HostOpsApi, opts?: ApiRequestOptions) => void; plainArgCount: number }[] = [
    { name: 'invoice', run: (api, opts) => api.invoice(HOSTEL_ID, 'rb-1', opts).subscribe(), plainArgCount: 2 },
    {
      name: 'bookingInvoices',
      run: (api, opts) => api.bookingInvoices(HOSTEL_ID, ['bk-1'], opts).subscribe(),
      plainArgCount: 2,
    },
    { name: 'markInvoicePaid', run: (api, opts) => api.markInvoicePaid(HOSTEL_ID, 'rb-1', opts).subscribe(), plainArgCount: 2 },
  ];

  function setUpRecorder(): { api: HostOpsApi; http: ApiClientRecorder } {
    const http = new ApiClientRecorder();
    http.replyWith({ renter_bills: [], renter_bill: {} });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [http.provider()] });
    return { api: TestBed.inject(HostOpsApi), http };
  }

  it.each(calls)('$name carries the error-toast opt-out context when asked', ({ run }) => {
    const { api, http } = setUpRecorder();

    run(api, { suppressErrorToast: true });

    const call = http.calls[0];
    expect(call.context).toBeDefined();
    expect(suppressesErrorToast(call)).toBe(true);
    expect(call.argCount).toBe(3);
  });

  it.each(calls)('$name sends no trailing argument without options', ({ run, plainArgCount }) => {
    const { api, http } = setUpRecorder();

    run(api);

    const call = http.calls[0];
    expect(call.context).toBeUndefined();
    expect(call.argCount).toBe(plainArgCount);
  });

  it.each(calls)('$name sends no trailing argument when the opt-out is false', ({ run, plainArgCount }) => {
    const { api, http } = setUpRecorder();

    run(api, { suppressErrorToast: false });

    expect(http.calls[0].argCount).toBe(plainArgCount);
    expect(http.calls[0].context).toBeUndefined();
  });
});
