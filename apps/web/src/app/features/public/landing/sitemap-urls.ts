import { GENDER_SEGMENTS, PLACES } from './places';

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

export function sitemapPaths(): string[] {
  const landing = PLACES.flatMap((p) => [
    `/hostels/${p.slug}`,
    ...Object.keys(GENDER_SEGMENTS).map((g) => `/hostels/${p.slug}/${g}`),
  ]);
  return [...STATIC_PATHS, ...landing];
}

/** Renders the paths as a sitemap document. */
export function renderSitemap(origin: string, paths: string[]): string {
  const urls = paths
    .map((path) => `  <url><loc>${origin}${path}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
