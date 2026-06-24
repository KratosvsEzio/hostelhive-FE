import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  Listing,
  ListingQuery,
  Gender,
  Paginated,
} from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';

/**
 * Raw hostel from GET /public/hostels. The endpoint runs Searchkick with `load: false`,
 * so each item is the Elasticsearch `search_data` document (backend HostelIndex), NOT
 * the AR HostelSerializer: there is no `name`, `hostel_offers`, or `banner` — only the
 * fields below (`room_types` was added to the payload later). Enums are string keys.
 */
interface ApiHostel {
  id: number;
  description?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  gender_type?: string | null; // 'co-living' | 'boys' | 'girls'
  property_type?: string | null; // 'apartment' | 'room' | 'building' | 'house'
  total_rooms?: number | null;
  starting_price?: number | null; // the "from" price (min_price/max_price are deprecated/removed)
  latitude?: number | string | null;
  longitude?: number | string | null;
  nearby_landmarks?: string | null;
  host?: { id: number; name: string } | null;
  status?: { id?: number; name?: string; slug?: string } | null;
  attachments?: { url?: string; file_name?: string }[] | null;
  location?: { lat: number; lon: number } | null;
  // Per-capacity room types — used to price the card by the selected capacity.
  room_types?:
    | {
        id: number | string;
        name?: string;
        capacity?: number;
        price?: number;
      }[]
    | null;
}

// gender_type arrives as the backend enum's string key ('co-living' has a hyphen).
const GENDER_MAP: Record<string, Gender> = {
  'co-living': 'coliving',
  boys: 'boys',
  girls: 'girls',
};
const cap = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/**
 * Display "from" price. When a room-capacity filter is active, use the price of the matching
 * room type (cheapest, and for "4+" the cheapest with capacity ≥ 4) so the card reflects what
 * the seeker filtered for; otherwise the hostel's overall `starting_price`.
 */
function priceForCapacity(h: ApiHostel, capacity?: string): number {
  const rooms = h.room_types ?? [];
  if (capacity && rooms.length) {
    const matches =
      capacity === '4plus'
        ? rooms.filter((r) => (r.capacity ?? 0) >= 4)
        : rooms.filter((r) => r.capacity === Number(capacity));
    const prices = matches
      .map((r) => r.price)
      .filter((p): p is number => p != null);
    if (prices.length) return Math.round(Math.min(...prices));
  }
  return Math.round(h.starting_price ?? 0);
}

/**
 * Map a backend search_data hostel to the frontend Listing model. `capacity` (when set)
 * switches the displayed price to that room type's price.
 */
function toListing(h: ApiHostel, capacity?: string): Listing {
  const lat =
    typeof h.latitude === 'string'
      ? parseFloat(h.latitude)
      : (h.latitude ?? h.location?.lat ?? 0);
  const lng =
    typeof h.longitude === 'string'
      ? parseFloat(h.longitude)
      : (h.longitude ?? h.location?.lon ?? 0);
  const area = h.area || h.city || '';
  const type = h.property_type ? cap(h.property_type) : 'Stay';
  const images = (h.attachments ?? [])
    .map((a) => a?.url)
    .filter((u): u is string => !!u);

  return {
    id: String(h.id),
    slug: String(h.id), // search_data has no slug — the numeric id doubles as the route key
    name: area ? `${type} in ${area}` : type, // search_data carries no name — derive it (Airbnb-style)
    area: h.area ?? '',
    city: h.city ?? '',
    gender: GENDER_MAP[h.gender_type ?? ''] ?? 'coliving',
    verified: h.status?.slug === 'active',
    sharing: [], // not part of the public search payload
    amenities: [], // not part of the public search payload
    priceFrom: priceForCapacity(h, capacity),
    images: images.length
      ? images
      : [`https://picsum.photos/seed/hh-be-${h.id}/800/800`],
    lat,
    lng,
    host: h.host
      ? { id: String(h.host.id), name: h.host.name, since: 0, verified: false }
      : undefined,
    description: h.description ?? undefined,
  };
}

/**
 * Listings API — calls GET /public/hostels with bounding-box and filter params.
 * Maps the Rails response to the frontend Listing model.
 */
@Injectable({ providedIn: 'root' })
export class ListingsApi {
  private readonly api = inject(ApiClient);

  list(query: ListingQuery = {}): Observable<Paginated<Listing>> {
    const {
      city,
      gender = 'all',
      propertyType,
      capacity,
      minPrice,
      maxPrice,
      near,
      bounds,
      sort = 'recommended',
      page = 1,
      pageSize = 20,
    } = query;

    // Build Rails-style nested filter params
    const params: Record<string, string | number> = {};

    // Bounding box — exact viewport bounds take priority, then center+radius, then global
    if (bounds) {
      params['f[bounding][north]'] = bounds.north;
      params['f[bounding][south]'] = bounds.south;
      params['f[bounding][east]'] = bounds.east;
      params['f[bounding][west]'] = bounds.west;
    } else if (near) {
      const radiusKm = near.radiusKm ?? 60;
      const latDelta = radiusKm / 111;
      const lngDelta = radiusKm / (111 * Math.cos((near.lat * Math.PI) / 180));
      params['f[bounding][north]'] = near.lat + latDelta;
      params['f[bounding][south]'] = near.lat - latDelta;
      params['f[bounding][east]'] = near.lng + lngDelta;
      params['f[bounding][west]'] = near.lng - lngDelta;
    } else {
      params['f[bounding][north]'] = 90;
      params['f[bounding][south]'] = -90;
      params['f[bounding][east]'] = 180;
      params['f[bounding][west]'] = -180;
    }

    // City fallback (used only when there's no map viewport). Full-text `s[...]` is
    // forgiving — lowercased + edge-ngram — unlike an exact term on the raw analyzed field.
    if (city) params['s[city]'] = city;

    // Enum filters. parse_key (search_helper) auto-appends `.keyword` to any field ending in
    // "type", so these are exact term matches — including the hyphenated "co-living".
    if (gender !== 'all')
      params['f[gender_type]'] = gender === 'coliving' ? 'co-living' : gender;
    if (propertyType) params['f[property_type]'] = propertyType;

    // Room capacity — exact match for 1–4; "4+" becomes a >= bound on the nested
    // room_types.capacity field (a hostel matches if it has a room type that size).
    if (capacity) {
      if (capacity === '4plus') params['f[room_types.capacity][gte]'] = 4;
      else params['f[room_types.capacity]'] = +capacity;
    }

    // Budget band → range on the single `starting_price` (the displayed "from" price). The
    // payload no longer carries min_price/max_price; filtering on those returns zero results
    // (verified live) — f[starting_price][gte|lte] is the supported budget filter.
    if (minPrice != null) params['f[starting_price][gte]'] = minPrice;
    if (maxPrice != null) params['f[starting_price][lte]'] = maxPrice;

    // Sort: the backend reads a `sort[field]=order` hash; a bare `sort=` is dropped by the
    // strong-params permit. 'newest'/'oldest' order by listing date (sort[created_at]); the price
    // options order by the displayed "from" price (sort[starting_price]). Omitting it lets the
    // backend default (id desc → newest first).
    if (sort === 'newest') params['sort[created_at]'] = 'desc';
    else if (sort === 'oldest') params['sort[created_at]'] = 'asc';
    else if (sort === 'price-asc') params['sort[starting_price]'] = 'asc';
    else if (sort === 'price-desc') params['sort[starting_price]'] = 'desc';

    // NOTE: `sharing` and `amenities` are intentionally NOT sent — they aren't part of the
    // hostel search index (search_data), so the public endpoint can't filter on them; sending
    // them would term-match a non-existent field and return zero results.

    params['page'] = page;
    params['limit'] = pageSize; // backend reads per_page from `limit` (PublicController#hostels)

    return this.api
      .get<
        | ApiHostel[]
        | {
            hostels: ApiHostel[];
            // Rails/Searchkick envelope: { current_page, total_pages, total_count, … }.
            pagination?: {
              total_count?: number;
              current_page?: number;
              total_pages?: number;
            };
            // Legacy/alternate envelope kept as a fallback.
            meta?: { total?: number; page?: number };
          }
      >('/public/hostels', params)
      .pipe(
        map((res) => {
          const raw: ApiHostel[] = Array.isArray(res)
            ? res
            : (res.hostels ?? []);
          const pg = Array.isArray(res) ? undefined : res.pagination;
          const meta = Array.isArray(res) ? undefined : res.meta;
          const items: Listing[] = raw.map((h) => toListing(h, capacity));
          // Sorting is handled server-side via sort[starting_price]; no client-side re-sort needed.

          return {
            items,
            // True total across all pages — the API's `pagination.total_count`, with the
            // legacy `meta.total` and then the page length as fallbacks.
            total: pg?.total_count ?? meta?.total ?? items.length,
            page: pg?.current_page ?? meta?.page ?? page,
            pageSize,
            totalPages: pg?.total_pages,
          };
        }),
      );
  }

  getBySlug(slug: string): Observable<Listing | undefined> {
    // Try fetching from public endpoint and find by slug/id
    return this.api
      .get<
        ApiHostel[] | { hostels: ApiHostel[] }
      >('/public/hostels', { 'f[bounding][north]': 90, 'f[bounding][south]': -90, 'f[bounding][east]': 180, 'f[bounding][west]': -180 })
      .pipe(
        map((res) => {
          const raw: ApiHostel[] = Array.isArray(res)
            ? res
            : (res.hostels ?? []);
          const match = raw.find((h) => String(h.id) === slug);
          return match ? toListing(match) : undefined;
        }),
      );
  }
}
