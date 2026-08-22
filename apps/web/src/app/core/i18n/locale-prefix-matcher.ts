import { CanMatchFn, Route, UrlSegment } from '@angular/router';
import { LOCALE_CODES } from './locales';

/**
 * Matches only when the first URL segment is a language we actually serve.
 *
 * Without this the `:locale` route would swallow every path — `/hostels/lahore` would
 * match with `locale = 'hostels'` and the real route would never be reached. The list is
 * closed deliberately: an unknown code should fall through to the normal tree and 404 or
 * render in English, not produce a page that half-exists in a language nobody translated.
 *
 * `en` is in the list like any other language: English is served at `/en/…`, not at the
 * bare path, so that every page has one shape and none is a special case.
 */
export const localePrefixMatcher: CanMatchFn = (_route: Route, segments: UrlSegment[]) =>
  LOCALE_CODES.includes(segments[0]?.path ?? '');
