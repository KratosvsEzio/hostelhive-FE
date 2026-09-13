import { AXIS_INTERVALS, AXIS_MAXFILL, fixedAxis } from './chart-helpers';

/**
 * The regression these guard: a host with no revenue yet opened the overview and the
 * revenue chart's top gridline was drawn across the card's heading, with a loose "2"
 * beside it, and "1" printed twice on the axis below.
 */
describe('fixedAxis', () => {
  const pcts = (peak: number, integer: boolean) =>
    fixedAxis(peak, integer).ticks.map((t) => t.bottomPct);
  const values = (peak: number, integer: boolean) =>
    fixedAxis(peak, integer).ticks.map((t) => t.value);

  it('never puts a gridline outside the plot box', () => {
    // The defect exactly: 2 / 1.5 * 92 = 122.7%, on a box that ends at 100%.
    for (const peak of [0, 1, 2, 3, 7, 50, 999, 250_000, 1_234_567]) {
      for (const integer of [true, false]) {
        for (const pct of pcts(peak, integer)) {
          expect({ peak, integer, pct }).toEqual({ peak, integer, pct: expect.any(Number) });
          expect(pct).toBeGreaterThanOrEqual(0);
          expect(pct).toBeLessThanOrEqual(AXIS_MAXFILL);
        }
      }
    }
  });

  it('never prints the same number twice on one axis', () => {
    // Two ticks reading "1" is not a scale, and `track tick.value` makes them duplicate keys.
    for (const peak of [0, 1, 2, 3, 7, 50, 999, 250_000]) {
      for (const integer of [true, false]) {
        const v = values(peak, integer);
        expect({ peak, integer, unique: new Set(v).size }).toEqual({
          peak,
          integer,
          unique: v.length,
        });
      }
    }
  });

  it('gives an empty revenue chart a plain 0…3 axis', () => {
    // What the host actually sees before their first rupee is collected.
    expect(values(1, false)).toEqual([0, 1, 2, 3]);
    // Evenly spaced up to the fill. Compared loosely because (1/3)*92 and 92/3 differ in
    // the last bit, which is a fact about doubles and not about the axis.
    const p = pcts(1, false);
    expect(p[0]).toBe(0);
    expect(p[1]).toBeCloseTo(AXIS_MAXFILL / 3, 6);
    expect(p[2]).toBeCloseTo((AXIS_MAXFILL * 2) / 3, 6);
    expect(p[3]).toBeCloseTo(AXIS_MAXFILL, 6);
  });

  it('still rounds a real revenue peak up to something legible', () => {
    expect(values(250_000, false)).toEqual([0, 100_000, 200_000, 300_000]);
    expect(fixedAxis(250_000, false).ceiling).toBe(300_000);
  });

  it('always clears the peak, so no bar can overflow its own axis', () => {
    for (const peak of [1, 2, 3, 4, 9, 10, 11, 99, 101, 250_000, 999_999]) {
      expect({ peak, clears: fixedAxis(peak, false).ceiling >= peak }).toEqual({
        peak,
        clears: true,
      });
    }
  });

  it('gives every axis the same number of gridlines, so the two cards line up', () => {
    for (const peak of [1, 40, 250_000]) {
      expect(fixedAxis(peak, true).ticks).toHaveLength(AXIS_INTERVALS + 1);
      expect(fixedAxis(peak, false).ticks).toHaveLength(AXIS_INTERVALS + 1);
    }
  });

  it('keeps the movement axis whole, since it counts people', () => {
    expect(values(4, true)).toEqual([0, 2, 4, 6]);
    expect(values(1, true)).toEqual([0, 1, 2, 3]);
  });
});
