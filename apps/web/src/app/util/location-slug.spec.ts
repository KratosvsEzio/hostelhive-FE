import {
  DEFAULT_LOCATION,
  fromLocationSlug,
  searchRouteFor,
  toLocationSlug,
} from './location-slug';

describe('toLocationSlug', () => {
  it('lowercases a plain city name', () => {
    expect(toLocationSlug('Karachi')).toBe('karachi');
    expect(toLocationSlug('Islamabad')).toBe('islamabad');
  });

  it('joins a multi-part place with hyphens', () => {
    expect(toLocationSlug('Gulberg, Lahore')).toBe('gulberg-lahore');
    expect(toLocationSlug('DHA Phase 5')).toBe('dha-phase-5');
  });

  // Folded, not dropped — stripping the mark outright would give "multn".
  it('folds diacritics to their base letter', () => {
    expect(toLocationSlug('Multān')).toBe('multan');
    expect(toLocationSlug('Multan')).toBe('multan');
  });

  it('collapses runs of punctuation and trims the edges', () => {
    expect(toLocationSlug('  —Bahria   Town!! ')).toBe('bahria-town');
  });

  it('yields nothing for a name with no Latin characters', () => {
    expect(toLocationSlug('کراچی')).toBe('');
    expect(toLocationSlug('   ')).toBe('');
  });
});

describe('searchRouteFor', () => {
  it('adds the place as a path segment', () => {
    expect(searchRouteFor('Karachi')).toEqual(['/search', 'karachi']);
  });

  // An empty segment would produce "/search/" and a blank heading; the bare route reads
  // as Pakistan instead, which is what an unscoped search actually covers.
  it('falls back to the bare route when the name yields no slug', () => {
    for (const v of ['', '   ', 'کراچی', null, undefined]) {
      expect(searchRouteFor(v)).toEqual(['/search']);
    }
  });
});

describe('fromLocationSlug', () => {
  it('turns a slug back into a readable heading', () => {
    expect(fromLocationSlug('karachi')).toBe('Karachi');
    expect(fromLocationSlug('gulberg-lahore')).toBe('Gulberg Lahore');
  });

  it('survives stray hyphens', () => {
    expect(fromLocationSlug('--dha--phase-5--')).toBe('Dha Phase 5');
  });

  it('is empty for an empty slug, so the caller can fall back', () => {
    expect(fromLocationSlug('')).toBe('');
  });
});

describe('DEFAULT_LOCATION', () => {
  it('is Pakistan — an unscoped search covers the whole country', () => {
    expect(DEFAULT_LOCATION).toBe('Pakistan');
  });
});
