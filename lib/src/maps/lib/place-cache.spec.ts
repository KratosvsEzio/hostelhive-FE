import { TestBed } from '@angular/core/testing';
import { PlaceSuggestion, PlaceSuggestionCache } from './place-cache';

/** Minimal stand-in — the cache only stores these, it never reads the prediction. */
function suggestion(main: string): PlaceSuggestion {
  return {
    id: `id-${main}`,
    main,
    secondary: 'Punjab, Pakistan',
    prediction: {} as PlaceSuggestion['prediction'],
  };
}

describe('PlaceSuggestionCache', () => {
  let cache: PlaceSuggestionCache;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    cache = TestBed.inject(PlaceSuggestionCache);
  });

  it('returns undefined for a query it has not seen', () => {
    expect(cache.get('lahore', [])).toBeUndefined();
  });

  it('serves a stored result back', () => {
    const stored = [suggestion('Lahore')];
    cache.set('lahore', [], stored);
    expect(cache.get('lahore', [])).toEqual(stored);
  });

  it('ignores case and surrounding whitespace, so retyping never re-bills', () => {
    cache.set('Lahore', [], [suggestion('Lahore')]);
    expect(cache.get('  lahore  ', [])).toBeDefined();
    expect(cache.get('LAHORE', [])).toBeDefined();
  });

  it('keeps city-only results separate from unrestricted ones', () => {
    const cityOnly = [suggestion('Lahore')];
    cache.set('lahore', ['(cities)'], cityOnly);
    // Same word, different question — an unrestricted field must not get the city-only answer.
    expect(cache.get('lahore', [])).toBeUndefined();
    expect(cache.get('lahore', ['(cities)'])).toEqual(cityOnly);
  });

  it('treats the same type filter in a different order as one entry', () => {
    cache.set('lahore', ['locality', '(cities)'], [suggestion('Lahore')]);
    expect(cache.get('lahore', ['(cities)', 'locality'])).toBeDefined();
  });

  it('is a singleton, so every search field shares one cache', () => {
    cache.set('karachi', [], [suggestion('Karachi')]);
    // A second injection is the same root-provided instance.
    expect(TestBed.inject(PlaceSuggestionCache).get('karachi', [])).toBeDefined();
  });
});
