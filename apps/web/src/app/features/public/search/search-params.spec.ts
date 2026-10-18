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

// Absent means every reader agrees, so a discarded sort cannot linger in one of them.
function expectSortAbsent(merged: ParamMap): void {
  expect(merged.get('sort')).toBeNull();
  expect(merged.has('sort')).toBe(false);
  expect(merged.getAll('sort')).toEqual([]);
  expect(merged.keys).not.toContain('sort');
}

function expectSortKept(merged: ParamMap, sort: string): void {
  expect(merged.get('sort')).toBe(sort);
  expect(merged.has('sort')).toBe(true);
  expect(merged.getAll('sort')).toEqual([sort]);
  expect(merged.keys).toContain('sort');
}

// The same all-four-readers check for any key, so a discarded value cannot linger in one of them.
function expectKeyAbsent(merged: ParamMap, key: string): void {
  expect(merged.get(key)).toBeNull();
  expect(merged.has(key)).toBe(false);
  expect(merged.getAll(key)).toEqual([]);
  expect(merged.keys).not.toContain(key);
}

function expectKeyReads(merged: ParamMap, key: string, values: string[]): void {
  expect(merged.get(key)).toBe(values[0]);
  expect(merged.has(key)).toBe(true);
  expect(merged.getAll(key)).toEqual(values);
  expect(merged.keys).toContain(key);
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

    // Only gender and sort are checked, so an empty place still replaces the seed's.
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

  describe('a sort the type in force does not offer', () => {
    it.each(['price-asc', 'price-desc'])('reads %s as absent when no type is in force', (sort) => {
      const merged = mergeOrFail(convertToParamMap({ place: 'karachi', sort }), null);

      expectSortAbsent(merged);
      expect(merged.get('place')).toBe('karachi');
      expect([...merged.keys]).toEqual(['place']);
    });

    it.each(['', 'bogus'])('reads the unknown sort %j as absent', (sort) => {
      expectSortAbsent(mergeOrFail(convertToParamMap({ sort }), null));
    });

    it('reads a miscased sort as absent and keeps the gender', () => {
      const merged = mergeOrFail(convertToParamMap({ gender: 'girls', sort: 'PRICE-ASC' }), null);

      expectSortAbsent(merged);
      expect(merged.get('gender')).toBe('girls');
      expect([...merged.keys]).toEqual(['gender']);
    });

    it('returns the query untouched when the type offers its sort and there is no seed', () => {
      const query = convertToParamMap({ gender: 'girls', sort: 'price-asc' });

      expect(mergeSearchParams(query, null)).toBe(query);
    });

    it('keeps a price sort in the query when the seed supplies the type', () => {
      const merged = mergeOrFail(convertToParamMap({ sort: 'price-asc' }), {
        place: 'lahore',
        gender: 'girls',
      });

      expectSortKept(merged, 'price-asc');
      expect([...merged.keys].sort()).toEqual(['gender', 'place', 'sort']);
    });

    it('keeps a price sort when an unrecognised query gender falls back to the seed type', () => {
      const merged = mergeOrFail(convertToParamMap({ gender: 'bogus', sort: 'price-asc' }), {
        gender: 'girls',
      });

      expectSortKept(merged, 'price-asc');
      expect(merged.get('gender')).toBe('girls');
    });

    it.each([
      {
        when: 'an unrecognised gender and no seed',
        query: { gender: 'bogus', sort: 'price-asc' },
        seed: null,
        keys: [],
      },
      {
        when: 'an empty gender and a seed with no type',
        query: { gender: '', sort: 'price-asc' },
        seed: { place: 'lahore' },
        keys: ['place'],
      },
    ])('reads a price sort as absent with $when', ({ query, seed, keys }) => {
      const merged = mergeOrFail(convertToParamMap(query), seed);

      expectSortAbsent(merged);
      expect(merged.get('gender')).toBeNull();
      expect([...merged.keys]).toEqual(keys);
    });

    // A repeated sort is judged as a whole, so the offered value does not outlive the bad one.
    it('reads a repeated sort as absent when one value is not offered', () => {
      expectSortAbsent(mergeOrFail(convertToParamMap({ sort: ['newest', 'price-asc'] }), null));
    });

    it('reads a repeated sort as absent when one value is miscased under a type', () => {
      const merged = mergeOrFail(
        convertToParamMap({ gender: 'girls', sort: ['newest', 'PRICE-ASC'] }),
        null,
      );

      expectSortAbsent(merged);
      expect(merged.get('gender')).toBe('girls');
    });

    it.each(['recommended', 'newest', 'oldest'])(
      'returns the query untouched for the sort %s when there is no seed',
      (sort) => {
        const query = convertToParamMap({ sort });

        expect(mergeSearchParams(query, null)).toBe(query);
      },
    );

    it.each(['recommended', 'newest', 'oldest'])(
      'keeps the sort %s over a seed that carries no type',
      (sort) => {
        const merged = mergeOrFail(convertToParamMap({ sort }), { place: 'lahore' });

        expectSortKept(merged, sort);
      },
    );

    it('reads a price sort carried only by a seed with no type as absent', () => {
      const merged = mergeOrFail(null, { place: 'lahore', sort: 'price-asc' });

      expectSortAbsent(merged);
      expect([...merged.keys]).toEqual(['place']);
    });

    it('keeps a price sort carried by a seed that names a type', () => {
      const merged = mergeOrFail(null, {
        place: 'lahore',
        gender: 'girls',
        sort: 'price-asc',
      });

      expectSortKept(merged, 'price-asc');
      expect([...merged.keys].sort()).toEqual(['gender', 'place', 'sort']);
    });
  });

  describe('a roomType or propertyType outside its vocabulary', () => {
    it.each(['bogus', 'deluxe', 'Private', 'SHARED', 'private-room', ''])(
      'reads the roomType %j as absent and keeps the place',
      (roomType) => {
        const merged = mergeOrFail(convertToParamMap({ place: 'lahore', roomType }), null);

        expectKeyAbsent(merged, 'roomType');
        expect(merged.get('place')).toBe('lahore');
        expect([...merged.keys]).toEqual(['place']);
      },
    );

    it.each(['bogus', 'villa', 'Apartment', 'HOUSE', ''])(
      'reads the propertyType %j as absent and keeps the place',
      (propertyType) => {
        const merged = mergeOrFail(convertToParamMap({ place: 'lahore', propertyType }), null);

        expectKeyAbsent(merged, 'propertyType');
        expect(merged.get('place')).toBe('lahore');
        expect([...merged.keys]).toEqual(['place']);
      },
    );

    // The backend's own name for a private room reads as the word the filters use.
    it('reads the backend spelling private_room as private', () => {
      const merged = mergeOrFail(convertToParamMap({ roomType: 'private_room' }), null);

      expectKeyReads(merged, 'roomType', ['private']);
      expect([...merged.keys]).toEqual(['roomType']);
    });

    // A repeated key is judged as a whole, so the valid value does not outlive the bad one.
    it.each([
      { key: 'roomType', values: ['private', 'bogus'] },
      { key: 'roomType', values: ['bogus', 'shared'] },
      { key: 'propertyType', values: ['house', 'villa'] },
    ])('reads $key as absent when one of $values is unknown', ({ key, values }) => {
      expectKeyAbsent(mergeOrFail(convertToParamMap({ [key]: values }), null), key);
    });

    it('reads every value of a repeated roomType through the backend spelling', () => {
      const merged = mergeOrFail(
        convertToParamMap({ roomType: ['private_room', 'private'] }),
        null,
      );

      expectKeyReads(merged, 'roomType', ['private', 'private']);
    });

    it.each([
      { when: 'a private roomType', query: { roomType: 'private' } },
      { when: 'a shared roomType', query: { roomType: 'shared' } },
      { when: 'an apartment', query: { propertyType: 'apartment' } },
      { when: 'a room', query: { propertyType: 'room' } },
      { when: 'a building', query: { propertyType: 'building' } },
      { when: 'a house', query: { propertyType: 'house' } },
      { when: 'both together', query: { roomType: 'shared', propertyType: 'house' } },
      {
        when: 'a gender and a price sort',
        query: { gender: 'girls', sort: 'price-asc', roomType: 'private', propertyType: 'house' },
      },
    ])('returns the query untouched for $when and no seed', ({ query }) => {
      const asked = convertToParamMap(query);

      expect(mergeSearchParams(asked, null)).toBe(asked);
    });

    it('keeps a valid roomType and propertyType in the query over a seed', () => {
      const merged = mergeOrFail(
        convertToParamMap({ roomType: 'private', propertyType: 'house' }),
        { place: 'lahore' },
      );

      expectKeyReads(merged, 'roomType', ['private']);
      expectKeyReads(merged, 'propertyType', ['house']);
      expect(merged.get('place')).toBe('lahore');
      expect([...merged.keys].sort()).toEqual(['place', 'propertyType', 'roomType']);
    });

    it.each([
      ['roomType', 'bogus'],
      ['roomType', ''],
      ['propertyType', 'villa'],
      ['propertyType', 'Apartment'],
    ])('drops the seed %s %j', (key, value) => {
      const merged = mergeOrFail(null, { place: 'lahore', [key]: value });

      expectKeyAbsent(merged, key);
      expect([...merged.keys]).toEqual(['place']);
    });

    it('reads a bad query value over a bad seed value as absent', () => {
      const merged = mergeOrFail(convertToParamMap({ roomType: 'bogus', propertyType: 'villa' }), {
        place: 'lahore',
        roomType: 'deluxe',
        propertyType: 'cottage',
      });

      expectKeyAbsent(merged, 'roomType');
      expectKeyAbsent(merged, 'propertyType');
      expect([...merged.keys]).toEqual(['place']);
    });

    it('reads the seed spelling private_room as private', () => {
      const merged = mergeOrFail(null, { place: 'lahore', roomType: 'private_room' });

      expectKeyReads(merged, 'roomType', ['private']);
      expect([...merged.keys].sort()).toEqual(['place', 'roomType']);
    });

    it.each([
      ['roomType', 'bogus', 'private'],
      ['roomType', '', 'shared'],
      ['propertyType', 'villa', 'house'],
      ['propertyType', 'Apartment', 'apartment'],
    ])('lets a valid seed %s show through the dropped query value %j', (key, dropped, seeded) => {
      const merged = mergeOrFail(convertToParamMap({ [key]: dropped }), { [key]: seeded });

      expectKeyReads(merged, key, [seeded]);
      expect([...merged.keys]).toEqual([key]);
    });

    describe('next to a bad gender and a stale sort', () => {
      const query = {
        gender: 'bogus',
        sort: 'price-asc',
        roomType: 'bogus',
        propertyType: 'villa',
        place: 'lahore',
      };

      it('keeps the seed type and its sort while dropping both values', () => {
        const merged = mergeOrFail(convertToParamMap(query), { gender: 'girls' });

        expectKeyAbsent(merged, 'roomType');
        expectKeyAbsent(merged, 'propertyType');
        expect(merged.get('gender')).toBe('girls');
        expectSortKept(merged, 'price-asc');
        expect([...merged.keys].sort()).toEqual(['gender', 'place', 'sort']);
      });

      it('drops the sort along with both values when no type is in force', () => {
        const merged = mergeOrFail(convertToParamMap(query), null);

        expectKeyAbsent(merged, 'roomType');
        expectKeyAbsent(merged, 'propertyType');
        expectSortAbsent(merged);
        expect(merged.get('gender')).toBeNull();
        expect([...merged.keys]).toEqual(['place']);
      });
    });

    it.each([
      ['roomType', 'bogus'],
      ['propertyType', 'villa'],
    ])('leaves the other keys alone next to a dropped %s', (key, value) => {
      const merged = mergeOrFail(
        convertToParamMap({ [key]: value, amenities: ['wifi', 'ac'], minPrice: '5000', place: '' }),
        { place: 'lahore', budget: '5000' },
      );

      expectKeyAbsent(merged, key);
      expect(merged.getAll('amenities')).toEqual(['wifi', 'ac']);
      expect(merged.get('minPrice')).toBe('5000');
      expect(merged.get('place')).toBe('');
      expect(merged.get('budget')).toBe('5000');
      expect([...merged.keys].sort()).toEqual(['amenities', 'budget', 'minPrice', 'place']);
    });

    // The keys judged on their own live in a Map, so an inherited member name is never one of them.
    it('reads seed keys named after inherited members as they are', () => {
      const merged = mergeOrFail(null, { place: 'lahore', toString: 'x', constructor: 'y' });

      expect(merged.get('toString')).toBe('x');
      expect(merged.get('constructor')).toBe('y');
      expect([...merged.keys].sort()).toEqual(['constructor', 'place', 'toString']);
    });

    it('reads the inherited member toString as an unknown roomType', () => {
      expectKeyAbsent(mergeOrFail(convertToParamMap({ roomType: 'toString' }), null), 'roomType');
    });
  });
});
