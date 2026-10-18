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

/** The keys with a fixed vocabulary, each judged on its own — see {@link mergeSearchParams}. */
const CHECKED_ALONE = new Map<string, Normaliser>([
  ['roomType', normaliseRoomType],
  ['propertyType', (value) => (isPropertyType(value) ? value : null)],
]);

/**
 * The keys judged on their own that the query carries wrongly, and what each should read as.
 *
 * That is its values with any alias applied, or null when one of them is outside the vocabulary
 * and the whole key is discarded. A key that reads as it stands is left out.
 */
function correctedAlone(query: ParamMap | null): Map<string, string[] | null> {
  const corrected = new Map<string, string[] | null>();
  for (const [key, normalise] of CHECKED_ALONE) {
    if (!query?.has(key)) continue;
    const asked = query.getAll(key);
    const read = asked.map(normalise);
    const kept = read.filter((value): value is string => value !== null);
    if (kept.length < read.length) corrected.set(key, null);
    else if (kept.some((value, i) => value !== asked[i])) corrected.set(key, kept);
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
  return Object.fromEntries(entries);
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
 * `roomType` and `propertyType` have a fixed vocabulary too, so each is judged on its own (see
 * `CHECKED_ALONE`), in the query and the seed alike. A value outside it, or any one of a repeated
 * key's values, makes the whole key read as absent, and an absent `roomType` is the default,
 * shared. Left as it was, the request sent the stranger as a term no hostel carries, so the list
 * went empty while the badge counted it. The one value not simply dropped is the backend's own
 * `private_room`, read as `private`, the word the filters use, rather than as its opposite.
 *
 * Returns the query untouched when there is nothing to merge or correct.
 */
export function mergeSearchParams(
  query: ParamMap | null,
  seed: Record<string, string> | null,
): ParamMap | null {
  const type = typeInForce(query, seed);
  const badGender = !!query?.has('gender') && !isAccommodationType(query.get('gender'));
  // Every value is checked, so a repeated `sort` cannot hide one the type does not offer.
  const badSort =
    !!query?.has('sort') && !query.getAll('sort').every((s) => isSortOffered(s, type));
  const alone = correctedAlone(query);
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
