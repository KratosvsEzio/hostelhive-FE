import {
  DEFAULT_LOCALE,
  LOCALES,
  PREFIXED_LOCALE_CODES,
  dirFor,
  isLocaleCode,
  splitLocale,
  withLocale,
} from './locales';

describe('locale registry', () => {
  it('has English as the default', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(LOCALES[0].code).toBe('en');
  });

  // `/en/hostels/lahore` alongside `/hostels/lahore` would be two URLs for one page,
  // splitting its ranking — the exact duplicate-URL failure the canonical work fixed.
  it('never prefixes the default locale', () => {
    expect(PREFIXED_LOCALE_CODES).not.toContain('en');
  });

  it('gives every locale a unique code and an endonym', () => {
    const codes = LOCALES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const l of LOCALES) {
      expect(l.name.trim()).not.toBe('');
      expect(l.englishName.trim()).not.toBe('');
    }
  });

  it('marks Urdu and Arabic end-to-left, and the rest start-to-right', () => {
    expect(dirFor('ur')).toBe('rtl');
    expect(dirFor('ar')).toBe('rtl');
    for (const l of LOCALES.filter((x) => !['ur', 'ar'].includes(x.code))) {
      expect(l.dir).toBe('ltr');
    }
  });

  it('falls back to the default for an unknown code', () => {
    expect(isLocaleCode('klingon')).toBe(false);
    expect(dirFor('klingon')).toBe('ltr');
  });
});

describe('splitLocale', () => {
  it('reads a prefixed locale off the path', () => {
    expect(splitLocale('/ur/hostels/lahore')).toEqual({
      locale: 'ur',
      path: '/hostels/lahore',
    });
  });

  it('treats an unprefixed path as the default locale', () => {
    expect(splitLocale('/hostels/lahore')).toEqual({
      locale: 'en',
      path: '/hostels/lahore',
    });
    expect(splitLocale('/')).toEqual({ locale: 'en', path: '/' });
  });

  // `/hi/...` is Hindi, but `/hostels/...` merely starts with the same letters. Matching
  // on the whole segment is what keeps a place slug from being read as a language.
  it('only matches a whole first segment', () => {
    expect(splitLocale('/hostels/lahore').locale).toBe('en');
    expect(splitLocale('/hi/hostels/lahore').locale).toBe('hi');
    expect(splitLocale('/hidden').locale).toBe('en');
  });

  it('ignores the query string and hash', () => {
    expect(splitLocale('/ur/search/karachi?lat=1&lng=2').path).toBe('/search/karachi');
    expect(splitLocale('/search#top').path).toBe('/search');
  });

  it('bare locale root resolves to that locale at /', () => {
    expect(splitLocale('/ur')).toEqual({ locale: 'ur', path: '/' });
  });
});

describe('withLocale', () => {
  it('prefixes a non-default locale', () => {
    expect(withLocale('ur', '/hostels/lahore')).toBe('/ur/hostels/lahore');
    expect(withLocale('ur', '/')).toBe('/ur');
  });

  it('leaves the default locale unprefixed', () => {
    expect(withLocale('en', '/hostels/lahore')).toBe('/hostels/lahore');
    expect(withLocale('en', '/')).toBe('/');
  });

  it('round-trips with splitLocale for every locale', () => {
    for (const l of LOCALES) {
      const url = withLocale(l.code, '/hostels/lahore');
      expect(splitLocale(url)).toEqual({ locale: l.code, path: '/hostels/lahore' });
    }
  });
});
