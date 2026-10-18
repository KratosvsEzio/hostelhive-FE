import { ParamMap } from '@angular/router';
import { AccommodationType, PROPERTY_TYPES } from '@hostelhive/data-access';
import { isSortOffered } from '@features/public/search/search-sort';
import { ACCOMMODATION_LABELS } from '@util/accommodation-type';
import { isOccupancyType } from '@util/occupancy-type';

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** True for the four accommodation types the search knows; false for anything else, empty included. */
export function isAccommodationType(value: string | null | undefined): value is AccommodationType {
  return !!value && hasOwn(ACCOMMODATION_LABELS, value);
}

/** True for a `PROPERTY_TYPES` slug; false for anything else, empty included. */
export function isPropertyType(value: string | null | undefined): boolean {
  return !!value && PROPERTY_TYPES.some((t) => t.value === value);
}

/** A number written out in full, so a blank, `abc` or `Infinity` is not one. */
function finite(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function inRange(value: string, min: number, max: number): boolean {
  const n = finite(value);
  return n !== null && n >= min && n <= max;
}

/**
 * What a query value has to be for its key to count. A key not listed here is not checked.
 * Every value of a repeated key has to pass, so a repeat cannot hide a bad one.
 */
function checksFor(type: AccommodationType | 'all'): Record<string, (v: string) => boolean> {
  return {
    gender: isAccommodationType,
    sort: (s) => isSortOffered(s, type),
    roomType: isOccupancyType,
    propertyType: isPropertyType,
    // A budget bound is a number, and not below zero.
    minPrice: (v) => inRange(v, 0, Number.MAX_SAFE_INTEGER),
    maxPrice: (v) => inRange(v, 0, Number.MAX_SAFE_INTEGER),
    lat: (v) => inRange(v, -90, 90),
    lng: (v) => inRange(v, -180, 180),
    zoom: (v) => inRange(v, 0, 22),
  };
}

/** The part of the search's vocabulary only the API can supply. */
export interface SearchVocabulary {
  /**
   * Every amenity slug the catalogue offers (`OffersApi.categories`). `null` or empty while
   * it loads, or after it failed: the amenities are then taken as they come, since there is
   * nothing to check them against.
   */
  amenities?: ReadonlySet<string> | null;
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

/** What in the query the search cannot use: keys read as absent, and values corrected. */
interface Review {
  dropped: Set<string>;
  /** `amenities` with the slugs the catalogue lacks taken out. Never empty: that is dropped. */
  corrected: Map<string, string>;
  badSeedSort: boolean;
}

function review(
  query: ParamMap | null,
  seed: Record<string, string> | null,
  vocabulary: SearchVocabulary,
): Review {
  const type = typeInForce(query, seed);
  const dropped = new Set<string>();
  for (const [key, ok] of Object.entries(checksFor(type))) {
    if (query?.has(key) && !query.getAll(key).every(ok)) dropped.add(key);
  }
  // A coordinate means nothing without the other half, so one bad half drops both.
  if (dropped.has('lat') || dropped.has('lng')) {
    for (const key of ['lat', 'lng']) if (query?.has(key)) dropped.add(key);
  }

  const corrected = new Map<string, string>();
  const known = vocabulary.amenities;
  if (known?.size && query?.has('amenities')) {
    const raw = query.getAll('amenities');
    const kept = [...new Set(raw.join(',').split(',').filter((s) => known.has(s)))];
    if (!kept.length) dropped.add('amenities');
    else if (raw.length > 1 || kept.join(',') !== raw[0]) corrected.set('amenities', kept.join(','));
  }

  const badSeedSort = !!seed && hasOwn(seed, 'sort') && !isSortOffered(seed['sort'], type);
  return { dropped, corrected, badSeedSort };
}

/**
 * The filters in force: the query string, with a host page's `seed` beneath it.
 *
 * Query wins over seed key by key, so a visitor on `/hostels/lahore` who changes the
 * budget gets what they picked, and the seed only fills what the URL does not say.
 *
 * Every filter value is checked on the way in (`checksFor`), and one the search cannot use
 * is read as absent: an unknown `gender`, `roomType` or `propertyType`; a budget that is not
 * a number or is below zero; a coordinate or zoom that is not a number or is out of range
 * (a bad half of `lat`/`lng` drops both); and a `sort` the type in force does not offer
 * (see `sortsFor`), from the query and the seed alike. Once `vocabulary` supplies the
 * catalogue, amenity slugs it does not offer are taken out of the list.
 *
 * Left as they were, the request sent them to the API as filters that match nothing (or as
 * `NaN`), while the Filters badge counted them and the controls showed their neutral state.
 * A shared link, a bookmark or a hand-edited URL can carry any of them, so they are decided
 * here, in the one reader the request, the badge and every control use. On a landing page,
 * a bad query value falls back to the page's own.
 *
 * Returns the query untouched when there is nothing to merge or correct.
 */
export function mergeSearchParams(
  query: ParamMap | null,
  seed: Record<string, string> | null,
  vocabulary: SearchVocabulary = {},
): ParamMap | null {
  const { dropped, corrected, badSeedSort } = review(query, seed, vocabulary);
  if (!seed && !dropped.size && !corrected.size) return query;

  const base = seed ?? {};
  const inQuery = (key: string): boolean => !!query?.has(key) && !dropped.has(key);
  const inSeed = (key: string): boolean =>
    hasOwn(base, key) && !(key === 'sort' && badSeedSort);
  const fromQuery = (key: string): string[] => {
    if (!inQuery(key)) return [];
    const fixed = corrected.get(key);
    return fixed != null ? [fixed] : (query?.getAll(key) ?? []);
  };

  return {
    get: (key: string) => fromQuery(key)[0] ?? (inSeed(key) ? base[key] : null),
    has: (key: string) => inQuery(key) || inSeed(key),
    getAll: (key: string) => {
      const fromUrl = fromQuery(key);
      if (fromUrl.length) return fromUrl;
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
 * The query-param patch (for a `merge`) that takes out of the URL what `mergeSearchParams`
 * reads as absent or corrects: `null` for a dropped key, the cleaned list for `amenities`.
 * Empty when the URL needs no cleaning.
 *
 * `gender` is left out: wherever it is written back, the type in force is written
 * (`startSearch`), and the header bar validates it itself.
 */
export function searchUrlCorrections(
  query: ParamMap | null,
  seed: Record<string, string> | null,
  vocabulary: SearchVocabulary = {},
): Record<string, string | null> {
  const { dropped, corrected } = review(query, seed, vocabulary);
  const patch: Record<string, string | null> = {};
  for (const key of dropped) if (key !== 'gender') patch[key] = null;
  for (const [key, value] of corrected) patch[key] = value;
  return patch;
}
