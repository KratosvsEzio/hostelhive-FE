import { eachDate } from '@features/public/listing/booking/booking-api';

/**
 * The date walk behind the month grid.
 *
 * Worth its own tests because the obvious implementation — adding 86,400,000ms — drifts an
 * hour across a clock change and either repeats or skips a date. A calendar that silently
 * loses 27 March is a calendar a host cannot trust.
 */
describe('eachDate', () => {
  it('is inclusive at both ends', () => {
    expect(eachDate('2026-08-01', '2026-08-03')).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ]);
  });

  it('returns a single day for a one-day range', () => {
    expect(eachDate('2026-08-23', '2026-08-23')).toEqual(['2026-08-23']);
  });

  it('returns nothing for a reversed range', () => {
    expect(eachDate('2026-08-23', '2026-08-20')).toEqual([]);
  });

  it('crosses a month boundary', () => {
    const days = eachDate('2026-01-30', '2026-02-02');
    expect(days).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });

  it('handles a leap February', () => {
    const days = eachDate('2028-02-27', '2028-03-01');
    expect(days).toEqual(['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
  });

  // A full month must produce exactly its own length — no duplicates, no gaps.
  it('produces one entry per day of a full month', () => {
    const days = eachDate('2026-03-01', '2026-03-31');
    expect(days.length).toBe(31);
    expect(new Set(days).size).toBe(31);
    expect(days[0]).toBe('2026-03-01');
    expect(days[30]).toBe('2026-03-31');
  });

  it('pads single-digit months and days', () => {
    expect(eachDate('2026-09-09', '2026-09-09')).toEqual(['2026-09-09']);
  });
});
