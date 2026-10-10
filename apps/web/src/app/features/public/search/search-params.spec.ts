import { convertToParamMap, ParamMap } from '@angular/router';
import { isAccommodationType, mergeSearchParams } from './search-params';

describe('isAccommodationType', () => {
  it.each(['boys', 'girls', 'coliving', 'backpacker'])('accepts the known type %j', (value) => {
    expect(isAccommodationType(value)).toBe(true);
  });

  it.each(['all', '', null, undefined, 'bogus', 'constructor'])('rejects %j', (value) => {
    expect(isAccommodationType(value)).toBe(false);
  });

  // Inherited Object members must not pass for types.
  it.each(['toString', 'hasOwnProperty', '__proto__'])('rejects the inherited member %j', (value) => {
    expect(isAccommodationType(value)).toBe(false);
  });
});

// For cases where a seed or a query is given, so a null result would itself be the failure.
function mergeOrFail(query: ParamMap | null, seed: Record<string, string> | null): ParamMap {
  const merged = mergeSearchParams(query, seed);
  if (!merged) throw new Error('expected a merged ParamMap, got null');
  return merged;
}

describe('mergeSearchParams', () => {
  describe('with nothing to merge', () => {
    it('returns the query untouched when there is no seed and no gender', () => {
      const query = convertToParamMap({ place: 'lahore' });
      expect(mergeSearchParams(query, null)).toBe(query);
    });

    it('returns the query untouched when there is no seed and the gender is valid', () => {
      const query = convertToParamMap({ gender: 'boys' });
      expect(mergeSearchParams(query, null)).toBe(query);
    });

    it('returns null for no query and no seed', () => {
      expect(mergeSearchParams(null, null)).toBeNull();
    });
  });

  describe('layering the query over a seed', () => {
    const seed = { place: 'lahore', gender: 'girls', budget: '5000' };

    it('lets the query win key by key for get, has and getAll', () => {
      const merged = mergeOrFail(convertToParamMap({ place: 'karachi' }), seed);

      expect(merged.get('place')).toBe('karachi');
      expect(merged.has('place')).toBe(true);
      expect(merged.getAll('place')).toEqual(['karachi']);
    });

    it('keeps every value of a repeated query key', () => {
      const merged = mergeOrFail(convertToParamMap({ amenity: ['wifi', 'ac'] }), seed);

      expect(merged.getAll('amenity')).toEqual(['wifi', 'ac']);
    });

    it('fills the gaps the query leaves from the seed', () => {
      const merged = mergeOrFail(convertToParamMap({ place: 'karachi' }), seed);

      expect(merged.get('budget')).toBe('5000');
      expect(merged.has('budget')).toBe(true);
      expect(merged.getAll('budget')).toEqual(['5000']);
    });

    it('reads a key found in neither as absent', () => {
      const merged = mergeOrFail(convertToParamMap({ place: 'karachi' }), seed);

      expect(merged.get('missing')).toBeNull();
      expect(merged.has('missing')).toBe(false);
      expect(merged.getAll('missing')).toEqual([]);
    });

    it('lists the keys of both without duplicates', () => {
      const merged = mergeOrFail(convertToParamMap({ place: 'karachi', extra: 'x' }), seed);

      expect([...merged.keys].sort()).toEqual(['budget', 'extra', 'gender', 'place']);
    });

    it('serves the seed alone when there is no query', () => {
      const merged = mergeOrFail(null, seed);

      expect(merged.get('gender')).toBe('girls');
      expect(merged.has('place')).toBe(true);
      expect(merged.getAll('budget')).toEqual(['5000']);
      expect([...merged.keys].sort()).toEqual(['budget', 'gender', 'place']);
    });

    // The doc comment says only gender is checked, so an empty place still replaces the seed's.
    it('lets an empty value for a non-gender key override the seed', () => {
      const merged = mergeOrFail(convertToParamMap({ place: '' }), seed);

      expect(merged.get('place')).toBe('');
      expect(merged.has('place')).toBe(true);
    });

    it('lets a valid query gender override the seed gender', () => {
      const merged = mergeOrFail(convertToParamMap({ gender: 'boys' }), seed);

      expect(merged.get('gender')).toBe('boys');
      expect(merged.getAll('gender')).toEqual(['boys']);
    });
  });

  describe.each(['bogus', ''])('with an unrecognised query gender %j', (gender) => {
    it('falls back to the seed gender', () => {
      const merged = mergeOrFail(convertToParamMap({ gender }), { gender: 'girls' });

      expect(merged.get('gender')).toBe('girls');
      expect(merged.has('gender')).toBe(true);
      expect(merged.getAll('gender')).toEqual(['girls']);
    });

    it('keeps the rest of the query alongside the seed gender', () => {
      const merged = mergeOrFail(convertToParamMap({ gender, place: 'karachi' }), {
        gender: 'girls',
      });

      expect(merged.get('place')).toBe('karachi');
      expect(merged.get('gender')).toBe('girls');
    });

    it('reads as absent when there is no seed', () => {
      const merged = mergeOrFail(convertToParamMap({ gender, place: 'karachi' }), null);

      expect(merged.get('gender')).toBeNull();
      expect(merged.has('gender')).toBe(false);
      expect(merged.getAll('gender')).toEqual([]);
      expect(merged.keys).not.toContain('gender');
      expect(merged.get('place')).toBe('karachi');
    });

    it('reads as absent when the seed does not carry a gender', () => {
      const merged = mergeOrFail(convertToParamMap({ gender }), { place: 'lahore' });

      expect(merged.get('gender')).toBeNull();
      expect(merged.has('gender')).toBe(false);
      expect(merged.getAll('gender')).toEqual([]);
      expect(merged.keys).not.toContain('gender');
    });
  });
});
