/**
 * Resolves a `/search/<slug>` segment back to a real point on the map.
 *
 * Search URLs are readable by design — `/search/lahore`, `/search/punjab-university` — but
 * the slug is normally decoration: coordinates travel as query params and they are what
 * drive the map. That holds right up until someone *pastes* the URL, which carries the slug
 * and nothing else. The page then names a place in its heading while searching the whole
 * country.
 *
 * This resolves the slug against the same two tables the landing pages are built from, so a
 * pasted link scopes to what it claims. It is deliberately a lookup and not a geocoder call:
 * blocking first paint on a network round trip to place a slug we may not recognise is a
 * worse trade than searching country-wide, which is at least honest about its scope.
 */
import { PLACES } from './places';
import { UNIVERSITIES } from './universities';

export interface SearchSlugPlace {
  /** Display name for the heading and the search field — "UET Lahore", not "Uet Lahore". */
  name: string;
  lat: number;
  lng: number;
  /** Matches the landing pages, so /search/lahore and /hostels/lahore open the same camera. */
  zoom: number;
}

/** A city frame — wide enough to hold the whole place. */
const CITY_ZOOM = 11;
/** A campus frame — "near NUST" means walking distance, not the far side of Islamabad. */
const CAMPUS_ZOOM = 13;

/**
 * `"lahore"` → Lahore's centre. `"punjab-university"` → the Quaid-e-Azam campus.
 * `null` for anything uncurated ("dha-phase-5"), which keeps searching country-wide.
 *
 * Cities are checked first: they are the common case, and no slug appears in both tables.
 */
export function resolveSearchSlug(slug: string | null | undefined): SearchSlugPlace | null {
  if (!slug) return null;
  const place = PLACES.find((p) => p.slug === slug);
  if (place) {
    return { name: place.name, lat: place.lat, lng: place.lng, zoom: CITY_ZOOM };
  }
  const uni = UNIVERSITIES.find((u) => u.slug === slug);
  if (uni) {
    return { name: uni.shortName, lat: uni.lat, lng: uni.lng, zoom: CAMPUS_ZOOM };
  }
  return null;
}
