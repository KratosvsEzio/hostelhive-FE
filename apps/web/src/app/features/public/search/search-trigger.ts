import type { GoogleAnalyticsEvents } from '@core/google-analytics/google-analytics.events';

/**
 * What made the search page run a fresh search, for the `trigger` parameter of the
 * `search_performed` GA event (Trello #157).
 *
 * Every page-1 refetch is reported, and most of them are not a seeker searching: each
 * settled pan or zoom feeds the viewport into the query too. Without this, a session of
 * map browsing counted as a dozen searches, one step up the funnel from the page-view
 * inflation #144 removed. With it, GA can report searches with `trigger != map`.
 *
 * - `arrival`: the page opened — a link, a refresh, Back into it.
 * - `place`: a new place — the place field, Near me, the header bar, Back to another place.
 * - `everywhere`: "Search everywhere".
 * - `filter`: a filter, the sort, or the currency the budget is priced in.
 * - `map`: only the viewport changed — a pan or zoom, or the camera settling on its own.
 * - `retry`: the same search again, after a rate-limit cooldown or "Try again".
 */
export type SearchTrigger =
  GoogleAnalyticsEvents['search_performed']['trigger'];

/**
 * Navigation `state` key a search started elsewhere uses to say what started it.
 *
 * A place pick from bare `/search` goes to `/search/<slug>`, a different route config, so
 * it builds a new search page whose first search would otherwise read as an arrival.
 */
export const SEARCH_TRIGGER_STATE_KEY = 'searchTrigger';

const TRIGGERS: readonly SearchTrigger[] = [
  'arrival',
  'place',
  'everywhere',
  'filter',
  'map',
  'retry',
];

export function isSearchTrigger(value: unknown): value is SearchTrigger {
  return TRIGGERS.includes(value as SearchTrigger);
}

/**
 * When several changes are coalesced into one request by the debounce, the strongest names
 * it: a place pick also moves the camera, and that settle is part of the place search.
 * "Search everywhere" outranks a place because it clears the place keys from the URL,
 * which on its own reads as a change of place.
 */
const RANK: Record<SearchTrigger, number> = {
  retry: 0,
  map: 1,
  filter: 2,
  place: 3,
  everywhere: 4,
  arrival: 5,
};

export function strongerTrigger(
  a: SearchTrigger | null,
  b: SearchTrigger | null,
): SearchTrigger | null {
  if (!a) return b;
  if (!b) return a;
  return RANK[b] > RANK[a] ? b : a;
}

/** The part of the search page's query a trigger is read from. */
export interface SearchTriggerQuery {
  accommodationType?: string;
  propertyType?: string;
  roomType?: string;
  city?: string;
  near?: { lat: number; lng: number };
  bounds?: { north: number; south: number; east: number; west: number };
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  sort?: string;
}

/** One emission of the search page's request inputs. */
export interface SearchTriggerInputs {
  q: SearchTriggerQuery;
  tick: number;
  currency: string;
  /**
   * The place the URL names (its place keys and slug), however serialised. Needed because
   * the request can't always show a new place: when the camera settles on it in the same
   * tick, `near` is already replaced by the new viewport and the change reads as a pan.
   */
  where?: string;
}

const FILTER_KEYS = [
  'accommodationType',
  'propertyType',
  'roomType',
  'minPrice',
  'maxPrice',
  'amenities',
  'sort',
] as const;

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * What changed between two emissions of the request inputs, or null when nothing a search
 * depends on did (a `page` bump is the infinite list, not a new search).
 *
 * A place counts when the URL names another one, or the new query does: once the camera
 * settles on a picked place, the viewport replaces `near`, and that is the map, not
 * another place.
 * "Search everywhere" drops the place and the viewport alike, which this cannot tell from
 * a pan, so the page marks it itself.
 */
export function triggerForChange(
  prev: SearchTriggerInputs,
  next: SearchTriggerInputs,
): SearchTrigger | null {
  const placeChanged =
    next.where !== prev.where ||
    (next.q.city !== undefined && next.q.city !== prev.q.city) ||
    (next.q.near !== undefined && !same(next.q.near, prev.q.near));
  if (placeChanged) return 'place';
  if (
    next.currency !== prev.currency ||
    FILTER_KEYS.some((k) => !same(next.q[k], prev.q[k]))
  ) {
    return 'filter';
  }
  if (
    !same(next.q.bounds, prev.q.bounds) ||
    !same(next.q.near, prev.q.near) ||
    next.q.city !== prev.q.city
  ) {
    return 'map';
  }
  if (next.tick !== prev.tick) return 'retry';
  return null;
}
