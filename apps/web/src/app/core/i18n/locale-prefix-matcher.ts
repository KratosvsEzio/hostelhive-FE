import { CanMatchFn, Route, UrlSegment } from '@angular/router';
import { PREFIXED_LOCALE_CODES } from './locales';

/**
 * Matches only when the first URL segment is a language we actually serve.
 *
 * Without this the `:locale` route would swallow every path — `/hostels/lahore` would
 * match with `locale = 'hostels'` and the real route would never be reached. The list is
 * closed deliberately: an unknown code should fall through to the normal tree and 404 or
 * render in English, not produce a page that half-exists in a language nobody translated.
 *
 * `en` is absent from the list on purpose. It is served unprefixed, so `/en/…` is not a
 * valid URL here — it would be a second address for a page that already has one.
 */
export const localePrefixMatcher: CanMatchFn = (_route: Route, segments: UrlSegment[]) =>
  PREFIXED_LOCALE_CODES.includes(segments[0]?.path ?? '');
