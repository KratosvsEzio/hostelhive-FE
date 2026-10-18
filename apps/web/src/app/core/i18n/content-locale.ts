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
 */
export const SINGLE_LANGUAGE_PAGES: Readonly<Record<string, string>> = {
  '/privacy-policy': 'en',
  '/terms-of-service': 'en',
  '/service-policy': 'en',
  '/credits': 'en',
};

/**
 * The languages a page is worth listing in: its content language alone for a page in
 * {@link SINGLE_LANGUAGE_PAGES}, otherwise every indexed one.
 */
export function pageLocales(basePath: string): readonly string[] {
  const content = SINGLE_LANGUAGE_PAGES[basePath];
  return content ? [content] : INDEXED_LOCALE_CODES;
}

/**
 * The `hreflang` set for a page — none for a page in {@link SINGLE_LANGUAGE_PAGES}.
 *
 * Alternates name the same page in other languages, and these have no other language to
 * name. A set of one would be harmless but says nothing; an empty one says what is true.
 */
export function pageAlternates(basePath: string): { hreflang: string; path: string }[] {
  return SINGLE_LANGUAGE_PAGES[basePath] ? [] : localeAlternates(basePath);
}
