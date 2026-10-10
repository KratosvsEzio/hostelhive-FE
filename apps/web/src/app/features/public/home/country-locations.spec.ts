import {
  NO_LOCATIONS,
  sameRegionName,
  tallyLocations,
} from './country-locations';

describe('tallyLocations', () => {
  it('is empty for no hostels', () => {
    expect(tallyLocations([])).toEqual(NO_LOCATIONS);
  });

  it('counts hostels per city, busiest first', () => {
    const { cities, total } = tallyLocations([
      { city: 'Lahore' },
      { city: 'Karachi' },
      { city: 'Lahore' },
      { city: 'Multan' },
      { city: 'Lahore' },
      { city: 'Karachi' },
    ]);

    expect(total).toBe(6);
    expect(cities.map((c) => [c.name, c.count])).toEqual([
      ['Lahore', 3],
      ['Karachi', 2],
      ['Multan', 1],
    ]);
  });

  it('breaks a tie by name so the order is stable', () => {
    const { cities } = tallyLocations([
      { city: 'Quetta' },
      { city: 'Faisalabad' },
    ]);

    expect(cities.map((c) => c.name)).toEqual(['Faisalabad', 'Quetta']);
  });

  // Free text: the same city arrives in several spellings and must not split into several.
  it('folds spellings together and shows the most common one', () => {
    const { cities } = tallyLocations([
      { city: 'lahore' },
      { city: ' Lahore ' },
      { city: 'Lahore' },
    ]);

    expect(cities).toHaveLength(1);
    expect(cities[0]).toMatchObject({
      name: 'Lahore',
      slug: 'lahore',
      count: 3,
    });
  });

  it('groups cities under their region with in-region counts', () => {
    const { regions } = tallyLocations([
      { state: 'Punjab', city: 'Lahore' },
      { state: 'Punjab', city: 'Lahore' },
      { state: 'Punjab', city: 'Multan' },
      { state: 'Sindh', city: 'Karachi' },
    ]);

    expect(regions.map((r) => [r.name, r.count])).toEqual([
      ['Punjab', 3],
      ['Sindh', 1],
    ]);
    expect(regions[0].cities).toEqual([
      { name: 'Lahore', slug: 'lahore', count: 2 },
      { name: 'Multan', slug: 'multan', count: 1 },
    ]);
  });

  it('counts a hostel with no city toward its region, and one with no region toward its city', () => {
    const { regions, cities } = tallyLocations([
      { state: 'Punjab' },
      { city: 'Lahore' },
      { state: '  ', city: '' },
    ]);

    expect(regions).toEqual([
      { name: 'Punjab', slug: 'punjab', count: 1, cities: [] },
    ]);
    expect(cities.map((c) => c.name)).toEqual(['Lahore']);
  });

  it('places a city at the mean of its hostels, ignoring missing coordinates', () => {
    const { cities } = tallyLocations([
      { city: 'Lahore', lat: 31, lng: 74 },
      { city: 'Lahore', lat: 32, lng: 75 },
      { city: 'Lahore', lat: 0, lng: 0 },
      { city: 'Lahore', lat: Number.NaN, lng: 74 },
    ]);

    expect(cities[0].lat).toBeCloseTo(31.5);
    expect(cities[0].lng).toBeCloseTo(74.5);
  });

  it('leaves a city unplaced when none of its hostels has coordinates', () => {
    const { cities } = tallyLocations([{ city: 'Sialkot', lat: 0, lng: 0 }]);

    expect(cities[0].lat).toBeNull();
    expect(cities[0].lng).toBeNull();
  });
});

describe('sameRegionName', () => {
  it('matches spellings of the same name', () => {
    expect(sameRegionName('Punjab', 'punjab ')).toBe(true);
  });

  it('matches a short name inside a formal one, either way round', () => {
    expect(sameRegionName('Islamabad', 'Islamabad Capital Territory')).toBe(
      true,
    );
    expect(sameRegionName('Punjab Province', 'Punjab')).toBe(true);
  });

  it('only matches whole words', () => {
    expect(sameRegionName('Punjab', 'Punjabi Bagh')).toBe(false);
  });

  it('never matches an empty name', () => {
    expect(sameRegionName('', '')).toBe(false);
    expect(sameRegionName(null, 'Sindh')).toBe(false);
  });
});
