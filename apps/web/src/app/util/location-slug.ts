/**
 * URL slugs for the searched location, so a search reads `/search/karachi` rather than
 * `/search` with the place buried in the query string.
 *
 * The slug is **cosmetic**: `lat`/`lng` still travel as query params and are what actually
 * drive the map, so a pasted link reproduces the same view without anything having to turn
 * "karachi" back into coordinates. That keeps arbitrary places — "Gulberg", "DHA Phase 5" —
 * working exactly as they do today, with a readable URL as the only difference.
 */

/** Shown, and used as the slug, when no place has been searched. */
export const DEFAULT_LOCATION = 'Pakistan';

/**
 * "Gulberg, Lahore" → "gulberg-lahore".
 *
 * Diacritics are folded rather than dropped, so "Multān" and "Multan" produce the same
 * slug instead of "multn". A name with no Latin characters at all — an Urdu place name —
 * slugifies to nothing; callers fall back to the plain `/search` route rather than emitting
 * `/search/` with an empty segment.
 */
export function toLocationSlug(place: string): string {
  return place
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // drop the marks NFD just split off
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * "gulberg-lahore" → "Gulberg Lahore", for the page heading when the URL is all we have
 * (a pasted link carries no `place` param).
 *
 * Deliberately naive: it cannot recover the original punctuation, and it is only used when
 * the real name is absent. Whenever `place` is in the query string, that wins.
 */
export function fromLocationSlug(slug: string): string {
  const words = slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.join(' ');
}

/**
 * Router commands for a search at `place`. Falls back to the bare `/search` route — which
 * reads as {@link DEFAULT_LOCATION} — when the name yields no usable slug.
 */
export function searchRouteFor(place: string | null | undefined): string[] {
  const slug = place ? toLocationSlug(place) : '';
  return slug ? ['/search', slug] : ['/search'];
}
