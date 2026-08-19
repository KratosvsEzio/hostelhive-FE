import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ApiClient } from '@core/api-resource';
import {
  HostListing,
  HostListingsData,
  HostTeamData,
  ListingStats,
  ListingStatus,
  PropertyAccommodationType,
  StaffMember,
} from '@hostelhive/data-access';

/** A hostel record from `GET /api/host/hostels`. */
interface ApiHostHostel {
  id: string | number;
  name?: string | null;
  gender_type?: string | null;
  city?: string | null;
  area?: string | null;
  status?: { slug?: string; name?: string } | null;
  disposition?: { slug?: string; name?: string } | null;
  total_rooms?: number | null;
  /** Room types — each entry's `capacity` = max beds for that type. */
  room_types?: { capacity: number }[] | null;
  q_at?: string | null;
  views_count?: number | null;
  attachments?: {
    url?: string | null;
    is_primary?: boolean;
    variants?: Record<string, string> | null;
  }[] | null;
}

interface ApiHostHostelsResponse {
  success?: boolean;
  hostels?: ApiHostHostel[];
}

/**
 * Host console data source.
 * `listings()` — live: `GET /api/host/hostels`; auth token attached by `authInterceptor`.
 * `team()`     — fixture stub (pending a team endpoint).
 */
@Injectable({ providedIn: 'root' })
export class HostShellApi {
  private readonly api = inject(ApiClient);

  /** The signed-in host's properties and headline stats. */
  listings(): Observable<HostListingsData> {
    return this.api
      .get<ApiHostHostelsResponse>('/api/host/hostels')
      .pipe(map(toHostListingsData));
  }

  /** Staff roster for the active property. */
  team(hostelId: string): Observable<HostTeamData> {
    return this.api
      .get<ApiManagersResponse>(`/api/hostels/${hostelId}/manager`)
      .pipe(
        catchError((err) =>
          err?.status === 404
            ? of<ApiManagersResponse>({ managers: [] })
            : throwError(() => err),
        ),
        map((res) => toHostTeamData(res, hostelId)),
      );
  }

  /** Add a manager/warden to the hostel. */
  addManager(
    hostelId: string,
    user: { name: string; email: string; password: string; phone: string },
  ): Observable<unknown> {
    return this.api.post(`/api/hostels/${hostelId}/add_manager`, { user });
  }

  /** Remove a manager from the hostel. */
  removeManager(hostelId: string, managerId: string): Observable<unknown> {
    return this.api.put(`/api/host/hostels/${hostelId}/remove_manager`, { manager_id: managerId });
  }

  /** Update a manager's name and phone. */
  updateManager(
    hostelId: string,
    managerId: string,
    user: { name?: string; phone?: string },
  ): Observable<unknown> {
    return this.api.patch(`/api/hostels/${hostelId}/managers/${managerId}`, { user });
  }
}

// ── managers ───────────────────────────────────────────────────────────────────

interface ApiManager {
  id?: number | string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  status?: string | null;
}

interface ApiManagersResponse {
  manager?: ApiManager;
  managers?: ApiManager[];
  data?: ApiManager[];
  hostel?: { id?: string; name?: string };
}

const TONES = ['cream', 'sky', 'mint', 'brand'] as const;

function toHostTeamData(res: ApiManagersResponse, hostelId: string): HostTeamData {
  const raw = res.managers ?? res.data ?? (res.manager ? [res.manager] : []);
  return {
    property: { id: hostelId, name: res.hostel?.name ?? '' },
    staff: raw.map((m, i): StaffMember => {
      const name = m.name ?? m.email ?? '?';
      const initials = name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
      const role = m.role === 'warden' ? 'warden' : 'manager';
      const status = m.status === 'inactive' ? 'inactive' : 'active';
      return { id: String(m.id ?? ''), name, initials, role, email: m.email ?? '', phone: m.phone ?? undefined, status, tone: TONES[i % TONES.length] };
    }),
  };
}

// ── response → domain mapping ──────────────────────────────────────────────────

function toHostListingsData(res: ApiHostHostelsResponse): HostListingsData {
  const raw = res.hostels ?? [];
  const listings = raw.map(toHostListing);
  return {
    listings,
    draft: null,
    stats: computeStats(listings, raw),
  };
}

function toHostListing(h: ApiHostHostel): HostListing {
  const status = mapStatus(h.status?.slug, h.disposition?.slug);
  const bedsTotal = h.room_types?.reduce((s, r) => s + r.capacity, 0) ?? null;

  return {
    id: String(h.id),
    name: h.name ?? '—',
    area: h.area ?? '',
    city: h.city ?? '',
    accommodationType: mapGender(h.gender_type),
    status,
    image: resolveThumb(h.attachments),
    rooms: h.total_rooms ?? undefined,
    bedsTotal: bedsTotal ?? undefined,
    bedsFilled: undefined,
    views: h.views_count ?? undefined,
    submittedAt:
      status === 'in-review' && h.q_at ? relativeTime(h.q_at) : undefined,
    photos: h.attachments?.length || undefined,
  };
}

function mapStatus(statusSlug?: string | null, dispositionSlug?: string | null): ListingStatus {
  if (statusSlug === 'active')   return 'published';
  if (statusSlug === 'inactive') return 'paused';
  if (dispositionSlug === 'in-review') return 'in-review';
  return 'onboarding';
}

function mapGender(slug?: string | null): PropertyAccommodationType {
  if (slug === 'co-living')  return 'coliving';
  if (slug === 'girls')      return 'girls';
  if (slug === 'backpacker') return 'backpacker';
  return 'boys';
}

function resolveThumb(
  attachments?: ApiHostHostel['attachments'],
): string {
  if (!attachments?.length) return '';
  const a = attachments.find((x) => x.is_primary) ?? attachments[0];
  if (a.url) return a.url;
  const v = a.variants ?? {};
  return (
    v['thumb'] ?? v['small'] ?? v['medium'] ?? Object.values(v).find(Boolean) ?? ''
  );
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function computeStats(listings: HostListing[], raw: ApiHostHostel[]): ListingStats {
  const published = listings.filter((l) => l.status === 'published').length;
  const inReview  = listings.filter((l) => l.status === 'in-review').length;

  let totalBeds = 0;
  for (const h of raw) {
    totalBeds += h.room_types?.reduce((s, r) => s + r.capacity, 0) ?? 0;
  }
  const occupancy = 0; // occupancy not available from this endpoint

  return { total: listings.length, published, inReview, occupancy };
}
