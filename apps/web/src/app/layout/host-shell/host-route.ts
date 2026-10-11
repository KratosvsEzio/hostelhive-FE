import { routePath } from '@core/i18n/locales';

/**
 * A host-console URL, below the hostel it names.
 *
 * `/en/host/nHelLt/rooms/edit/r2` → `rooms/edit/r2`; the console root → `''`.
 *
 * Through {@link routePath} rather than indexing the raw URL, because every console URL carries
 * a language: `/en/host/nHelLt/profile` splits to `['en', 'host', 'nHelLt', 'profile']`, and the
 * third segment is the hostel, not the page. Both callers of this were written before English
 * moved to `/en/…` and read the third segment; neither threw when the prefix arrived, because a
 * hostel id is a perfectly good string to compare against — it is just never the right one.
 */
export function hostPagePath(url: string): string {
  // ['host', hostelId, ...page] — routePath has already dropped the language and the query.
  return routePath(url).split('/').filter(Boolean).slice(2).join('/');
}
