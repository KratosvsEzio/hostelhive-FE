import { SINGLE_LANGUAGE_PAGES, pageAlternates, pageLocales } from './content-locale';
import { INDEXED_LOCALE_CODES, isLocaleCode, localeAlternates } from './locales';

describe('single-language pages', () => {
  it('names a language the site serves for every page', () => {
    for (const [path, code] of Object.entries(SINGLE_LANGUAGE_PAGES)) {
      expect(isLocaleCode(code), path).toBe(true);
      expect(path.startsWith('/'), path).toBe(true);
    }
  });

  // A content language that falls back to English would list a page that is not really there.
  it('lists every single-language page once, in an indexed language, with no hreflang', () => {
    for (const [path, code] of Object.entries(SINGLE_LANGUAGE_PAGES)) {
      expect(INDEXED_LOCALE_CODES, path).toContain(code);
      expect(pageLocales(path), path).toEqual([code]);
      expect(pageAlternates(path), path).toEqual([]);
    }
  });

  it('lists a single-language page in its content language only', () => {
    expect(pageLocales('/privacy-policy')).toEqual(['en']);
    expect(pageLocales('/credits')).toEqual(['en']);
  });

  it('lists every other page in every indexed language', () => {
    expect(pageLocales('/about')).toEqual(INDEXED_LOCALE_CODES);
  });

  it('gives a single-language page no hreflang set, and every other page the full one', () => {
    expect(pageAlternates('/terms-of-service')).toEqual([]);
    expect(pageAlternates('/about')).toEqual(localeAlternates('/about'));
  });
});
