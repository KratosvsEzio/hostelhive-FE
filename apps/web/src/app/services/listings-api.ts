import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  Listing,
  ListingQuery,
  AccommodationType,
  Paginated,
} from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';
import { ApiPagination, toPageInfo } from '@util/pagination';
import { CurrencyPreference } from '@core/preferences/currency-preference';
import {
  DEFAULT_OCCUPANCY_TYPE,
  OccupancyType,
  isOccupancyType,
} from '@util/occupancy-type';

/**
 * The indexed "from" price each occupancy type is filtered against.
 *
 * A hostel carries both figures, and they are not interchangeable — a dorm bed at 12,000 and
 * a private room at 45,000 live on the same listing. Ranging a private-room search over the
 * shared price returns hostels whose *dorms* fall in the band while their private rooms cost
 * three times the seeker's ceiling, which is a worse answer than no results.
 *
 * A `Record<OccupancyType, …>` rather than a ternary so that adding a third occupancy type is
 * a compile error here instead of a silent fall back to the shared price.
 */
const OCCUPANCY_PRICE_FIELD: Record<OccupancyType, string> = {
  private: 'private_occupancy_price_from',
  shared: 'shared_occupancy_price_from',
};

/**
 * The cheapest room of one occupancy type, priced in every currency the index knows.
 *
 * `price` / `discounted_price` are in the hostel's own currency; the two hashes are the same
 * two figures converted, keyed by ISO-4217. Reading the hash rather than `price` is what lets
 * one result list quote every hostel in the seeker's currency instead of showing a Thai
 * hostel in PKR beside a Pakistani one in USD.
 *
 * **`discounted_price` is 0 when there is no discount, not free.** Every hostel in the
 * current payload has 0 across all 160-odd currencies, so treating 0 as a real price would
 * put "Rs 0" on every card in the app.
 */
export interface OccupancyPriceFrom {
  price?: number | null;
  discounted_price?: number | null;
  currency_price_hash?: Record<string, number> | null;
  currency_discounted_price_hash?: Record<string, number> | null;
}

/** A resolved pair of figures in one currency, with the code they are quoted in. */
interface ResolvedPrice {
  amount: number;
  /** Only set when a real discount exists — always strictly below {@link amount}. */
  discounted?: number;
  currency: string;
  /** Multiplier from the hostel's own currency into {@link currency}, or 1 when unconverted. */
  rate: number;
}

/**
 * The "from" price for a hostel, in the seeker's currency where the index can supply it.
 *
 * Falls back through three levels, because each one is missing in real payloads today:
 * the requested occupancy (private is `null` on every current record), then the other
 * occupancy, then the hostel's own currency when the hash has no entry for the chosen one.
 * A seeker filtering for private rooms still sees a price rather than a blank card — the
 * figure they see is simply the cheapest room the hostel actually indexes.
 *
 * `starting_price` is the last resort: the field was dropped from the search document when
 * these objects arrived, so it is only still read for any endpoint that has not caught up.
 */
function resolvePrice(
  h: ApiHostel,
  roomType: string | undefined,
  displayCurrency: string | undefined,
): ResolvedPrice {
  const own = h.currency ?? '';
  const wanted = isOccupancyType(roomType) ? roomType : DEFAULT_OCCUPANCY_TYPE;
  const other: OccupancyType = wanted === 'private' ? 'shared' : 'private';
  const block =
    (h[OCCUPANCY_PRICE_FIELD[wanted] as keyof ApiHostel] as OccupancyPriceFrom | null) ??
    (h[OCCUPANCY_PRICE_FIELD[other] as keyof ApiHostel] as OccupancyPriceFrom | null) ??
    null;

  if (!block) {
    return { amount: Math.round(h.starting_price ?? 0), currency: own, rate: 1 };
  }

  const base = block.price ?? 0;
  // An empty code, or one the index has no rate for, keeps the hostel's own currency rather
  // than silently relabelling its figures as something they are not.
  const code = displayCurrency && block.currency_price_hash?.[displayCurrency] != null
    ? displayCurrency
    : own;
  const amount = block.currency_price_hash?.[code] ?? base;
  const discounted = block.currency_discounted_price_hash?.[code] ?? 0;

  return {
    amount: Math.round(amount),
    // 0 means "no discount"; anything at or above the list price is not one either.
    discounted: discounted > 0 && discounted < amount ? Math.round(discounted) : undefined,
    currency: code,
    rate: base > 0 && amount > 0 ? amount / base : 1,
  };
}

/**
 * Raw hostel from GET /public/hostels. The endpoint runs Searchkick with `load: false`,
 * so each item is the Elasticsearch `search_data` document (backend HostelIndex), NOT
 * the AR HostelSerializer: there is no `name`, `hostel_offers`, or `banner` — only the
 * fields below (`room_types` was added to the payload later). Enums are string keys.
 */
export interface ApiHostel {
  id: number | string;
  name?: string | null;
  title?: string | null;
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
  /**
   * Legacy flat "from" price. **Dropped from the search document** when the per-occupancy
   * objects below arrived — kept only as the last fallback in {@link resolvePrice}.
   */
  starting_price?: number | null;
  /** ISO-4217 the hostel's own figures are quoted in; the hashes carry every other. */
  currency?: string | null;
  shared_occupancy_price_from?: OccupancyPriceFrom | null;
  private_occupancy_price_from?: OccupancyPriceFrom | null;

  latitude?: number | string | null;
  longitude?: number | string | null;
  nearby_landmarks?: string | null;
  host?: { id: number; name: string } | null;
  status?: { id?: number; name?: string; slug?: string } | null;
  attachments?: { url?: string; file_name?: string }[] | null;
  location?: { lat: number; lon: number } | null;
  // Amenities the hostel offers. Present on the public search payload but often empty;
  // the card simply renders no amenity pills in that case.
  offers?: { id?: number | string; name?: string; slug?: string }[] | null;
  // Pre-computed per-capacity prices (direct API fields — preferred over room_types).
  price_capacity_1?: number | null;
  price_capacity_2?: number | null;
  price_capacity_3?: number | null;
  price_capacity_4?: number | null;
  price_capacity_plus?: number | null;
  // Per-capacity room types — fallback when price_capacity_* are absent.
  room_types?:
    | {
        id: number | string;
        name?: string;
        capacity?: number;
        price?: number;
      }[]
    | null;
  is_featured?: boolean | null;
  created_at?: string | null;
  // Aggregated reviews (present once the hostel has any) — average score + total count.
  review?: { score?: number | null; count?: number | null } | null;
}

// gender_type arrives as the backend enum's string key ('co-living' has a hyphen).
const GENDER_MAP: Record<string, AccommodationType> = {
  'co-living': 'coliving',
  backpacker: 'backpacker',
  boys: 'boys',
  girls: 'girls',
};
const cap = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/** Build the priceByCapacity map from direct API fields, falling back to room_types array. */
function buildPriceByCapacity(h: ApiHostel): Record<string, number> {
  const map: Record<string, number> = {};
  const rooms = h.room_types ?? [];

  const resolve = (key: string, direct: number | null | undefined, cap: number | null): void => {
    if (direct != null) { map[key] = Math.round(direct); return; }
    if (cap != null) {
      const match = rooms.find((r) => r.capacity === cap);
      if (match?.price != null) map[key] = Math.round(match.price);
    }
  };

  resolve('1', h.price_capacity_1, 1);
  resolve('2', h.price_capacity_2, 2);
  resolve('3', h.price_capacity_3, 3);
  resolve('4', h.price_capacity_4, 4);

  const plus = h.price_capacity_plus;
  if (plus != null) {
    map['5+'] = Math.round(plus);
    map['4plus'] = Math.round(plus);
  } else {
    const match5 = rooms.find((r) => (r.capacity ?? 0) >= 5);
    if (match5?.price != null) { map['5+'] = Math.round(match5.price); map['4plus'] = map['5+']; }
  }

  return map;
}

/** Map a backend search_data hostel to the frontend Listing model. Exported so the
 *  favourites list renders through the exact same mapping and the two never drift. */
export function toListing(
  h: ApiHostel,
  opts: { currency?: string; roomType?: string } = {},
): Listing {
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
  const derivedName = h.name || h.title || (area ? `${type} in ${area}` : type);
  const images = (h.attachments ?? [])
    .map((a) => a?.url)
    .filter((u): u is string => !!u);

  const price = resolvePrice(h, opts.roomType, opts.currency);
  // Room-type prices come off the document in the hostel's own currency, so they are scaled
  // by the same rate the "from" price was converted at. Without this every price on a Listing
  // would claim `currency` while only one of them actually honoured it.
  const rawByCapacity = buildPriceByCapacity(h);
  const priceByCapacity =
    price.rate === 1
      ? rawByCapacity
      : Object.fromEntries(
          Object.entries(rawByCapacity).map(([k, v]) => [k, Math.round(v * price.rate)]),
        );
  return {
    id: String(h.id),
    slug: String(h.id), // search_data has no slug — the numeric id doubles as the route key
    name: derivedName,
    area: h.area ?? '',
    city: h.city ?? '',
    accommodationType: GENDER_MAP[h.gender_type ?? ''] ?? 'coliving',
    verified: h.status?.slug === 'active',
    propertyType: h.property_type ? cap(h.property_type) : undefined,
    sharing: [], // not part of the public search payload
    amenities: (h.offers ?? [])
      .map((o) => o?.slug)
      .filter((s): s is string => !!s),
    offerNames: (h.offers ?? [])
      .map((o) => o?.name)
      .filter((n): n is string => !!n),
    priceFrom: price.amount,
    discountedPriceFrom: price.discounted,
    currency: price.currency || undefined,
    priceByCapacity: Object.keys(priceByCapacity).length ? priceByCapacity : undefined,
    images: images.length
      ? images
      : [`https://picsum.photos/seed/hh-be-${h.id}/800/800`],
    lat,
    lng,
    host: h.host
      ? { id: String(h.host.id), name: h.host.name, since: 0, verified: false }
      : undefined,
    description: h.description ?? undefined,
    isFeatured: !!h.is_featured,
    rating: h.review?.score != null ? h.review.score : undefined,
    reviews: h.review?.count != null ? h.review.count : undefined,
    createdAt: h.created_at ?? undefined,
  };
}

/**
 * Listings API — calls GET /public/hostels with bounding-box and filter params.
 * Maps the Rails response to the frontend Listing model.
 */
@Injectable({ providedIn: 'root' })
export class ListingsApi {
  private readonly api = inject(ApiClient);
  private readonly currency = inject(CurrencyPreference);

  list(query: ListingQuery = {}): Observable<Paginated<Listing>> {
    const {
      city,
      accommodationType = 'all',
      propertyType,
      roomType,
      minPrice,
      maxPrice,
      near,
      bounds,
      sort = 'recommended',
      page = 1,
      pageSize = 20,
    } = query;

    // Build Rails-style nested filter params
    const params: Record<string, string | number | number[]> = {};

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
    if (accommodationType !== 'all')
      params['f[gender_type]'] =
        accommodationType === 'coliving' ? 'co-living' : accommodationType;
    if (propertyType) params['f[property_type]'] = propertyType;

    // Room type — private or shared, the axis that replaced capacity.
    //
    // Occupancy is a property of a room type, not of the hostel, so the key has to name the
    // association path the way `f[offers.id][]` does. It was previously sent as a flat
    // `f[room_type]`, which named a field the search document does not have — and a term on a
    // missing field matches nothing, so the filter silently narrowed to zero.
    //
    // The path ends in "type", so parse_key appends `.keyword` and this stays an exact term
    // match on the stored 'shared' / 'private' string.
    if (roomType) params['f[room_types.occupancy_type]'] = roomType;

    // Budget band → a range on the "from" price for the occupancy the seeker is shopping for.
    //
    // The field follows the Room type filter (see OCCUPANCY_PRICE_FIELD); an absent or
    // unrecognised value falls back to shared, which is what the filter itself defaults to,
    // so the query and the visible control never disagree about which price is being ranged.
    //
    // The index stores that price as a per-currency hash rather than one number, so the key
    // has to name a currency: `…currency_price_hash.PKR`. Which currency comes from the
    // seeker's own preference, so the figures they type are read in the currency they
    // actually think in instead of being compared against whatever each listing happens to
    // be priced in. Replaces `f[starting_price][gte|lte]`, which was a single unit-less
    // number and silently compared rupees against dollars.
    const priceField =
      OCCUPANCY_PRICE_FIELD[
        isOccupancyType(roomType) ? roomType : DEFAULT_OCCUPANCY_TYPE
      ];
    const budget = `f[${priceField}.currency_price_hash.${this.currency.code()}]`;
    if (minPrice != null) params[`${budget}[gte]`] = minPrice;
    if (maxPrice != null) params[`${budget}[lte]`] = maxPrice;

    // Sort: the backend reads a `sort[field]=order` hash; a bare `sort=` is dropped by the
    // strong-params permit. 'newest'/'oldest' order by listing date (sort[created_at]); the price
    // options order by the displayed "from" price (sort[starting_price]). Omitting it lets the
    // backend default (id desc → newest first).
    if (sort === 'newest') params['sort[created_at]'] = 'desc';
    else if (sort === 'oldest') params['sort[created_at]'] = 'asc';
    else if (sort === 'price-asc') params['sort[starting_price]'] = 'asc';
    else if (sort === 'price-desc') params['sort[starting_price]'] = 'desc';

    // Offer (amenity) filter — repeated f[offers.id][] keys, one per selected offer.
    if (query.offerIds?.length) {
      params['f[offers.id][]'] = query.offerIds;
    }

    params['page'] = page;
    params['limit'] = pageSize; // backend reads per_page from `limit` (PublicController#hostels)

    return this.api
      .get<
        | ApiHostel[]
        | {
            hostels: ApiHostel[];
            // Rails/Searchkick envelope: { current_page, total_pages, total_count, … }.
            pagination?: ApiPagination;
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
          const items: Listing[] = raw.map((h) =>
            toListing(h, { currency: this.currency.code(), roomType }),
          );
          // Sorting is handled server-side via sort[starting_price]; no client-side re-sort needed.

          const info = toPageInfo(pg, page, items.length);

          return {
            items,
            // `meta` is a legacy envelope some responses still carry; it only wins when the
            // modern `pagination` block is absent, which toPageInfo reports as a row-count
            // fallback rather than a real total.
            total: pg ? info.total : (meta?.total ?? items.length),
            page: pg ? info.page : (meta?.page ?? page),
            pageSize,
            totalPages: info.totalPages,
          };
        }),
      );
  }

  featured(limit = 20): Observable<Listing[]> {
    return this.api
      .get<ApiHostel[] | { hostels: ApiHostel[] }>('/public/hostels', {
        page: 1,
        limit,
      })
      .pipe(
        map((res) => {
          const raw = Array.isArray(res) ? res : (res.hostels ?? []);
          return raw.map((h) => toListing(h, { currency: this.currency.code() }));
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
          return match ? toListing(match, { currency: this.currency.code() }) : undefined;
        }),
      );
  }
}
