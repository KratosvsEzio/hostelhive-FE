import { GENDER_SEGMENTS, PLACES } from './places';
import { UNIVERSITIES } from './universities';
import {
  INDEXED_LOCALE_CODES,
  localeAlternates,
  splitLocale,
  withLocale,
} from '@core/i18n/locales';

/**
 * Every URL that belongs in `sitemap.xml`.
 *
 * Derived from `PLACES` rather than hand-listed, so adding a landing page adds its
 * sitemap entry too — a sitemap maintained separately from the routes it describes is a
 * sitemap that goes stale the first time someone is in a hurry.
 *
 * Paths only. The server prefixes the origin, so this stays usable from a build script or
 * a test without knowing the deployment host.
 *
 * **Deliberately excluded:**
 * - `/search` and `/search/:location` — canonicalised onto their landing page, or
 *   `noindex` when filtered. Listing a URL here that tells crawlers not to index it is
 *   contradictory guidance.
 * - `/hostel/:id` listing pages — the public search payload carries no slug, so their
 *   URLs are opaque ids, and they churn constantly. Category pages are what rank; see
 *   the note in `places.ts` about faceted bloat.
 * - The consoles, auth screens and per-user areas — all `Disallow`ed in robots.txt.
 * - `/mess/confirm` — reached with a token in the query; nothing to index.
 */

/** Static public pages, in rough order of importance. */
const STATIC_PATHS = [
  '/',
  '/about',
  '/faqs',
  '/blog',
  '/contact',
  '/careers',
  '/privacy-policy',
  '/terms-of-service',
  '/service-policy',
] as const;

/**
 * The paths worth indexing, each carrying a language.
 *
 * Every URL is prefixed — `/en/hostels/lahore`, not `/hostels/lahore` — because the bare
 * form only redirects. Listing a redirect in a sitemap spends crawl budget arriving at a
 * 302 and tells Google the wrong address for the page.
 *
 * Every language the page genuinely exists in gets its own entry — see
 * `INDEXED_LOCALE_CODES`. A locale that still falls back to English is left out on
 * purpose: listing it would offer a search engine the same page a second time under a
 * different address, which is the definition of a duplicate.
 */
export function sitemapPaths(): string[] {
  const landing = PLACES.flatMap((p) => [
    `/hostels/${p.slug}`,
    ...Object.keys(GENDER_SEGMENTS).map((g) => `/hostels/${p.slug}/${g}`),
  ]);
  // Campus pages. Listed explicitly rather than derived from the city, because a
  // university only has a page when one was written for it.
  const campuses = UNIVERSITIES.map((u) => `/hostels/${u.placeSlug}/${u.slug}`);
  return [...STATIC_PATHS, ...landing, ...campuses].flatMap((p) =>
    INDEXED_LOCALE_CODES.map((code) => withLocale(code, p)),
  );
}

/**
 * Renders the paths as a sitemap document, each entry carrying its `hreflang` set.
 *
 * The alternates are repeated inside every `<url>` rather than stated once, because that
 * is what the protocol asks for: a set is only valid if each member names all of the
 * others *and* itself. It makes the file larger and is not optional.
 *
 * Duplicating what `Seo` puts in the page head is also deliberate. A crawler that reaches
 * a page by following a link reads the head; one working from the sitemap may not have
 * fetched the page yet. Saying it in both places is how the set survives either route in.
 */
export function renderSitemap(origin: string, paths: string[]): string {
  const urls = paths
    .map((path) => {
      const { path: basePath } = splitLocale(path);
      const alternates = localeAlternates(basePath)
        .map(
          (a) =>
            `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${origin}${a.path}"/>`,
        )
        .join('\n');
      return `  <url>\n    <loc>${origin}${path}</loc>\n${alternates}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}
