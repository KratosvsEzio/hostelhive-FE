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
}

/**
 * English is the default and is served unprefixed (`/hostels/lahore`, not `/en/...`).
 *
 * Two URLs for the same content split its ranking, and `/en/` as a synonym for `/` is
 * exactly that. Every other locale carries its prefix.
 */
export const DEFAULT_LOCALE = 'en';

export const LOCALES: readonly Locale[] = [
  { code: 'en', name: 'English', englishName: 'English', dir: 'ltr' },
  { code: 'ur', name: 'اردو', englishName: 'Urdu', dir: 'rtl' },
  { code: 'ar', name: 'العربية', englishName: 'Arabic', dir: 'rtl' },
  { code: 'hi', name: 'हिन्दी', englishName: 'Hindi', dir: 'ltr' },
  { code: 'zh', name: '中文', englishName: 'Chinese', dir: 'ltr' },
  { code: 'ja', name: '日本語', englishName: 'Japanese', dir: 'ltr' },
  { code: 'fr', name: 'Français', englishName: 'French', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', englishName: 'German', dir: 'ltr' },
  { code: 'es', name: 'Español', englishName: 'Spanish', dir: 'ltr' },
  { code: 'it', name: 'Italiano', englishName: 'Italian', dir: 'ltr' },
  { code: 'nl', name: 'Nederlands', englishName: 'Dutch', dir: 'ltr' },
  { code: 'sv', name: 'Svenska', englishName: 'Swedish', dir: 'ltr' },
  { code: 'da', name: 'Dansk', englishName: 'Danish', dir: 'ltr' },
  { code: 'hu', name: 'Magyar', englishName: 'Hungarian', dir: 'ltr' },
] as const;

export const LOCALE_CODES: readonly string[] = LOCALES.map((l) => l.code);

/** Every locale except the default — the set that actually appears as a URL prefix. */
export const PREFIXED_LOCALE_CODES: readonly string[] = LOCALE_CODES.filter(
  (c) => c !== DEFAULT_LOCALE,
);

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
export function splitLocale(url: string): { locale: string; path: string } {
  const [pathname] = url.split(/[?#]/);
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (first && PREFIXED_LOCALE_CODES.includes(first)) {
    return { locale: first, path: '/' + segments.slice(1).join('/') };
  }
  return { locale: DEFAULT_LOCALE, path: pathname || '/' };
}

/** The inverse: `('ur', '/hostels/lahore')` → `/ur/hostels/lahore`. */
export function withLocale(locale: string, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}
