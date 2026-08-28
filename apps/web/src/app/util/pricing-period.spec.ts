import {
  formatPrice,
  formatPriceCompact,
  periodForAccommodation,
  periodFromBillingFrequency,
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

/**
 * Which cycle a hostel is on — and therefore whether it can be booked online at all.
 *
 * These two answer different questions and were treated as one. `periodForAccommodation` is a
 * rule about what a backpacker hostel *usually* does; `billing_frequency` is what a hostel
 * actually charges. The listing page gated online booking on the first, so a backpacker hostel
 * billing monthly was offered a nightly checkout, and a boys hostel billing nightly was refused
 * one — in both cases without anything in the UI hinting at the mismatch.
 */
describe('periodFromBillingFrequency', () => {
  it('translates the backend’s own words', () => {
    expect(periodFromBillingFrequency('night')).toBe('nightly');
    expect(periodFromBillingFrequency('month')).toBe('monthly');
  });

  /**
   * Absent is not "monthly".
   *
   * Answering `monthly` for a payload that said nothing would silently close the booking path
   * on every hostel whose serializer predates the field — so this says "I do not know" and
   * lets the caller fall back to the accommodation-type rule.
   */
  it('says nothing rather than guessing', () => {
    expect(periodFromBillingFrequency(undefined)).toBeNull();
    expect(periodFromBillingFrequency(null)).toBeNull();
    expect(periodFromBillingFrequency('')).toBeNull();
  });

  // `nightly`/`monthly` are this app's words; `night`/`month` are the backend's. Passing the
  // frontend spelling back in is a sign somebody translated twice.
  it('does not accept the frontend spelling', () => {
    expect(periodFromBillingFrequency('nightly')).toBeNull();
    expect(periodFromBillingFrequency('monthly')).toBeNull();
    expect(periodFromBillingFrequency('fortnight')).toBeNull();
  });

  /**
   * The pair, as the listing page uses them: what the hostel charges, falling back to what
   * its type implies.
   */
  it('overrules the accommodation-type rule when the hostel has said', () => {
    const decide = (billing: string | null, type: string) =>
      periodFromBillingFrequency(billing) ?? periodForAccommodation(type);

    // The two cases the old gate got wrong, in both directions.
    expect(decide('month', 'backpacker')).toBe('monthly');
    expect(decide('night', 'boys')).toBe('nightly');

    // And where it has said nothing, the rule still applies.
    expect(decide(null, 'backpacker')).toBe('nightly');
    expect(decide(null, 'boys')).toBe('monthly');
  });
});
