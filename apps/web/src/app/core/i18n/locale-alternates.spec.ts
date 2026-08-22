import {
  DEFAULT_LOCALE,
  INDEXED_LOCALE_CODES,
  LOCALE_CODES,
  LOCALES,
  localeAlternates,
} from './locales';

describe('localeAlternates', () => {
  const set = localeAlternates('/hostels/lahore');

  // Google drops a whole cluster when the set is not reciprocal, and reciprocity only
  // holds if each page emits the full set — including its own entry.
  it('is self-referencing: every indexed language appears', () => {
    for (const code of INDEXED_LOCALE_CODES) {
      expect(set.map((a) => a.hreflang)).toContain(code);
    }
  });

  it('names x-default for readers whose language is not in the set', () => {
    const fallback = set.find((a) => a.hreflang === 'x-default');
    expect(fallback?.path).toBe(`/${DEFAULT_LOCALE}/hostels/lahore`);
  });

  it('points each language at its own prefix of the same page', () => {
    for (const code of INDEXED_LOCALE_CODES) {
      expect(set.find((a) => a.hreflang === code)?.path).toBe(`/${code}/hostels/lahore`);
    }
  });

  // A locale still falling back to English is not a version of the page; claiming it is
  // hands a search engine a duplicate under a second address. Asserted against the
  // `translated` flag rather than a hardcoded list, so this keeps its meaning whether every
  // locale is complete (as now) or a new one is added at 0%.
  it('advertises exactly the languages marked translated', () => {
    const expected = LOCALES.filter((l) => l.translated).map((l) => l.code);
    expect(INDEXED_LOCALE_CODES).toEqual(expected);
    expect(set.filter((a) => a.hreflang !== 'x-default').map((a) => a.hreflang)).toEqual(
      expected,
    );
  });

  it('excludes any locale left unmarked', () => {
    for (const code of LOCALE_CODES.filter((c) => !INDEXED_LOCALE_CODES.includes(c))) {
      expect(set.map((a) => a.hreflang)).not.toContain(code);
    }
  });

  it('handles the home page without a trailing slash', () => {
    expect(localeAlternates('/').find((a) => a.hreflang === 'en')?.path).toBe('/en');
  });

  // Duplicate hreflang values make the set ambiguous; x-default legitimately repeats the
  // default language's *path*, so only the keys have to be unique.
  it('declares each hreflang exactly once', () => {
    const keys = set.map((a) => a.hreflang);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('emits root-relative paths, leaving the origin to the caller', () => {
    for (const a of set) {
      expect(a.path.startsWith('/')).toBe(true);
      expect(a.path).not.toMatch(/^https?:/);
    }
  });
});
