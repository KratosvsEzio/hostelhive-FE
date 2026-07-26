import {
  clampCapacity,
  defaultCapacityFor,
  DORMITORY_DEFAULT_CAPACITY,
  fixedCapacityFor,
} from './room-types';

describe('fixedCapacityFor', () => {
  it('maps each sharing type to its implied bed count', () => {
    expect(fixedCapacityFor('Single room')).toBe(1);
    expect(fixedCapacityFor('Double sharing')).toBe(2);
    expect(fixedCapacityFor('Triple sharing')).toBe(3);
    expect(fixedCapacityFor('Quad sharing')).toBe(4);
  });

  it('returns null when the name implies no fixed count', () => {
    expect(fixedCapacityFor('Dormitory')).toBeNull();
    expect(fixedCapacityFor('')).toBeNull();
    expect(fixedCapacityFor('Something else')).toBeNull();
  });
});

describe('defaultCapacityFor', () => {
  it('uses the fixed count for a sharing type', () => {
    expect(defaultCapacityFor('Triple sharing')).toBe(3);
  });

  it('falls back to the dormitory default for a variable type', () => {
    expect(defaultCapacityFor('Dormitory')).toBe(DORMITORY_DEFAULT_CAPACITY);
    expect(defaultCapacityFor('')).toBe(DORMITORY_DEFAULT_CAPACITY);
  });
});

describe('clampCapacity', () => {
  it('holds the bounds and floors fractions', () => {
    expect(clampCapacity(0)).toBe(1);
    expect(clampCapacity(10)).toBe(9);
    expect(clampCapacity(4.7)).toBe(4);
  });

  it('keeps an in-range integer untouched', () => {
    expect(clampCapacity(5)).toBe(5);
  });
});
