import { isPropertyType } from './property-type';

describe('isPropertyType', () => {
  it.each(['apartment', 'room', 'building', 'house'])('accepts the property type %j', (value) => {
    expect(isPropertyType(value)).toBe(true);
  });

  // The index matches the slug exactly, so a near-miss would empty the list rather than narrow it.
  it.each(['Apartment', 'HOUSE', ' room', 'villa', ''])('rejects the string %j', (value) => {
    expect(isPropertyType(value)).toBe(false);
  });

  it.each([null, undefined, 0])('rejects the non-string %j', (value) => {
    expect(isPropertyType(value)).toBe(false);
  });

  // Inherited Object members must not pass for types.
  it.each(['constructor', '__proto__', 'toString'])('rejects the inherited member %j', (value) => {
    expect(isPropertyType(value)).toBe(false);
  });
});
