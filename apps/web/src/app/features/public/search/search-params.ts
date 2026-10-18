import { ParamMap } from '@angular/router';
import { AccommodationType } from '@hostelhive/data-access';
import { isSortOffered } from '@features/public/search/search-sort';
import { ACCOMMODATION_LABELS } from '@util/accommodation-type';

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
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
  if (!seed && !badGender && !badSort) return query;

  const base = seed ?? {};
  const badSeedSort = hasOwn(base, 'sort') && !isSortOffered(base['sort'], type);
  const inQuery = (key: string): boolean =>
    !!query?.has(key) && !(key === 'gender' && badGender) && !(key === 'sort' && badSort);
  const inSeed = (key: string): boolean =>
    hasOwn(base, key) && !(key === 'sort' && badSeedSort);

  return {
    get: (key: string) => (inQuery(key) ? query?.get(key) : null) ?? (inSeed(key) ? base[key] : null),
    has: (key: string) => inQuery(key) || inSeed(key),
    getAll: (key: string) => {
      const fromQuery = inQuery(key) ? (query?.getAll(key) ?? []) : [];
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
