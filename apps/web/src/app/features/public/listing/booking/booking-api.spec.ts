import { chargePercentFor } from './booking-api';

/**
 * The cancellation schedule from section 07 of the PRD.
 *
 * Tested as a pure function rather than through the service because these five bands are the
 * part a guest disputes, and the boundaries are where a dispute lands — the brief phrased them
 * as "before N days", which read literally makes every band apply at once.
 */
describe('chargePercentFor', () => {
  it('charges least the earliest', () => {
    expect(chargePercentFor(90)).toBe(30);
    expect(chargePercentFor(30)).toBe(30);
  });

  it('steps up as check-in approaches', () => {
    expect(chargePercentFor(29)).toBe(40);
    expect(chargePercentFor(15)).toBe(40);
    expect(chargePercentFor(14)).toBe(60);
    expect(chargePercentFor(7)).toBe(60);
    expect(chargePercentFor(6)).toBe(70);
    expect(chargePercentFor(2)).toBe(70);
    expect(chargePercentFor(1)).toBe(85);
  });

  // Contiguous windows, no overlap and no gap — the boundary belongs to the milder band.
  it('puts each boundary in exactly one band', () => {
    const bands = [30, 15, 7, 2, 1];
    for (const edge of bands) {
      expect(chargePercentFor(edge)).not.toBe(chargePercentFor(edge - 0.01));
    }
  });

  it('refuses inside 24 hours', () => {
    expect(chargePercentFor(0.99)).toBeNull();
    expect(chargePercentFor(0)).toBeNull();
    // Already started: still not cancellable, rather than wrapping to the mildest band.
    expect(chargePercentFor(-3)).toBeNull();
  });

  // Never charges more the further out you are — the schedule has to be monotonic or a guest
  // is rewarded for cancelling later.
  it('never gets cheaper as check-in nears', () => {
    let previous = 0;
    for (let d = 40; d >= 1; d -= 0.5) {
      const percent = chargePercentFor(d) ?? 100;
      expect(percent).toBeGreaterThanOrEqual(previous);
      previous = percent;
    }
  });
});
