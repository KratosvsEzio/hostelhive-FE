import { AccommodationType } from '@hostelhive/data-access';
import { GenderRoutes } from '@features/public/search/search-filters/search-filters';
import { GENDER_SEGMENTS, findPlace } from './places';

/**
 * Where each accommodation type lives, seen from a gender landing page such as
 * `/hostels/lahore/girls`.
 *
 * A gender page holds its filter in the path, and a query merge can override a path's
 * filter but never remove it — so changing the type there has to change the page. Each
 * type with a segment of its own goes to that sibling, "Any type" goes up to the city
 * page, and backpacker, which has no page, goes to the city page with the type in the
 * query: one state, one URL, and the landing context kept.
 *
 * Null for anything that is not a gender page — the plain city page, a campus page, an
 * unknown segment or place. Those keep the ordinary query merge, because their path says
 * nothing about the type and there is nothing to undo.
 *
 * Paths are un-localised; the caller adds the language prefix.
 */
export function genderRoutesFor(
  placeSlug: string | null | undefined,
  segment: string | null | undefined,
): GenderRoutes | null {
  if (!segment || !Object.prototype.hasOwnProperty.call(GENDER_SEGMENTS, segment)) return null;
  const place = findPlace(placeSlug ?? null);
  if (!place) return null;

  const base = `/hostels/${place.slug}`;
  // Inverted rather than spelled out, so a renamed or added segment cannot leave a type
  // pointing at a page that no longer exists.
  const slugFor = (gender: AccommodationType): string | null =>
    Object.entries(GENDER_SEGMENTS).find(([, s]) => s.gender === gender)?.[0] ?? null;
  const routeFor = (gender: AccommodationType) => {
    const slug = slugFor(gender);
    return slug ? { path: `${base}/${slug}`, gender: null } : { path: base, gender };
  };

  return {
    all: { path: base, gender: null },
    girls: routeFor('girls'),
    boys: routeFor('boys'),
    coliving: routeFor('coliving'),
    backpacker: routeFor('backpacker'),
  };
}
