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
