import { INDEXED_LOCALE_CODES, localeAlternates } from './locales';

/**
 * Pages whose content exists in one language only, keyed by their language-free path, with
 * the language it is written in.
 *
 * The site around them is translated — the header, the footer, the back link — but the
 * text itself is not: the legal pages are drafted in English and stay in English, because
 * a translation of a contract is a second contract nobody has reviewed. Every language
 * still answers at its own address, so a visitor browsing in Urdu keeps the Urdu chrome.
 * What changes is what the site tells a search engine: one page, in one language.
 *
 * So each of these canonicalises to its content language from every prefix, carries no
 * `hreflang`, and appears in the sitemap once. Claiming `/ur/privacy-policy` is a version
 * of the page in Urdu is exactly the claim `Locale.translated` (locales.ts) exists to avoid.
 *
 * The routes say the same through route data `contentLocale`; `app.routes.spec.ts` keeps
 * the two equal, so add a page to both or to neither.
 *
 * Only `'index'` routes belong here. A `'page'` route owns its head and passes its own
 * `contentLocale` to `Seo.apply` — a blog article does, since the same route also serves a
 * translated not-found page — so its sitemap entry passes the language explicitly to
 * {@link pageLocales} and {@link pageAlternates} instead. Core never imports a feature to
 * learn it.
 */
export const SINGLE_LANGUAGE_PAGES: Readonly<Record<string, string>> = {
  '/privacy-policy': 'en',
  '/terms-of-service': 'en',
  '/service-policy': 'en',
  '/credits': 'en',
};

/**
 * The languages a page is worth listing in: its content language alone for a page in one
 * language, otherwise every indexed one.
 *
 * `contentLocale` defaults to the page's entry in {@link SINGLE_LANGUAGE_PAGES}; a `'page'`
 * route, such as a blog article, passes its language explicitly.
 */
export function pageLocales(
  basePath: string,
  contentLocale: string | undefined = SINGLE_LANGUAGE_PAGES[basePath],
): readonly string[] {
  return contentLocale ? [contentLocale] : INDEXED_LOCALE_CODES;
}

/**
 * The `hreflang` set for a page — none for a page in one language.
 *
 * Alternates name the same page in other languages, and these have no other language to
 * name. A set of one would be harmless but says nothing; an empty one says what is true.
 * `contentLocale` defaults and is passed as for {@link pageLocales}.
 */
export function pageAlternates(
  basePath: string,
  contentLocale: string | undefined = SINGLE_LANGUAGE_PAGES[basePath],
): { hreflang: string; path: string }[] {
  return contentLocale ? [] : localeAlternates(basePath);
}
