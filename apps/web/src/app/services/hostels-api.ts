import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  AttachmentLabel,
  Paginated,
  HostelDetail,
  HostelEnumOption,
  HostelFormOptionsResponse,
  HostelInput,
  HostelListResponse,
  HostelResponse,
  HostelRoomTypesResponse,
  HostelSearchQuery,
  HostelSearchResult,
  HostelSubscription,
  HostelSubscriptionResponse,
  HostelWriteRequest,
  RoomType,
} from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';

/**
 * Authenticated hostel management — the `/api/hostels` endpoints
 * (app/controllers/api/hostels_controller.rb). Requires a JWT (attached by
 * `authInterceptor`); `list()` is cancan-scoped server-side to the caller's hostels
 * (admins/moderators see all). Every response is unwrapped from the `{ …, success: true }`
 * envelope into a plain model.
 *
 * Two read shapes, by design: `list()` returns Elasticsearch search results
 * (`HostelSearchResult`), while the single-hostel reads return the richer
 * HostelSerializer shape (`HostelDetail`).
 */
@Injectable({ providedIn: 'root' })
export class HostelsApi {
  private readonly api = inject(ApiClient);

  /** GET /api/hostels — paginated search over the caller's hostels (Elastic `_source`). */
  list(
    query: HostelSearchQuery = {},
  ): Observable<Paginated<HostelSearchResult>> {
    return this.api
      .get<HostelListResponse>('/api/hostels', toSearchParams(query))
      .pipe(
        map((r) => ({
          items: r.hostels ?? [],
          total: r.pagination?.total_count ?? r.hostels?.length ?? 0,
          page: r.pagination?.current_page ?? query.page ?? 1,
          pageSize: query.limit ?? 30,
          totalPages: r.pagination?.total_pages,
        })),
      );
  }

  /** GET /api/hostels/new — gender, property & attachment-label enum options for build/edit forms. */
  formOptions(): Observable<{
    genderTypes: HostelEnumOption[];
    propertyTypes: HostelEnumOption[];
    attachmentLabels: AttachmentLabel[];
  }> {
    return this.api
      .get<HostelFormOptionsResponse>('/api/hostels/new')
      .pipe(
        map((r) => ({
          genderTypes: r.gender_types ?? [],
          propertyTypes: r.property_types ?? [],
          attachmentLabels: r.attachment_labels ?? [],
        })),
      );
  }

  /** GET /api/hostels/:id — the full hostel (HostelSerializer). */
  getById(id: number | string): Observable<HostelDetail> {
    return this.api
      .get<HostelResponse>(`/api/hostels/${id}`)
      .pipe(map((r) => requireHostel(r, id)));
  }

  /** GET /api/hostels/:id/edit — same detail shape, for edit forms. */
  getForEdit(id: number | string): Observable<HostelDetail> {
    return this.api
      .get<HostelResponse>(`/api/hostels/${id}/edit`)
      .pipe(map((r) => requireHostel(r, id)));
  }

  /** POST /api/hostels — create. Body is nested under `hostel`. */
  create(input: HostelInput): Observable<HostelDetail> {
    const body: HostelWriteRequest = { hostel: input };
    return this.api
      .post<HostelResponse>('/api/hostels', body)
      .pipe(map((r) => requireHostel(r)));
  }

  /** PUT /api/hostels/:id — update (full replace). Body is nested under `hostel`. */
  update(id: number | string, input: HostelInput): Observable<HostelDetail> {
    const body: HostelWriteRequest = { hostel: input };
    return this.api
      .put<HostelResponse>(`/api/hostels/${id}`, body)
      .pipe(map((r) => requireHostel(r, id)));
  }

  /** GET /api/hostels/:id/room_types — the hostel's room types. */
  roomTypes(id: number | string): Observable<RoomType[]> {
    return this.api
      .get<HostelRoomTypesResponse>(`/api/hostels/${id}/room_types`)
      .pipe(map((r) => r.room_types ?? []));
  }

  /** GET /api/hostels/:id/current_subscription — the most recent contract, or null. */
  currentSubscription(
    id: number | string,
  ): Observable<HostelSubscription | null> {
    return this.api
      .get<HostelSubscriptionResponse>(
        `/api/hostels/${id}/current_subscription`,
      )
      .pipe(map((r) => normalizeSubscription(r.subscription)));
  }
}

/**
 * HostelSerializer omits `:id`, so guarantee it from the requested id when available.
 * (`create()` has no prior id — if the backend doesn't echo one, add `:id` to
 * HostelSerializer server-side; until then `id` may be absent on the create result.)
 */
function requireHostel(r: HostelResponse, id?: number | string): HostelDetail {
  const h = r.hostel;
  if (!h) throw new Error('Hostel response did not include a hostel.');
  return id != null && h.id == null ? { ...h, id: Number(id) } : h;
}

/** `current_subscription` returns `{}` (no id) when a hostel has no contract — normalize to null. */
function normalizeSubscription(
  s: HostelSubscription | null | undefined,
): HostelSubscription | null {
  return s && s.id != null ? s : null;
}

/** Map the typed query to the Rails search params (`f[...]`, `sort[...]`, `page`, `limit`). */
function toSearchParams(
  q: HostelSearchQuery,
): Record<string, string | number | boolean> {
  const p: Record<string, string | number | boolean> = {};
  if (q.page != null) p['page'] = q.page;
  if (q.limit != null) p['limit'] = q.limit;
  if (q.city) p['f[city]'] = q.city;
  if (q.gender_type != null) p['f[gender_type]'] = q.gender_type;
  if (q.property_type != null) p['f[property_type]'] = q.property_type;
  if (q.bounds) {
    p['f[bounding][north]'] = q.bounds.north;
    p['f[bounding][south]'] = q.bounds.south;
    p['f[bounding][east]'] = q.bounds.east;
    p['f[bounding][west]'] = q.bounds.west;
  }
  if (q.sort) {
    for (const [field, order] of Object.entries(q.sort))
      p[`sort[${field}]`] = order;
  }
  return p;
}
