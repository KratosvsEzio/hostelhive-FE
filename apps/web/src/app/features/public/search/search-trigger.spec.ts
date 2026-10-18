import {
  isSearchTrigger,
  SearchTriggerInputs,
  strongerTrigger,
  triggerForChange,
} from './search-trigger';

const BASE: SearchTriggerInputs = {
  q: {
    accommodationType: 'all',
    roomType: 'shared',
    bounds: { north: 31.6, south: 31.2, east: 74.8, west: 74.4 },
    sort: 'recommended',
  },
  tick: 0,
  currency: 'PKR',
};

const changed = (
  patch: Partial<SearchTriggerInputs['q']>,
  rest: Partial<SearchTriggerInputs> = {},
) => triggerForChange(BASE, { ...BASE, ...rest, q: { ...BASE.q, ...patch } });

describe('triggerForChange', () => {
  it('reads nothing from inputs that did not change', () => {
    expect(triggerForChange(BASE, { ...BASE, q: { ...BASE.q } })).toBeNull();
  });

  it('reads a new viewport as the map', () => {
    expect(
      changed({ bounds: { north: 32, south: 31.5, east: 75, west: 74.5 } }),
    ).toBe('map');
  });

  it.each([
    ['near', { bounds: undefined, near: { lat: 24.86, lng: 67.0 } }],
    ['city', { bounds: undefined, city: 'karachi' }],
  ] as const)('reads a new %s as a place', (_, patch) => {
    expect(changed(patch)).toBe('place');
  });

  it('reads another place in the URL as a place, even when the request shows only a new viewport', () => {
    const before = { ...BASE, where: '["Lahore"]' };
    const after = {
      ...BASE,
      q: {
        ...BASE.q,
        bounds: { north: 25, south: 24.7, east: 67.2, west: 66.8 },
      },
      where: '["Karachi"]',
    };

    expect(triggerForChange(before, after)).toBe('place');
  });

  it('reads the viewport replacing a place as the map, not another place', () => {
    const atPlace: SearchTriggerInputs = {
      ...BASE,
      q: { ...BASE.q, bounds: undefined, near: { lat: 24.86, lng: 67.0 } },
    };

    expect(triggerForChange(atPlace, BASE)).toBe('map');
  });

  it.each([
    ['accommodationType', { accommodationType: 'girls' }],
    ['propertyType', { propertyType: 'house' }],
    ['roomType', { roomType: 'private' }],
    ['minPrice', { minPrice: 10000 }],
    ['maxPrice', { maxPrice: 30000 }],
    ['amenities', { amenities: ['wifi'] }],
    ['sort', { sort: 'newest' }],
  ] as const)('reads a new %s as a filter', (_, patch) => {
    expect(changed(patch)).toBe('filter');
  });

  it('reads a new currency as a filter: the budget is priced in it', () => {
    expect(changed({}, { currency: 'USD' })).toBe('filter');
  });

  it('reads a filter that came with a new viewport as the filter', () => {
    expect(
      changed({
        sort: 'newest',
        bounds: { north: 32, south: 31.5, east: 75, west: 74.5 },
      }),
    ).toBe('filter');
  });

  it('reads the same inputs fired again as a retry', () => {
    expect(changed({}, { tick: 1 })).toBe('retry');
  });

  it('ignores a page bump: that is the infinite list, not a new search', () => {
    const paged = { ...BASE, q: { ...BASE.q, page: 2 } } as SearchTriggerInputs;

    expect(triggerForChange(BASE, paged)).toBeNull();
  });
});

describe('strongerTrigger', () => {
  it('keeps whichever is set when the other is not', () => {
    expect(strongerTrigger(null, 'map')).toBe('map');
    expect(strongerTrigger('filter', null)).toBe('filter');
    expect(strongerTrigger(null, null)).toBeNull();
  });

  it.each([
    ['place', 'map', 'place'],
    ['map', 'place', 'place'],
    ['filter', 'map', 'filter'],
    ['map', 'retry', 'map'],
    ['everywhere', 'map', 'everywhere'],
    ['place', 'everywhere', 'everywhere'],
    ['arrival', 'place', 'arrival'],
  ] as const)('takes %s over %s as %s', (a, b, want) => {
    expect(strongerTrigger(a, b)).toBe(want);
  });
});

describe('isSearchTrigger', () => {
  it.each(['arrival', 'place', 'everywhere', 'filter', 'map', 'retry'])(
    'accepts %s',
    (v) => {
      expect(isSearchTrigger(v)).toBe(true);
    },
  );

  it.each(['bogus', '', null, undefined, 1])('rejects %s', (v) => {
    expect(isSearchTrigger(v)).toBe(false);
  });
});
