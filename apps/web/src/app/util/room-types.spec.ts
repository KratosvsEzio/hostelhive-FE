import {
  clampCapacity,
  defaultCapacityFor,
  displayLabelFor,
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

describe('displayLabelFor', () => {
  it('renames "Single room" to "Single occupancy" for display only', () => {
    expect(displayLabelFor('Single room')).toBe('Single occupancy');
  });

  it('passes every other value through unchanged (canonical value preserved)', () => {
    expect(displayLabelFor('Double sharing')).toBe('Double sharing');
    expect(displayLabelFor('Dormitory')).toBe('Dormitory');
    expect(displayLabelFor('Some custom type')).toBe('Some custom type');
    expect(displayLabelFor('')).toBe('');
  });
});

describe('clampCapacity', () => {
  it('raises anything below one, and floors fractions', () => {
    expect(clampCapacity(0)).toBe(1);
    expect(clampCapacity(-3)).toBe(1);
    expect(clampCapacity(4.7)).toBe(4);
  });

  it('leaves a whole number of beds untouched', () => {
    expect(clampCapacity(5)).toBe(5);
  });

  // A dormitory is whatever the host says it is — a backpacker dorm of 12–20 beds is
  // routine, and the old ceiling of 9 silently truncated it.
  it('does not cap a large dormitory', () => {
    expect(clampCapacity(10)).toBe(10);
    expect(clampCapacity(20)).toBe(20);
    expect(clampCapacity(250)).toBe(250);
  });
});
