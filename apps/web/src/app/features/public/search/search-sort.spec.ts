import { isPriceSort, isSortOffered, sortsFor } from './search-sort';

const values = (type: Parameters<typeof sortsFor>[0]): string[] =>
  sortsFor(type).map((o) => o.value);

describe('isPriceSort', () => {
  it.each(['price-asc', 'price-desc'])('is true for %s', (sort) => {
    expect(isPriceSort(sort)).toBe(true);
  });

  it.each(['recommended', 'newest', 'oldest', ''])('is false for %j', (sort) => {
    expect(isPriceSort(sort)).toBe(false);
  });

  it('is false for null', () => {
    expect(isPriceSort(null)).toBe(false);
  });

  it('is false for undefined', () => {
    expect(isPriceSort(undefined)).toBe(false);
  });
});

describe('sortsFor', () => {
  it('withdraws both price sorts for the mixed "all" list, keeping order', () => {
    expect(values('all')).toEqual(['recommended', 'newest', 'oldest']);
  });

  it.each(['boys', 'girls', 'coliving', 'backpacker'] as const)(
    'offers every sort for %s, in display order',
    (type) => {
      expect(values(type)).toEqual([
        'recommended',
        'newest',
        'oldest',
        'price-desc',
        'price-asc',
      ]);
    },
  );
});

describe('isSortOffered', () => {
  describe('for the mixed "all" list', () => {
    it.each(['recommended', 'newest', 'oldest'])('offers %s', (sort) => {
      expect(isSortOffered(sort, 'all')).toBe(true);
    });

    it.each(['price-asc', 'price-desc'])('does not offer %s', (sort) => {
      expect(isSortOffered(sort, 'all')).toBe(false);
    });
  });

  describe.each(['boys', 'girls', 'coliving', 'backpacker'] as const)('for %s', (type) => {
    it.each(['recommended', 'newest', 'oldest', 'price-desc', 'price-asc'])(
      'offers %s',
      (sort) => {
        expect(isSortOffered(sort, type)).toBe(true);
      },
    );
  });

  // Anything outside the five known values is never offered, whichever type is in force.
  it.each(['', null, undefined, 'bogus', 'PRICE-ASC'])('never offers %j', (sort) => {
    expect(isSortOffered(sort, 'all')).toBe(false);
    expect(isSortOffered(sort, 'girls')).toBe(false);
  });
});
