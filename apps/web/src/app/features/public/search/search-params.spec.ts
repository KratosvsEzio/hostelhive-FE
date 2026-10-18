import { convertToParamMap, ParamMap } from '@angular/router';
import {
  isAccommodationType,
  isPropertyType,
  mergeSearchParams,
  searchUrlCorrections,
} from './search-params';

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

    // `place` is not checked, so an empty one still replaces the seed's.
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

  // Trello #176 and #184: the same reading as `gender` and `sort`, for the other filter keys.
  describe('a filter value the search cannot use', () => {
    function expectAbsent(merged: ParamMap, key: string): void {
      expect(merged.get(key)).toBeNull();
      expect(merged.has(key)).toBe(false);
      expect(merged.getAll(key)).toEqual([]);
      expect(merged.keys).not.toContain(key);
    }

    it.each([
      ['roomType', 'bogus'],
      ['roomType', 'Private'],
      ['roomType', 'private_room'],
      ['roomType', ''],
      ['propertyType', 'bogus'],
      ['propertyType', 'Apartment'],
      ['propertyType', ''],
      ['minPrice', 'abc'],
      ['minPrice', '-5'],
      ['minPrice', ''],
      ['minPrice', 'Infinity'],
      ['maxPrice', '12abc'],
      ['maxPrice', ' '],
      ['zoom', 'abc'],
      ['zoom', '99'],
    ])('reads %s=%j as absent and keeps the rest of the query', (key, value) => {
      const merged = mergeOrFail(convertToParamMap({ [key]: value, place: 'lahore' }), null);

      expectAbsent(merged, key);
      expect(merged.get('place')).toBe('lahore');
    });

    it.each([
      ['roomType', 'private'],
      ['roomType', 'shared'],
      ['propertyType', 'apartment'],
      ['propertyType', 'house'],
      ['minPrice', '0'],
      ['minPrice', '5000'],
      ['maxPrice', '12500.5'],
      ['lat', '31.52'],
      ['zoom', '10'],
    ])('keeps the valid %s=%j and returns the query untouched', (key, value) => {
      const query = convertToParamMap({ [key]: value });

      expect(mergeSearchParams(query, null)).toBe(query);
    });

    it('reads a repeated key as absent when one value is bad', () => {
      const merged = mergeOrFail(convertToParamMap({ roomType: ['private', 'bogus'] }), null);

      expectAbsent(merged, 'roomType');
    });

    it.each([
      ['a bad latitude', { lat: 'abc', lng: '74.3' }],
      ['a bad longitude', { lat: '31.5', lng: 'abc' }],
      ['a latitude out of range', { lat: '91', lng: '74.3' }],
      ['a longitude out of range', { lat: '31.5', lng: '-181' }],
    ])('drops both coordinates for %s', (_name, coords) => {
      const merged = mergeOrFail(convertToParamMap({ ...coords, zoom: '10' }), null);

      expectAbsent(merged, 'lat');
      expectAbsent(merged, 'lng');
      expect(merged.get('zoom')).toBe('10');
    });

    it('falls back to the seed when the query value is bad', () => {
      const merged = mergeOrFail(convertToParamMap({ lat: 'abc', lng: '1', minPrice: 'x' }), {
        place: 'lahore',
        lat: '31.5',
        lng: '74.3',
      });

      expect(merged.get('lat')).toBe('31.5');
      expect(merged.get('lng')).toBe('74.3');
      expectAbsent(merged, 'minPrice');
    });

    describe('amenities', () => {
      const vocabulary = { amenities: new Set(['wifi', 'kitchen']) };

      it('keeps only the slugs the catalogue offers', () => {
        const query = convertToParamMap({ amenities: 'wifi,bogus,kitchen' });
        const merged = mergeSearchParams(query, null, vocabulary);

        expect(merged?.get('amenities')).toBe('wifi,kitchen');
        expect(merged?.getAll('amenities')).toEqual(['wifi,kitchen']);
      });

      it('reads a list of unknown slugs only as absent', () => {
        const merged = mergeSearchParams(
          convertToParamMap({ amenities: 'bogus,nope' }),
          null,
          vocabulary,
        );

        expectAbsent(merged as ParamMap, 'amenities');
      });

      it('returns the query untouched when every slug is offered', () => {
        const query = convertToParamMap({ amenities: 'wifi,kitchen' });

        expect(mergeSearchParams(query, null, vocabulary)).toBe(query);
      });

      // Nothing to check against while the catalogue loads, or after it failed.
      it.each([
        ['no catalogue', {}],
        ['a null catalogue', { amenities: null }],
        ['an empty catalogue', { amenities: new Set<string>() }],
      ])('takes the slugs as they come with %s', (_name, vocab) => {
        const query = convertToParamMap({ amenities: 'bogus' });

        expect(mergeSearchParams(query, null, vocab)).toBe(query);
      });
    });
  });
});

describe('isPropertyType', () => {
  it.each(['apartment', 'room', 'building', 'house'])('accepts %j', (value) => {
    expect(isPropertyType(value)).toBe(true);
  });

  it.each(['', null, undefined, 'bogus', 'Apartment'])('rejects %j', (value) => {
    expect(isPropertyType(value)).toBe(false);
  });
});

describe('searchUrlCorrections', () => {
  it('is empty for a clean query', () => {
    const query = convertToParamMap({ roomType: 'private', minPrice: '5000', sort: 'newest' });

    expect(searchUrlCorrections(query, null)).toEqual({});
  });

  it('nulls every dropped key and writes the cleaned amenity list', () => {
    const query = convertToParamMap({
      roomType: 'bogus',
      propertyType: 'bogus',
      minPrice: 'abc',
      maxPrice: '-1',
      lat: 'abc',
      lng: '74.3',
      zoom: 'x',
      sort: 'price-asc',
      amenities: 'wifi,bogus',
      place: 'Lahore',
    });

    expect(searchUrlCorrections(query, null, { amenities: new Set(['wifi']) })).toEqual({
      roomType: null,
      propertyType: null,
      minPrice: null,
      maxPrice: null,
      lat: null,
      lng: null,
      zoom: null,
      sort: null,
      amenities: 'wifi',
    });
  });

  // `startSearch` writes the type in force instead, and the header bar validates it itself.
  it('leaves an unknown gender to the page', () => {
    expect(searchUrlCorrections(convertToParamMap({ gender: 'bogus' }), null)).toEqual({});
  });

  it('cleans only the query, never a seed', () => {
    expect(searchUrlCorrections(null, { roomType: 'bogus', sort: 'price-asc' })).toEqual({});
  });
});
