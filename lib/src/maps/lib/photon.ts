import { zoomForLatSpan } from './nominatim';

/**
 * OpenStreetMap geocoding via **Photon** (Komoot) — the autocomplete-optimised
 * counterpart to Nominatim. Nominatim is tuned for accuracy and reverse lookups; Photon
 * is built for search-as-you-type: faster, returns more candidates per query, and takes a
 * `lang` so the dropdown reads in English. Keyless and free, on the same fair-use footing
 * as the rest of our OSM stack (see `nominatim.ts`): reasonable use on a shared instance,
 * self-host a Pakistan index for guaranteed speed at scale.
 *
 * Raw `fetch` on purpose — never attach the app's auth Bearer to a third-party host.
 */

const BASE = 'https://photon.komoot.io';

/**
 * Pakistan bounding box, `minLon,minLat,maxLon,maxLat`. Photon has no country-code filter
 * like Nominatim's `countrycodes=pk`, so results are constrained to this box instead.
 */
const PK_BBOX = '60.87,23.63,77.84,37.09';

/** One Photon result (GeoJSON feature). Note `coordinates` are [lon, lat]. */
export interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    district?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    /** Feature class: house, street, locality, district, city, county, state, country… */
    type?: string;
    /** [west, north, east, south] — present on features that cover an area. */
    extent?: number[];
  };
}

/**
 * Forward geocode for the typeahead: free text → matching places, best first. A single
 * call already carries coordinates, address parts and (for areas) a bounding box.
 *
 * `placesOnly` restricts to settlements — cities, towns, villages, suburbs — via
 * `osm_tag=place`, dropping streets, houses and POIs. It maps the old Google `['(cities)']`
 * filter onto the address form's city field.
 */
export async function photonSearch(
  query: string,
  opts: { signal?: AbortSignal; placesOnly?: boolean } = {},
): Promise<PhotonFeature[]> {
  const params = new URLSearchParams({
    q: query,
    limit: '8',
    lang: 'en',
    bbox: PK_BBOX,
  });
  if (opts.placesOnly) params.append('osm_tag', 'place');
  const res = await fetch(`${BASE}/api/?${params.toString()}`, {
    signal: opts.signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return data.features ?? [];
}

/** Flat address parts, blanks where absent — the shape `PlaceResult` consumes. */
export function parsePhotonAddress(p: PhotonFeature['properties'] = {}): {
  area: string;
  city: string;
  province: string;
  country: string;
  street: string;
  formatted: string;
} {
  // A settlement feature IS its own city (Photon leaves `city` blank on those).
  const isSettlement = ['city', 'town', 'village', 'locality'].includes(
    p.type ?? '',
  );
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const area = p.district || p.locality || p.suburb || p.neighbourhood || '';
  const city = p.city || (isSettlement ? p.name || '' : '') || p.county || '';
  const province = p.state || '';
  const country = p.country || '';
  // Photon returns no display string, so compose one from the hierarchy (deduped).
  const formatted = [p.name, area, city, province, country]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');
  return { area, city, province, country, street, formatted };
}

/** Zoom from a Photon feature's extent `[west, north, east, south]`, by latitude span. */
export function zoomForPhotonExtent(extent?: number[]): number | undefined {
  if (!extent || extent.length < 4) return undefined;
  const north = extent[1];
  const south = extent[3];
  if (!Number.isFinite(north) || !Number.isFinite(south)) return undefined;
  return zoomForLatSpan(Math.abs(north - south));
}
