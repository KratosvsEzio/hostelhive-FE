import { ParamMap } from '@angular/router';
import { AccommodationType } from '@hostelhive/data-access';
import { ACCOMMODATION_LABELS } from '@util/accommodation-type';

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** True for the four accommodation types the search knows; false for anything else, empty included. */
export function isAccommodationType(value: string | null | undefined): value is AccommodationType {
  return !!value && hasOwn(ACCOMMODATION_LABELS, value);
}

/**
 * The filters in force: the query string, with a host page's `seed` beneath it.
 *
 * Query wins over seed key by key, so a visitor on `/hostels/lahore` who changes the
 * budget gets what they picked, and the seed only fills what the URL does not say.
 *
 * `gender` is the one key checked on the way in. An unknown or empty `?gender=` is read as
 * absent: on a landing page the page's own type applies, and elsewhere there is no type.
 * Left as it was, the request sent it to the API as a filter that matches nothing, while
 * anything that validated it showed "Any type" above that empty list. Deciding it here,
 * in the one reader both of them use, is what keeps the filter row and the request from
 * disagreeing.
 *
 * Returns the query untouched when there is nothing to merge or correct.
 */
export function mergeSearchParams(
  query: ParamMap | null,
  seed: Record<string, string> | null,
): ParamMap | null {
  const badGender = !!query?.has('gender') && !isAccommodationType(query.get('gender'));
  if (!seed && !badGender) return query;

  const base = seed ?? {};
  const inQuery = (key: string): boolean =>
    !!query?.has(key) && !(key === 'gender' && badGender);
  const inSeed = (key: string): boolean => hasOwn(base, key);

  return {
    get: (key: string) => (inQuery(key) ? query?.get(key) : null) ?? (inSeed(key) ? base[key] : null),
    has: (key: string) => inQuery(key) || inSeed(key),
    getAll: (key: string) => {
      const fromQuery = inQuery(key) ? (query?.getAll(key) ?? []) : [];
      if (fromQuery.length) return fromQuery;
      return inSeed(key) && base[key] ? [base[key]] : [];
    },
    get keys() {
      return [...new Set([...(query?.keys ?? []).filter(inQuery), ...Object.keys(base)])];
    },
  } as ParamMap;
}
