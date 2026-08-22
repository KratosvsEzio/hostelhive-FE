import {
  DEFAULT_OCCUPANCY_TYPE,
  OCCUPANCY_TYPES,
  discountError,
  isOccupancyType,
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
