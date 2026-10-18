import { GENDER_SEGMENTS, PLACES } from './places';
import { UNIVERSITIES } from './universities';
import { BLOG_POSTS } from '@features/public/blog/blog-posts';
import { BLOG_CONTENT_LOCALE } from '@features/public/blog/blog-post.model';
import { splitLocale, withLocale } from '@core/i18n/locales';
import { pageAlternates, pageLocales } from '@core/i18n/content-locale';

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
 *   `noindex` when filtered or when the link arrives carrying a viewport (all four
 *   `ne_*`/`sw_*` keys valid). Listing a URL here that tells crawlers not to index it is
 *   contradictory guidance.
 * - `/hostel/:id` listing pages — the public search payload carries no slug, so their
 *   URLs are opaque ids, and they churn constantly. Category pages are what rank; see
 *   the note in `places.ts` about faceted bloat.
 * - The consoles, auth screens and per-user areas — all `Disallow`ed in robots.txt.
 */

/** Static public pages, in rough order of importance. */
const STATIC_PATHS = [
  '/',
  '/about',
  '/faqs',
  '/blog',
  '/pricing',
  '/contact',
  '/careers',
  '/privacy-policy',
  '/terms-of-service',
  '/service-policy',
  '/credits',
] as const;

/** The article paths, each a page in the archive's one language. */
const ARTICLE_PATHS: ReadonlySet<string> = new Set(BLOG_POSTS.map((p) => `/blog/${p.slug}`));

/**
 * The language a page's content is written in, where the sitemap must say so itself.
 *
 * Articles are `'page'` routes, so they are not in `SINGLE_LANGUAGE_PAGES` and their language
 * comes from the archive instead. `undefined` leaves `pageLocales` and `pageAlternates` to
 * their own default.
 */
function contentLocaleOf(basePath: string): string | undefined {
  return ARTICLE_PATHS.has(basePath) ? BLOG_CONTENT_LOCALE : undefined;
}

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
 * different address, which is the definition of a duplicate. A page written in one
 * language only — the legal pages, the credits, every blog article — gets that one entry,
 * for the same reason: see `SINGLE_LANGUAGE_PAGES` (core/i18n/content-locale.ts) and
 * `BLOG_CONTENT_LOCALE`.
 */
export function sitemapPaths(): string[] {
  const landing = PLACES.flatMap((p) => [
    `/hostels/${p.slug}`,
    ...Object.keys(GENDER_SEGMENTS).map((g) => `/hostels/${p.slug}/${g}`),
  ]);
  // Campus pages. Listed explicitly rather than derived from the city, because a
  // university only has a page when one was written for it.
  const campuses = UNIVERSITIES.map((u) => `/hostels/${u.placeSlug}/${u.slug}`);
  // Articles, derived from the archive for the same reason the landing pages are: a post
  // added without its sitemap entry is a post nobody finds.
  return [...STATIC_PATHS, ...landing, ...campuses, ...ARTICLE_PATHS].flatMap((p) =>
    pageLocales(p, contentLocaleOf(p)).map((code) => withLocale(code, p)),
  );
}

/**
 * Renders the paths as a sitemap document, each entry carrying its `hreflang` set.
 *
 * The alternates are repeated inside every `<url>` rather than stated once, because that
 * is what the protocol asks for: a set is only valid if each member names all of the
 * others *and* itself. It makes the file larger and is not optional. A single-language
 * page has no set, and its entry is the `<loc>` alone — the same as its head, which
 * carries no `hreflang` either.
 *
 * Duplicating what `Seo` puts in the page head is also deliberate. A crawler that reaches
 * a page by following a link reads the head; one working from the sitemap may not have
 * fetched the page yet. Saying it in both places is how the set survives either route in.
 */
export function renderSitemap(origin: string, paths: string[]): string {
  const urls = paths
    .map((path) => {
      const { path: basePath } = splitLocale(path);
      const alternates = pageAlternates(basePath, contentLocaleOf(basePath)).map(
        (a) =>
          `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${origin}${a.path}"/>`,
      );
      return ['  <url>', `    <loc>${origin}${path}</loc>`, ...alternates, '  </url>'].join('\n');
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}
