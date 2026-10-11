import { ParamMap } from '@angular/router';

/**
 * The URL keys carrying the map viewport, each set to `null` for a query-param merge.
 *
 * Cleared together whenever a new place search invalidates the old viewport. A search page
 * reads these once, at construction, and they beat any `lat`/`lng` for the camera and the
 * request — so a navigation that changes the place but carries the old box along lands on
 * the old area, under the new name.
 */
export const VIEWPORT_KEYS_NULLED = {
  ne_lat: null,
  ne_lng: null,
  sw_lat: null,
  sw_lng: null,
} as const;

/**
 * The URL keys naming a place, each set to `null` for a query-param merge.
 *
 * These are also the keys a landing page's path supplies as its seed, which is why they
 * are listed in one place: anything that leaves a landing page has to say all of them
 * again, or say that they are gone.
 */
export const PLACE_KEYS_NULLED = {
  place: null,
  city: null,
  lat: null,
  lng: null,
  zoom: null,
} as const;

/**
 * Retired filter params, each set to `null` for a query-param merge.
 *
 * Their controls no longer exist on screen, so an old shared URL that still carries one
 * would keep filtering by something the visitor cannot see or undo. Anything that starts a
 * new search clears them.
 */
export const RETIRED_KEYS_NULLED = {
  capacity: null,
  sharing: null,
  frequency: null,
} as const;

/**
 * The query key that marks a search as worldwide — "Search everywhere".
 *
 * A key rather than navigation state because a search with no place in its URL already
 * means something else: a bare `/search` opens on the visitor's own country. Only the URL
 * survives a refresh, a shared link and a server render, so only the URL can tell the two
 * apart.
 */
export const EVERYWHERE_KEY = 'everywhere';

const GEOGRAPHY_KEYS = new Set<string>(Object.keys(PLACE_KEYS_NULLED));

/**
 * The filters a landing page's path applies, as explicit query params for a `/search` URL.
 *
 * `/hostels/lahore/girls` filters to girls' hostels without a `?gender=` anywhere — the
 * path says it. A `/search` URL has no path to say it with, so a visitor who leaves the
 * page for a search elsewhere would silently lose a filter they could see applied. Every
 * seeded key that is not geography is therefore written out; the geography is what the
 * visitor is leaving, so it is the caller's to replace.
 *
 * Each value is the *effective* one from `params` — the merged reader, so a valid query
 * override beats the page's own value, and an invalid one has already been discarded.
 * Returns an empty object when there is no seed, or when the seed is only a place.
 */
export function seededFilters(
  seed: Record<string, string> | null,
  params: ParamMap | null,
): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const key of Object.keys(seed ?? {})) {
    if (GEOGRAPHY_KEYS.has(key)) continue;
    const value = params?.get(key) ?? seed?.[key];
    if (value) filters[key] = value;
  }
  return filters;
}
