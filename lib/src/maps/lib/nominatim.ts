/**
 * OpenStreetMap **Nominatim** client — the free, keyless geocoder that replaces Google
 * Places. Two directions: `nominatimSearch` (text → places, backs the "Where to?"
 * typeahead) and `nominatimReverse` (coords → address, backs the location picker's pin).
 *
 * Fair-use, not a quota: the public endpoint asks for at most ~1 request/second and a
 * valid Referer, which the browser sends automatically. That is fine to launch on; at
 * scale point `BASE` at a self-hosted Nominatim (or a paid host such as LocationIQ /
 * MapTiler Geocoding) and nothing else changes — the same story as the CARTO tiles in
 * `leaflet.ts`.
 *
 * All requests use the raw `fetch` API on purpose: the app's HttpClient carries an auth
 * interceptor, and we must never attach the user's Bearer token to a third-party host.
 * Restricted to Pakistan (`countrycodes=pk`) and English labels to match the product.
 */

const BASE = 'https://nominatim.openstreetmap.org';

/** One raw Nominatim place (jsonv2 shape, with `addressdetails=1`). */
export interface NominatimPlace {
  place_id: number;
  display_name: string;
  /** Primary name of the feature (jsonv2). Can be empty for some results. */
  name?: string;
  lat: string;
  lon: string;
  /** [south, north, west, east] as strings. */
  boundingbox?: string[];
  address?: Record<string, string>;
}

/** Flat address parts — the shape both `PlaceResult` and `PickedLocation` consume. */
export interface NominatimAddressParts {
  area: string;
  city: string;
  province: string;
  country: string;
  street: string;
  formatted: string;
}

/**
 * Forward geocode: free-text → matching places, richest first. Unlike Google's
 * autocomplete this single call already carries coordinates, address components and a
 * bounding box, so the caller needs no follow-up "fetch details" request.
 *
 * `citiesOnly` maps the old Google `['(cities)']` filter onto Nominatim's
 * `featureType=settlement` (city / town / village / hamlet) — right for an address form's
 * city field, where restricting to only large cities would miss Pakistani towns.
 */
export async function nominatimSearch(
  query: string,
  opts: { signal?: AbortSignal; citiesOnly?: boolean } = {},
): Promise<NominatimPlace[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'pk',
    'accept-language': 'en',
    limit: '8',
  });
  if (opts.citiesOnly) params.set('featureType', 'settlement');
  const res = await fetch(`${BASE}/search?${params.toString()}`, {
    signal: opts.signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim search ${res.status}`);
  return (await res.json()) as NominatimPlace[];
}

/** Reverse geocode: coordinates → address parts. */
export async function nominatimReverse(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<NominatimAddressParts> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    addressdetails: '1',
    'accept-language': 'en',
  });
  const res = await fetch(`${BASE}/reverse?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim reverse ${res.status}`);
  const data = (await res.json()) as {
    display_name?: string;
    address?: Record<string, string>;
  };
  return parseNominatimAddress(data.address, data.display_name);
}

/** Map a Nominatim `address` object → our flat address parts, blanks where absent. */
export function parseNominatimAddress(
  a: Record<string, string> = {},
  displayName = '',
): NominatimAddressParts {
  const street = [a['house_number'], a['road']].filter(Boolean).join(' ');
  return {
    street,
    area:
      a['suburb'] ||
      a['neighbourhood'] ||
      a['quarter'] ||
      a['city_district'] ||
      '',
    city: a['city'] || a['town'] || a['village'] || a['county'] || '',
    province: a['state'] || a['region'] || '',
    country: a['country'] || '',
    formatted: displayName || '',
  };
}

/**
 * Pick a map zoom from how much latitude a place spans, in degrees — continuous and
 * provider-agnostic, so it needs no lookup against a place-type taxonomy: a province's box
 * is wide (low zoom), a street's is tiny (high zoom). Shared by the Nominatim and Photon
 * result mappers.
 */
export function zoomForLatSpan(span: number): number {
  if (span > 4) return 6; // province / large region
  if (span > 1.5) return 7; // division / district
  if (span > 0.6) return 9; // metro / city
  if (span > 0.25) return 10;
  if (span > 0.1) return 12; // town
  if (span > 0.04) return 13; // suburb / area
  if (span > 0.015) return 14;
  return 15; // street / point of interest
}
