import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_CODES,
  hasLocalePrefix,
  dirFor,
  isLocaleCode,
  routePath,
  splitLocale,
  withLocale,
} from './locales';

describe('locale registry', () => {
  it('has English as the default', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(LOCALES[0].code).toBe('en');
  });

  // English is prefixed like everything else. The duplicate-URL risk it used to carry —
  // /en/x and /x as two addresses for one page — is handled by the bare tree redirecting
  // rather than rendering, so only one of the two ever answers.
  it('treats the default locale as a prefix like any other', () => {
    expect(LOCALE_CODES).toContain('en');
    expect(hasLocalePrefix('/en/hostels/lahore')).toBe(true);
  });

  it('reports no prefix for a path that names no language', () => {
    expect(hasLocalePrefix('/hostels/lahore')).toBe(false);
    expect(hasLocalePrefix('/')).toBe(false);
    // "hostels" is not a language, however much it looks like a first segment.
    expect(hasLocalePrefix('/hostels')).toBe(false);
  });

  it('sees through a query string to the prefix', () => {
    expect(hasLocalePrefix('/de/search/lahore?place=Lahore')).toBe(true);
    expect(hasLocalePrefix('/search/lahore?place=Lahore')).toBe(false);
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
      prefixed: true,
    });
  });

  it('treats an unprefixed path as the default locale', () => {
    expect(splitLocale('/hostels/lahore')).toEqual({
      locale: 'en',
      path: '/hostels/lahore',
      prefixed: false,
    });
    expect(splitLocale('/')).toEqual({ locale: 'en', path: '/', prefixed: false });
  });

  // `/hi/...` is Hindi, but `/hostels/...` merely starts with the same letters. Matching
  // on the whole segment is what keeps a place slug from being read as a language.
  it('only matches a whole first segment', () => {
    expect(splitLocale('/hostels/lahore').locale).toBe('en');
    expect(splitLocale('/hi/hostels/lahore').locale).toBe('hi');
    expect(splitLocale('/hidden').locale).toBe('en');
  });

  // `locale` answers English either way, so this is the only thing that can tell a link
  // written in English apart from a link that named no language at all.
  it('reports whether the language came from the URL or the default', () => {
    expect(splitLocale('/en/search').prefixed).toBe(true);
    expect(splitLocale('/search').prefixed).toBe(false);
    expect(splitLocale('/de/search').prefixed).toBe(true);
    expect(splitLocale('/hidden').prefixed).toBe(false);
  });

  it('ignores the query string and hash', () => {
    expect(splitLocale('/ur/search/karachi?lat=1&lng=2').path).toBe('/search/karachi');
    expect(splitLocale('/search#top').path).toBe('/search');
  });

  it('bare locale root resolves to that locale at /', () => {
    expect(splitLocale('/ur')).toEqual({ locale: 'ur', path: '/', prefixed: true });
  });
});

describe('withLocale', () => {
  it('prefixes a non-default locale', () => {
    expect(withLocale('ur', '/hostels/lahore')).toBe('/ur/hostels/lahore');
    expect(withLocale('ur', '/')).toBe('/ur');
  });

  it('prefixes the default locale too', () => {
    expect(withLocale('en', '/hostels/lahore')).toBe('/en/hostels/lahore');
    expect(withLocale('en', '/')).toBe('/en');
  });

  it('round-trips with splitLocale for every locale', () => {
    for (const l of LOCALES) {
      const url = withLocale(l.code, '/hostels/lahore');
      expect(splitLocale(url)).toEqual({
        locale: l.code,
        path: '/hostels/lahore',
        prefixed: true,
      });
    }
  });
});

describe('routePath', () => {
  // The regression this exists for: after switching language the header hid its search bar
  // and every area check fell through to "seeker", because `/de` matches neither '/' nor
  // any '/host'-style prefix.
  it('reduces a prefixed home page to the root path', () => {
    expect(routePath('/de')).toBe('/');
    expect(routePath('/ur')).toBe('/');
    expect(routePath('/')).toBe('/');
  });

  it('strips the prefix from a nested route', () => {
    expect(routePath('/de/search/lahore')).toBe('/search/lahore');
    expect(routePath('/ur/hostels/lahore/punjab-university')).toBe(
      '/hostels/lahore/punjab-university',
    );
  });

  it('leaves an unprefixed route alone', () => {
    expect(routePath('/search/lahore')).toBe('/search/lahore');
    expect(routePath('/host/listings/new')).toBe('/host/listings/new');
  });

  it('drops the query and fragment, which no area check should see', () => {
    expect(routePath('/de/search/lahore?place=Lahore&lat=31.5')).toBe('/search/lahore');
    expect(routePath('/search?sort=newest#results')).toBe('/search');
  });

  // "hostels" is not a language, and a route segment that merely looks like one must not be
  // eaten — that would turn every listing page into the home page.
  it('does not mistake a route segment for a language code', () => {
    expect(routePath('/hostels/lahore')).toBe('/hostels/lahore');
    expect(routePath('/host')).toBe('/host');
    expect(routePath('/admin')).toBe('/admin');
  });

  // Every prefix the router actually mounts has to round-trip, or some locale silently
  // loses its chrome the way German did.
  it('round-trips every mounted locale prefix', () => {
    for (const code of LOCALE_CODES) {
      expect(routePath(withLocale(code, '/search/lahore'))).toBe('/search/lahore');
      expect(routePath(withLocale(code, '/'))).toBe('/');
    }
  });
});
