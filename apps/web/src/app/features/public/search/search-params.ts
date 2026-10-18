import { ParamMap } from '@angular/router';
import { AccommodationType } from '@hostelhive/data-access';
import { isSortOffered } from '@features/public/search/search-sort';
import { ACCOMMODATION_LABELS } from '@util/accommodation-type';
import { isOccupancyType, isPrivateOccupancy } from '@util/occupancy-type';
import { isPropertyType } from '@util/property-type';

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** The value to read for one value of a key judged on its own, or null to discard it. */
type Normaliser = (value: string) => string | null;

function normaliseRoomType(value: string): string | null {
  if (isOccupancyType(value)) return value;
  // Past the check above, the only private spelling left is the backend's own, `private_room`.
  return isPrivateOccupancy(value) ? 'private' : null;
}

/** A number written out in full, within `[min, max]`; so a blank, `abc` or `Infinity` is not one. */
function numberIn(min: number, max: number): Normaliser {
  return (value) => {
    if (!value.trim()) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? value : null;
  };
}

/** The keys with a fixed vocabulary or range, each judged on its own — see {@link mergeSearchParams}. */
const CHECKED_ALONE = new Map<string, Normaliser>([
  ['roomType', normaliseRoomType],
  ['propertyType', (value) => (isPropertyType(value) ? value : null)],
  // A budget bound is a number, and not below zero.
  ['minPrice', numberIn(0, Number.MAX_SAFE_INTEGER)],
  ['maxPrice', numberIn(0, Number.MAX_SAFE_INTEGER)],
  ['lat', numberIn(-90, 90)],
  ['lng', numberIn(-180, 180)],
  ['zoom', numberIn(0, 22)],
]);

/** A coordinate means nothing without the other half, so one bad half discards both. */
const PAIRED = ['lat', 'lng'];

/**
 * The keys `SearchMap` takes out of the URL when the reader discards them: those a writer reads
 * raw and would bring back to life. The header bar reads `sort`, the budget and the coordinates
 * straight from the URL and writes them back on a search. Nothing reads `roomType`,
 * `propertyType`, `amenities` or `gender` raw, so those stay in the URL, read as absent.
 */
const STRIPPED = new Set(['sort', 'minPrice', 'maxPrice', 'lat', 'lng', 'zoom']);

/** The part of the search's vocabulary only the API can supply. */
export interface SearchVocabulary {
  /**
   * Every amenity slug the catalogue offers (`OffersApi.categories`). `null` or empty while
   * it loads, or after it failed: the amenities are then taken as they come, since there is
   * nothing to check them against.
   */
  amenities?: ReadonlySet<string> | null;
}

/**
 * The checked keys the query carries wrongly, and what each should read as.
 *
 * That is its values with any alias applied, or null when one of them is outside the vocabulary
 * and the whole key is discarded. A key that reads as it stands is left out. Amenities are
 * filtered rather than discarded whole: only the slugs the catalogue lacks go, and the key only
 * when none is left.
 */
function correctedAlone(
  query: ParamMap | null,
  vocabulary: SearchVocabulary,
): Map<string, string[] | null> {
  const corrected = new Map<string, string[] | null>();
  for (const [key, normalise] of CHECKED_ALONE) {
    if (!query?.has(key)) continue;
    const asked = query.getAll(key);
    const read = asked.map(normalise);
    const kept = read.filter((value): value is string => value !== null);
    if (kept.length < read.length) corrected.set(key, null);
    else if (kept.some((value, i) => value !== asked[i])) corrected.set(key, kept);
  }
  if (PAIRED.some((key) => corrected.get(key) === null)) {
    for (const key of PAIRED) if (query?.has(key)) corrected.set(key, null);
  }

  const known = vocabulary.amenities;
  if (known?.size && query?.has('amenities')) {
    const asked = query.getAll('amenities');
    const kept = [...new Set(asked.join(',').split(',').filter((slug) => known.has(slug)))];
    if (!kept.length) corrected.set('amenities', null);
    else if (asked.length > 1 || kept.join(',') !== asked[0]) {
      corrected.set('amenities', [kept.join(',')]);
    }
  }
  return corrected;
}

/** The seed with each key judged on its own corrected the same way: aliased, or dropped. */
function correctedSeed(seed: Record<string, string>): Record<string, string> {
  const entries = Object.entries(seed).flatMap(([key, value]): [string, string][] => {
    const read = CHECKED_ALONE.get(key)?.(value);
    if (read === null) return [];
    return [[key, read ?? value]];
  });
  const corrected = Object.fromEntries(entries);
  if (PAIRED.some((key) => hasOwn(seed, key) && !hasOwn(corrected, key))) {
    for (const key of PAIRED) delete corrected[key];
  }
  return corrected;
}

/** True for the four accommodation types the search knows; false for anything else, empty included. */
export function isAccommodationType(value: string | null | undefined): value is AccommodationType {
  return !!value && hasOwn(ACCOMMODATION_LABELS, value);
}

/** The type the search is narrowed to: a valid query `gender`, else a valid seed one, else none. */
function typeInForce(
  query: ParamMap | null,
  seed: Record<string, string> | null,
): AccommodationType | 'all' {
  const asked = query?.get('gender');
  if (isAccommodationType(asked)) return asked;
  const seeded = seed?.['gender'];
  return isAccommodationType(seeded) ? seeded : 'all';
}

/** True when the query carries a `sort` the type in force does not offer. */
function hasBadSort(query: ParamMap | null, type: AccommodationType | 'all'): boolean {
  // Every value is checked, so a repeated `sort` cannot hide one the type does not offer.
  return !!query?.has('sort') && !query.getAll('sort').every((s) => isSortOffered(s, type));
}

/**
 * The filters in force: the query string, with a host page's `seed` beneath it.
 *
 * Query wins over seed key by key, so a visitor on `/hostels/lahore` who changes the
 * budget gets what they picked, and the seed only fills what the URL does not say.
 *
 * `gender` and `sort` are checked on the way in. An unknown or empty `?gender=` is read as
 * absent: on a landing page the page's own type applies, and elsewhere there is no type.
 * Left as it was, the request sent it to the API as a filter that matches nothing, while
 * anything that validated it showed "Any type" above that empty list. Deciding it here,
 * in the one reader both of them use, is what keeps the filter row and the request from
 * disagreeing.
 *
 * A `sort` the type in force does not offer (see `sortsFor`) is read as absent too, from
 * the query and the seed alike: a price sort with no type would rank nightly and monthly
 * prices against each other. A shared link or a bookmark can still carry one, so it is
 * decided here, where the request, the badge and the sort control all read it.
 *
 * `roomType`, `propertyType`, the budget and the coordinates have a fixed vocabulary or range,
 * so each is judged on its own (see `CHECKED_ALONE`), in the query and the seed alike. A value
 * outside it, or any one of a repeated key's values, makes the whole key read as absent, and an
 * absent `roomType` is the default, shared. One bad half of `lat`/`lng` discards both. Left as
 * they were, the request sent the stranger as a term no hostel carries (or as `NaN`), so the
 * list went empty or widened while the badge counted it. The one value not simply dropped is
 * the backend's own `private_room`, read as `private`, the word the filters use, rather than as
 * its opposite. Once `vocabulary` supplies the catalogue, amenity slugs it does not offer are
 * taken out of the list.
 *
 * Returns the query untouched when there is nothing to merge or correct.
 */
export function mergeSearchParams(
  query: ParamMap | null,
  seed: Record<string, string> | null,
  vocabulary: SearchVocabulary = {},
): ParamMap | null {
  const type = typeInForce(query, seed);
  const badGender = !!query?.has('gender') && !isAccommodationType(query.get('gender'));
  const badSort = hasBadSort(query, type);
  const alone = correctedAlone(query, vocabulary);
  if (!seed && !badGender && !badSort && !alone.size) return query;

  const base = seed ? correctedSeed(seed) : {};
  const badSeedSort = hasOwn(base, 'sort') && !isSortOffered(base['sort'], type);
  const inQuery = (key: string): boolean =>
    !!query?.has(key) &&
    !(key === 'gender' && badGender) &&
    !(key === 'sort' && badSort) &&
    alone.get(key) !== null;
  const inSeed = (key: string): boolean =>
    hasOwn(base, key) && !(key === 'sort' && badSeedSort);
  const queryAll = (key: string): string[] => alone.get(key) ?? query?.getAll(key) ?? [];

  return {
    get: (key: string) =>
      (inQuery(key) ? (alone.get(key)?.[0] ?? query?.get(key)) : null) ??
      (inSeed(key) ? base[key] : null),
    has: (key: string) => inQuery(key) || inSeed(key),
    getAll: (key: string) => {
      const fromQuery = inQuery(key) ? queryAll(key) : [];
      if (fromQuery.length) return fromQuery;
      return inSeed(key) && base[key] ? [base[key]] : [];
    },
    get keys() {
      return [
        ...new Set([...(query?.keys ?? []).filter(inQuery), ...Object.keys(base).filter(inSeed)]),
      ];
    },
  } as ParamMap;
}

/**
 * The query-param patch (for a `merge`) that takes out of the URL the discarded values a writer
 * would bring back to life (see `STRIPPED`): a `sort` the type does not offer, a bad budget, and
 * bad coordinates or zoom, each as `null`. Empty when there is nothing to take out.
 *
 * Everything else `mergeSearchParams` discards stays in the URL, read as absent.
 */
export function searchUrlCorrections(
  query: ParamMap | null,
  seed: Record<string, string> | null,
): Record<string, null> {
  const patch: Record<string, null> = {};
  if (hasBadSort(query, typeInForce(query, seed))) patch['sort'] = null;
  for (const [key, read] of correctedAlone(query, {})) {
    if (read === null && STRIPPED.has(key)) patch[key] = null;
  }
  return patch;
}
