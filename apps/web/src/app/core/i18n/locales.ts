/**
 * The languages HostelHive is offered in.
 *
 * `code` is a BCP-47 tag and is what appears in the URL (`/ur/hostels/lahore`) and in
 * `hreflang`. `name` is the language's name *in that language* — a Japanese speaker
 * scanning a picker looks for 日本語, not "Japanese", and a list written entirely in
 * English is a list they cannot use to escape English.
 *
 * `dir` is not decoration. Urdu and Arabic are end-to-left, which changes layout rather
 * than only text: see `docs` on the logical-property sweep. A language must not be listed
 * here until its direction actually renders correctly.
 */
export interface Locale {
  code: string;
  /** Endonym — the language's own name for itself. */
  name: string;
  /** English name, for the `title` attribute and for anyone lost in the picker. */
  englishName: string;
  dir: 'ltr' | 'rtl';
  /**
   * ISO 3166-1 alpha-2 country whose flag stands for this language in the picker.
   *
   * A flag is a country, not a language, and the two genuinely do not line up — Arabic is
   * written in twenty-odd countries, Spanish is spoken by far more people outside Spain
   * than in it. The flag is here because it is the fastest thing to recognise while
   * scanning a list of eighteen scripts, several of which a given reader cannot read at
   * all; it is decoration beside the endonym, never the label itself. Every option still
   * carries its own name and its English name, and those are what the screen reader
   * announces — the image is `aria-hidden`.
   *
   * Where a language has no single obvious country, this picks the one most readers
   * associate with it rather than pretending to be neutral.
   */
  flag: string;
  /**
   * Whether the strings are actually translated, as opposed to falling back to English.
   *
   * Only this set gets `hreflang` alternates and sitemap entries. A locale whose pages are
   * 80% English is not a version of the page in that language — it is the English page at
   * another address, and telling a search engine otherwise invites it to treat the whole
   * set as duplicates. Offering the language in the switcher is a separate question: a
   * reader who picks Swedish and gets partial English is helped; a crawler told the same
   * page exists in fourteen languages is misled.
   *
   * Flip this on as `node tools/i18n-coverage.mjs` reaches 100% for a locale.
   */
  translated?: boolean;
}

/**
 * The language assumed when a URL names none — a bare `/hostels/lahore`, or a visitor with
 * no stored preference.
 *
 * Every language carries its code in the path, English included: `/en/hostels/lahore`.
 * That costs a redirect from any unprefixed URL, and buys a scheme with no special case —
 * every page has exactly one shape, `hreflang` can name a real URL for every language
 * including English, and no code has to remember which locale is the odd one out.
 */
export const DEFAULT_LOCALE = 'en';

export const LOCALES: readonly Locale[] = [
  { code: 'en', name: 'English', englishName: 'English', dir: 'ltr', flag: 'gb', translated: true },
  { code: 'ur', name: 'اردو', englishName: 'Urdu', dir: 'rtl', flag: 'pk', translated: true },
  { code: 'ar', name: 'العربية', englishName: 'Arabic', dir: 'rtl', flag: 'sa', translated: true },
  { code: 'hi', name: 'हिन्दी', englishName: 'Hindi', dir: 'ltr', flag: 'in', translated: true },
  { code: 'zh', name: '中文', englishName: 'Chinese', dir: 'ltr', flag: 'cn', translated: true },
  { code: 'ja', name: '日本語', englishName: 'Japanese', dir: 'ltr', flag: 'jp', translated: true },
  { code: 'fr', name: 'Français', englishName: 'French', dir: 'ltr', flag: 'fr', translated: true },
  { code: 'de', name: 'Deutsch', englishName: 'German', dir: 'ltr', flag: 'de', translated: true },
  { code: 'es', name: 'Español', englishName: 'Spanish', dir: 'ltr', flag: 'es', translated: true },
  { code: 'it', name: 'Italiano', englishName: 'Italian', dir: 'ltr', flag: 'it', translated: true },
  { code: 'nl', name: 'Nederlands', englishName: 'Dutch', dir: 'ltr', flag: 'nl', translated: true },
  { code: 'sv', name: 'Svenska', englishName: 'Swedish', dir: 'ltr', flag: 'se', translated: true },
  { code: 'da', name: 'Dansk', englishName: 'Danish', dir: 'ltr', flag: 'dk', translated: true },
  { code: 'hu', name: 'Magyar', englishName: 'Hungarian', dir: 'ltr', flag: 'hu', translated: true },
  { code: 'ru', name: 'Русский', englishName: 'Russian', dir: 'ltr', flag: 'ru', translated: true },
  { code: 'id', name: 'Bahasa Indonesia', englishName: 'Indonesian', dir: 'ltr', flag: 'id', translated: true },
  { code: 'vi', name: 'Tiếng Việt', englishName: 'Vietnamese', dir: 'ltr', flag: 'vn', translated: true },
  { code: 'pl', name: 'Polski', englishName: 'Polish', dir: 'ltr', flag: 'pl', translated: true },
] as const;

/**
 * Where the flag SVGs live, as `/flags/<code>.svg`.
 *
 * Copied from the `flag-icons` package into `public/flags` rather than pulled from its
 * stylesheet: that ships 271 flags and 2.4 MB to serve the eighteen here, and its CSS
 * needs the whole directory on disk to resolve its `background-image` URLs. These are
 * plain `<img>` sources, so they cost one small request each and only when a picker opens.
 *
 * Emoji flags would have been free, but Windows has no flag glyphs at all — every option
 * would read as a bare country code on the platform most likely to be used to check this.
 */
export function flagSrc(locale: Locale): string {
  return `/flags/${locale.flag}.svg`;
}

export const LOCALE_CODES: readonly string[] = LOCALES.map((l) => l.code);

/**
 * The languages worth telling a search engine about — see {@link Locale.translated}.
 *
 * Every other locale still routes, still switches and still renders; it just does not
 * claim to be a distinct version of the page.
 */
export const INDEXED_LOCALE_CODES: readonly string[] = LOCALES.filter(
  (l) => l.translated,
).map((l) => l.code);

/**
 * The `hreflang` set for one page, as `{ hreflang, path }` pairs.
 *
 * Defined once because it is stated twice — in the page head and in the sitemap — and a
 * set that disagrees with itself is worse than one that is missing: Google drops the whole
 * cluster rather than picking a side.
 *
 * The set is self-referencing by construction (the caller's own language is in
 * `INDEXED_LOCALE_CODES`), which is what makes it reciprocal when every page emits it.
 * `x-default` comes last and repeats the default language's URL — it is not a language,
 * it is the answer to "what if none of these match the reader".
 */
export function localeAlternates(basePath: string): { hreflang: string; path: string }[] {
  return [
    ...INDEXED_LOCALE_CODES.map((code) => ({
      hreflang: code,
      path: withLocale(code, basePath),
    })),
    { hreflang: 'x-default', path: withLocale(DEFAULT_LOCALE, basePath) },
  ];
}

/**
 * True when the first path segment is a language we serve.
 *
 * The question {@link splitLocale} cannot answer on its own: it reports `en` both for
 * `/en/hostels` and for a bare `/hostels`, because the default is what an unnamed
 * language means. Callers that must know whether a prefix is *present* — the guard that
 * adds one, the rewrite that must not add a second — ask this instead.
 */
export function hasLocalePrefix(url: string): boolean {
  const [pathname] = url.split(/[?#]/);
  return LOCALE_CODES.includes(pathname.split('/').filter(Boolean)[0] ?? '');
}

export function isLocaleCode(value: string | null | undefined): boolean {
  return !!value && LOCALE_CODES.includes(value);
}

export function localeFor(code: string): Locale {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

export function dirFor(code: string): 'ltr' | 'rtl' {
  return localeFor(code).dir;
}

/**
 * Splits a URL into its locale and the rest.
 *
 * `/ur/hostels/lahore` → `{ locale: 'ur', path: '/hostels/lahore' }`
 * `/hostels/lahore`    → `{ locale: 'en', path: '/hostels/lahore' }`
 *
 * Used both to read the current locale and to build the `hreflang` alternates, so the two
 * cannot disagree about what a URL means.
 */
export function splitLocale(url: string): {
  locale: string;
  path: string;
  /**
   * Whether the language came from the URL or from the default.
   *
   * `locale` alone cannot say: an unprefixed URL and an explicit `/en/` both answer
   * English. The difference matters wherever a guess might otherwise overrule the
   * visitor — a link written in one language has to open in it, and only this tells
   * you that the link said so.
   */
  prefixed: boolean;
} {
  const [pathname] = url.split(/[?#]/);
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (first && LOCALE_CODES.includes(first)) {
    return { locale: first, path: '/' + segments.slice(1).join('/'), prefixed: true };
  }
  return { locale: DEFAULT_LOCALE, path: pathname || '/', prefixed: false };
}

/**
 * The route-matching view of a URL: no language prefix, no query, no fragment.
 *
 * Every "which area am I in" check compares against unprefixed paths — `/host/`, `/admin`,
 * `/search` — because those are what the route table declares. A language prefix breaks
 * that comparison silently: `/de` is the home page and `/de/search/lahore` is a search, but
 * neither matches `'/'` or `'/search'`. The failure only appears once somebody switches
 * language, which is exactly when nobody is looking, so the stripping belongs in one place
 * that every such check goes through.
 */
export function routePath(url: string): string {
  return splitLocale(url).path;
}

/**
 * The inverse: `('ur', '/hostels/lahore')` → `/ur/hostels/lahore`, and `('en', '/')` → `/en`.
 *
 * Prefixes unconditionally — English is not a special case. Callers decide *whether* to
 * rewrite; {@link hasLocalePrefix} is how they tell a bare path from one already carrying
 * a language.
 */
export function withLocale(locale: string, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}
