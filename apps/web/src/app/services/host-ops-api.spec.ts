import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { ApiClient } from '@core/api-resource';
import { HostOpsApi } from './host-ops-api';

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
