import { convertToParamMap, ParamMap } from '@angular/router';
import { mergeSearchParams } from './search-params';
import {
  EVERYWHERE_KEY,
  PLACE_KEYS_NULLED,
  RETIRED_KEYS_NULLED,
  seededFilters,
  VIEWPORT_KEYS_NULLED,
} from './search-scope';

// A landing page's seed as the path supplies it: geography plus, on a gender page, the type.
const CITY_SEED = { place: 'Lahore', city: 'Lahore', lat: '31.5', lng: '74.3', zoom: '11' };
const CAMPUS_SEED = { place: 'Punjab University', lat: '31.49', lng: '74.30', zoom: '15' };
const GIRLS_SEED = { ...CITY_SEED, gender: 'girls' };

// Built through the real merge, so the effective-value rules are the page's, not a stand-in's.
function paramsFor(
  seed: Record<string, string> | null,
  query: Record<string, string> = {},
): ParamMap | null {
  return mergeSearchParams(convertToParamMap(query), seed);
}

describe('the nulled key sets', () => {
  it('names exactly the four viewport keys', () => {
    expect(Object.keys(VIEWPORT_KEYS_NULLED).sort()).toEqual([
      'ne_lat',
      'ne_lng',
      'sw_lat',
      'sw_lng',
    ]);
  });

  it('names exactly the keys a landing page seeds for geography', () => {
    expect(Object.keys(PLACE_KEYS_NULLED).sort()).toEqual(['city', 'lat', 'lng', 'place', 'zoom']);
  });

  it('names exactly the retired filter params', () => {
    expect(Object.keys(RETIRED_KEYS_NULLED).sort()).toEqual(['capacity', 'frequency', 'sharing']);
  });

  it('sets every key to null so a merge removes it', () => {
    const all = { ...VIEWPORT_KEYS_NULLED, ...PLACE_KEYS_NULLED, ...RETIRED_KEYS_NULLED };
    expect(Object.values(all).every((v) => v === null)).toBe(true);
  });

  it('keeps the everywhere marker out of the other sets', () => {
    expect(EVERYWHERE_KEY).toBe('everywhere');
    for (const set of [VIEWPORT_KEYS_NULLED, PLACE_KEYS_NULLED, RETIRED_KEYS_NULLED]) {
      expect(Object.keys(set)).not.toContain(EVERYWHERE_KEY);
    }
  });
});

describe('seededFilters', () => {
  describe('with no filter to carry', () => {
    it('returns nothing for a null seed', () => {
      expect(seededFilters(null, null)).toEqual({});
    });

    it('returns nothing for a null seed with a query', () => {
      expect(seededFilters(null, paramsFor(null, { gender: 'boys' }))).toEqual({});
    });

    it('returns nothing for a city seed, which is only a place', () => {
      expect(seededFilters(CITY_SEED, paramsFor(CITY_SEED))).toEqual({});
    });

    it('returns nothing for a campus seed, which is only a place', () => {
      expect(seededFilters(CAMPUS_SEED, paramsFor(CAMPUS_SEED))).toEqual({});
    });

    it('returns nothing for an empty seed', () => {
      expect(seededFilters({}, paramsFor({}))).toEqual({});
    });
  });

  describe('on a gender page', () => {
    it('carries the page own gender', () => {
      expect(seededFilters(GIRLS_SEED, paramsFor(GIRLS_SEED))).toEqual({ gender: 'girls' });
    });

    it('falls back to the seed when no params are given at all', () => {
      expect(seededFilters(GIRLS_SEED, null)).toEqual({ gender: 'girls' });
    });

    it('lets a valid query gender override the page', () => {
      expect(seededFilters(GIRLS_SEED, paramsFor(GIRLS_SEED, { gender: 'boys' }))).toEqual({
        gender: 'boys',
      });
    });

    it('ignores an invalid query gender and keeps the page own', () => {
      expect(seededFilters(GIRLS_SEED, paramsFor(GIRLS_SEED, { gender: 'bogus' }))).toEqual({
        gender: 'girls',
      });
    });

    it('ignores an empty query gender and keeps the page own', () => {
      expect(seededFilters(GIRLS_SEED, paramsFor(GIRLS_SEED, { gender: '' }))).toEqual({
        gender: 'girls',
      });
    });

    it('never returns a geography key, even when the query overrides one', () => {
      const params = paramsFor(GIRLS_SEED, { place: 'Karachi', lat: '24.8', lng: '67.0' });
      const result = seededFilters(GIRLS_SEED, params);

      expect(result).toEqual({ gender: 'girls' });
      for (const key of Object.keys(PLACE_KEYS_NULLED)) {
        expect(result).not.toHaveProperty(key);
      }
    });
  });
});
