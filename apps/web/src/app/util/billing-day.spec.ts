import { BILLING_DAY_OPTIONS, normalizeBillingDay } from './billing-day';
import { ordinal } from './ordinal';

describe('ordinal', () => {
  it('suffixes the teens with "th"', () => {
    expect([ordinal(11), ordinal(12), ordinal(13)]).toEqual(['11th', '12th', '13th']);
  });

  it('suffixes by last digit outside the teens', () => {
    expect([ordinal(1), ordinal(2), ordinal(3), ordinal(4)]).toEqual(['1st', '2nd', '3rd', '4th']);
    expect([ordinal(21), ordinal(22), ordinal(23), ordinal(31)]).toEqual([
      '21st',
      '22nd',
      '23rd',
      '31st',
    ]);
  });
});

describe('BILLING_DAY_OPTIONS', () => {
  it('covers every day of month exactly once', () => {
    expect(BILLING_DAY_OPTIONS.map((o) => o.value)).toEqual(
      Array.from({ length: 31 }, (_, i) => String(i + 1)),
    );
  });

  it('labels each option with its ordinal day', () => {
    expect(BILLING_DAY_OPTIONS[0]).toEqual({ value: '1', label: '1st of month' });
    expect(BILLING_DAY_OPTIONS[30]).toEqual({ value: '31', label: '31st of month' });
  });
});

describe('normalizeBillingDay', () => {
  it('keeps a selectable day', () => {
    expect(normalizeBillingDay(1)).toBe('1');
    expect(normalizeBillingDay(31)).toBe('31');
  });

  it('rejects missing, out-of-range and non-integer days without clamping', () => {
    expect(normalizeBillingDay(null)).toBe('');
    expect(normalizeBillingDay(undefined)).toBe('');
    expect(normalizeBillingDay(0)).toBe('');
    expect(normalizeBillingDay(1.5)).toBe('');
    expect(normalizeBillingDay(32)).toBe('');
    expect(normalizeBillingDay(99)).toBe('');
  });
});
