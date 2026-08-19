import {
  formatPrice,
  formatPriceCompact,
  periodForAccommodation,
  periodSuffix,
} from './pricing-period';

describe('periodForAccommodation', () => {
  it('bills a backpacker hostel per night', () => {
    expect(periodForAccommodation('backpacker')).toBe('nightly');
  });

  it.each(['boys', 'girls', 'coliving'])('bills a %s hostel per month', (g) => {
    expect(periodForAccommodation(g)).toBe('monthly');
  });

  // A hostel is exactly one accommodation type, so an unrecognised value is a data problem,
  // not a nightly listing. Defaulting to monthly keeps it labelled the way it always was.
  it('falls back to monthly for an unknown type', () => {
    expect(periodForAccommodation('')).toBe('monthly');
  });
});

describe('price formatting', () => {
  it('labels a monthly price per month', () => {
    expect(formatPrice({ amount: 12000, period: 'monthly' })).toBe('Rs 12,000 / month');
  });

  it('labels a nightly price per night', () => {
    expect(formatPrice({ amount: 1500, period: 'nightly' })).toBe('Rs 1,500 / night');
  });

  it.each([
    ['monthly', '/mo'],
    ['nightly', '/night'],
  ] as const)('suffixes %s as %s', (period, suffix) => {
    expect(periodSuffix(period)).toBe(suffix);
  });
});

describe('formatPriceCompact (map pins)', () => {
  it('compacts to thousands', () => {
    expect(formatPriceCompact({ amount: 12000, period: 'monthly' })).toBe('Rs 12k');
    expect(formatPriceCompact({ amount: 2000, period: 'nightly' })).toBe('Rs 2k');
  });

  // A pin has no room for a suffix, so the two read the same by design.
  it('carries no period suffix', () => {
    expect(formatPriceCompact({ amount: 2000, period: 'nightly' }))
      .toBe(formatPriceCompact({ amount: 2000, period: 'monthly' }));
  });

  // Math.round(400 / 1000) is 0, which would render every cheap bed as "Rs 0k".
  it('shows amounts under a thousand exactly rather than as Rs 0k', () => {
    expect(formatPriceCompact({ amount: 400, period: 'nightly' })).toBe('Rs 400');
    expect(formatPriceCompact({ amount: 950, period: 'nightly' })).toBe('Rs 950');
  });
});
