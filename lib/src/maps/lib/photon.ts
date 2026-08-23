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
 * How hard to pull results toward {@link PhotonSearchOptions.bias}.
 *
 * Photon scales this 0–20, the same numbers as a map zoom: low values barely tilt the
 * ranking, high values all but exclude anything far away. 12 is roughly city-sized —
 * enough that someone in Amsterdam typing "central" gets Amsterdam Centraal first, and
 * not so much that typing "Lahore" fails to find Lahore.
 */
const BIAS_SCALE = 12;

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

/** Options for {@link photonSearch}. */
export interface PhotonSearchOptions {
  signal?: AbortSignal;
  placesOnly?: boolean;
  /**
   * Where the person searching is, so nearby places rank first. Ranking only — it is
   * not a filter, and somewhere on the far side of the world is still reachable by
   * name.
   */
  bias?: { lat: number; lng: number } | null;
}

/**
 * Forward geocode for the typeahead: free text → matching places, best first. A single
 * call already carries coordinates, address parts and (for areas) a bounding box.
 *
 * `placesOnly` restricts to settlements — cities, towns, villages, suburbs — via
 * `osm_tag=place`, dropping streets, houses and POIs. It maps the old Google `['(cities)']`
 * filter onto the address form's city field.
 *
 * Searches the whole world. It used to be pinned to a Pakistan bounding box, which
 * stopped making sense once the map opens on whichever country the visitor is in: the
 * box either contradicts what they are looking at, or — pinned to their own country
 * instead — hides the listings, which are somewhere else entirely. `bias` gets the
 * useful half of that (near things first) without the half that hides results.
 */
export async function photonSearch(
  query: string,
  opts: PhotonSearchOptions = {},
): Promise<PhotonFeature[]> {
  const params = new URLSearchParams({
    q: query,
    limit: '8',
    lang: 'en',
  });
  if (opts.bias) {
    params.set('lat', String(opts.bias.lat));
    params.set('lon', String(opts.bias.lng));
    params.set('location_bias_scale', String(BIAS_SCALE));
  }
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
