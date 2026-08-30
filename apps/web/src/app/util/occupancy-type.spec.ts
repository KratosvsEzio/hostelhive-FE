import {
  DEFAULT_OCCUPANCY_TYPE,
  OCCUPANCY_TYPES,
  discountError,
  OCCUPANCY_OPTIONS,
  isOccupancyType,
  defaultOccupancyFrom,
  isPrivateOccupancy,
  occupancyOptionsFrom,
  isValidDiscount,
  occupancyLabel,
  priceUnitNote,
  unitNoun,
} from './occupancy-type';

describe('occupancy type', () => {
  it('has exactly the two the backend accepts', () => {
    expect([...OCCUPANCY_TYPES]).toEqual(['private', 'shared']);
    expect(isOccupancyType('private')).toBe(true);
    expect(isOccupancyType('shared')).toBe(true);
    expect(isOccupancyType('dormitory')).toBe(false);
    expect(isOccupancyType(undefined)).toBe(false);
  });

  it('defaults to shared', () => {
    // The commoner case in a hostel, and the safer default: a shared room mispriced as
    // private overcharges one guest, where the reverse undersells a whole room.
    expect(DEFAULT_OCCUPANCY_TYPE).toBe('shared');
  });

  it('labels each side for a seeker', () => {
    expect(occupancyLabel('private')).toBe('Private room');
    expect(occupancyLabel('shared')).toBe('Shared room');
  });
});

describe('unitNoun', () => {
  // The whole reason this exists: a bare "2" means two rooms on one row and two beds on the
  // next, and booking three rooms when you wanted three beds is expensive to unwind.
  it('names the unit each type is sold in', () => {
    expect(unitNoun('private')).toBe('room');
    expect(unitNoun('shared')).toBe('bed');
  });

  it('pluralises on the count', () => {
    expect(unitNoun('private', 1)).toBe('room');
    expect(unitNoun('private', 2)).toBe('rooms');
    expect(unitNoun('shared', 3)).toBe('beds');
    expect(unitNoun('shared', 0)).toBe('beds');
  });
});

describe('priceUnitNote', () => {
  it('says which unit the price is quoted in', () => {
    expect(priceUnitNote('private')).toBe('Prices are per room');
    expect(priceUnitNote('shared')).toBe('Prices are per bed');
  });
});

describe('isValidDiscount', () => {
  it('accepts no discount at all', () => {
    // Blank is the normal state, not an incomplete form.
    expect(isValidDiscount(5000, null)).toBe(true);
    expect(isValidDiscount(5000, undefined)).toBe(true);
  });

  it('accepts a genuine discount', () => {
    expect(isValidDiscount(5000, 4000)).toBe(true);
    expect(isValidDiscount(5000, 1)).toBe(true);
  });

  // An equal pair renders "−0%" beside a struck-through price identical to the one next to
  // it, which reads as a bug rather than as a deal.
  it('rejects a discount that is not a discount', () => {
    expect(isValidDiscount(5000, 5000)).toBe(false);
    expect(isValidDiscount(5000, 6000)).toBe(false);
  });

  it('rejects zero and negatives', () => {
    expect(isValidDiscount(5000, 0)).toBe(false);
    expect(isValidDiscount(5000, -100)).toBe(false);
  });
});

describe('discountError', () => {
  it('says nothing when the pair is fine', () => {
    expect(discountError(5000, 4000)).toBe('');
    expect(discountError(5000, null)).toBe('');
  });

  // Names the number the host has to beat rather than restating the rule.
  it('names the price to beat', () => {
    expect(discountError(12000, 15000)).toContain('12,000');
    expect(discountError(12000, 15000)).toContain('less than');
  });

  it('gives zero its own message', () => {
    expect(discountError(5000, 0)).toContain('more than 0');
  });

  it('uses the hostel currency', () => {
    expect(discountError(5000, 9000, 'USD')).toContain('USD');
  });
});

/**
 * The two spellings of "sold whole".
 *
 * `GET /api/hostels/new` publishes `private_room`; the seeker filters and the older host code
 * say `private`. A `=== 'private'` that meets `private_room` answers *shared* — which prices a
 * whole room per bed, draws it as a row of pips and sells it a bed at a time. Nothing has hit
 * that yet only because no live hostel has a private room; these keep it that way.
 */
describe('isPrivateOccupancy', () => {
  it('accepts either spelling the API might send', () => {
    expect(isPrivateOccupancy('private')).toBe(true);
    expect(isPrivateOccupancy('private_room')).toBe(true);
  });

  it('is false for shared, and for nothing at all', () => {
    expect(isPrivateOccupancy('shared')).toBe(false);
    expect(isPrivateOccupancy('')).toBe(false);
    expect(isPrivateOccupancy(null)).toBe(false);
    expect(isPrivateOccupancy(undefined)).toBe(false);
  });

  // The consequences, at the three places a host would see them.
  it('carries the unit, the label and the note with it', () => {
    expect(unitNoun('private_room')).toBe('room');
    expect(unitNoun('private_room', 2)).toBe('rooms');
    expect(occupancyLabel('private_room')).toBe('Private room');
    expect(priceUnitNote('private_room')).toBe('Prices are per room');
  });
});

/**
 * The "Sold as" choices, as the backend describes them.
 *
 * Values come from the API so a new occupancy type needs no release. The words do not: its
 * `name` for `private_room` is `"Private_room"`, a slug run through `humanize`, and "Shared"
 * alone drops the noun that makes the pair read as a pair.
 */
describe('occupancyOptionsFrom', () => {
  const FROM_API = [
    { id: 0, slug: 'shared', name: 'Shared' },
    { id: 1, slug: 'private_room', name: 'Private_room' },
  ];

  it('takes its values from the API', () => {
    expect(occupancyOptionsFrom(FROM_API).map((o) => o.value)).toEqual(['shared', 'private_room']);
  });

  it('keeps house wording for the slugs we know', () => {
    expect(occupancyOptionsFrom(FROM_API).map((o) => o.label)).toEqual([
      'Shared room',
      'Private room',
    ]);
  });

  // A type nobody has written copy for still has to be readable — an underscore on screen is
  // a slug that escaped, and "Private_room" is what rendering `name` raw would have shown.
  it('tidies the server name for a slug it has never seen', () => {
    const [only] = occupancyOptionsFrom([{ id: 9, slug: 'whole_floor', name: 'Whole_floor' }]);
    expect(only).toEqual({ value: 'whole_floor', label: 'Whole floor' });
  });

  // A failed options call must not leave the host facing an empty dropdown.
  it('falls back to the built-in pair when the API said nothing', () => {
    expect(occupancyOptionsFrom([])).toEqual(OCCUPANCY_OPTIONS);
    expect(occupancyOptionsFrom(undefined)).toEqual(OCCUPANCY_OPTIONS);
    expect(occupancyOptionsFrom(null)).toEqual(OCCUPANCY_OPTIONS);
  });
});

/**
 * Which option a new room type starts on.
 *
 * The old answer was a slug compiled into the form. That is fine right up until the backend
 * stops offering it, at which point the dropdown renders blank and the host has to notice a
 * field that looks merely unfilled.
 */
describe('defaultOccupancyFrom', () => {
  const API = occupancyOptionsFrom([
    { id: 0, slug: 'shared', name: 'Shared' },
    { id: 1, slug: 'private_room', name: 'Private_room' },
  ]);

  // Not merely "the first one": the choice has a price attached. A shared room mispriced as
  // private overcharges one guest; the reverse undersells a whole room.
  it('prefers the safe default when the backend still offers it', () => {
    expect(defaultOccupancyFrom(API)).toBe('shared');
  });

  it('falls back to whatever is offered first when it does not', () => {
    const without = occupancyOptionsFrom([{ id: 1, slug: 'private_room', name: 'Private_room' }]);
    expect(defaultOccupancyFrom(without)).toBe('private_room');
  });

  it('still answers something for an empty list', () => {
    expect(defaultOccupancyFrom([])).toBe(DEFAULT_OCCUPANCY_TYPE);
  });
});
