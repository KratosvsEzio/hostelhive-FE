import { FILMSTRIP_CLEAR, filmstrip, wrapIndex } from './filmstrip';

/** The indices a strip renders, left to right, for a compact assertion. */
function shape(count: number, current: number): { lead: number | null; clear: number[]; trail: number | null } {
  const f = filmstrip(count, current);
  return {
    lead: f.lead?.index ?? null,
    clear: f.clear.map((s) => s.index),
    trail: f.trail?.index ?? null,
  };
}

describe('wrapIndex', () => {
  it('leaves an index inside the range alone', () => {
    expect(wrapIndex(3, 10)).toBe(3);
  });

  it('wraps past the end back to the start', () => {
    expect(wrapIndex(10, 10)).toBe(0);
    expect(wrapIndex(12, 10)).toBe(2);
  });

  // `%` keeps the sign in JS, so -1 % 10 is -1 rather than 9.
  it('wraps below zero round to the end', () => {
    expect(wrapIndex(-1, 10)).toBe(9);
    expect(wrapIndex(-3, 10)).toBe(7);
  });

  it('answers zero for an empty gallery rather than NaN', () => {
    expect(wrapIndex(-1, 0)).toBe(0);
  });
});

describe('filmstrip', () => {
  it('shows three sharp by default', () => {
    expect(filmstrip(10, 0).clear.length).toBe(FILMSTRIP_CLEAR);
  });

  /** The case from the design: on the first of ten, 1·2·3 sharp, 10 before and 4 after. */
  it('leads the sharp three with the current image', () => {
    expect(shape(10, 0)).toEqual({ lead: 9, clear: [0, 1, 2], trail: 3 });
  });

  it('slides as the current image advances', () => {
    expect(shape(10, 4)).toEqual({ lead: 3, clear: [4, 5, 6], trail: 7 });
  });

  it('wraps the window past the last image', () => {
    expect(shape(10, 8)).toEqual({ lead: 7, clear: [8, 9, 0], trail: 1 });
  });

  it('wraps the lead back to the last image on the first', () => {
    expect(filmstrip(10, 0).lead?.index).toBe(9);
  });

  it('numbers slots from one, for the label', () => {
    const f = filmstrip(10, 0);

    expect(f.clear.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(f.lead?.number).toBe(10);
    expect(f.trail?.number).toBe(4);
  });

  describe('small galleries', () => {
    it('has nothing at all for an empty one', () => {
      expect(shape(0, 0)).toEqual({ lead: null, clear: [], trail: null });
    });

    // Nowhere to go, so no ends — and therefore no navigation buttons to offer.
    it('drops both ends for a single image', () => {
      expect(shape(1, 0)).toEqual({ lead: null, clear: [0], trail: null });
    });

    it('never repeats an image among the sharp ones', () => {
      expect(shape(2, 0).clear).toEqual([0, 1]);
      expect(shape(2, 1).clear).toEqual([1, 0]);
    });

    /**
     * With four images the window is three wide, so the one left over is both what precedes
     * it and what follows it. Kept deliberately: the buttons live on those ends.
     */
    it('keeps both ends even when they are the same image', () => {
      expect(shape(4, 0)).toEqual({ lead: 3, clear: [0, 1, 2], trail: 3 });
    });

    it('keeps the ends when they repeat a sharp image', () => {
      const f = shape(3, 0);

      expect(f.clear).toEqual([0, 1, 2]);
      expect(f.lead).toBe(2);
      expect(f.trail).toBe(0);
    });
  });

  describe('the ring', () => {
    /**
     * Stepping forward through the whole gallery and back must land where it started, or the
     * strip and the photo would drift apart on a long scroll.
     */
    it('returns to the start after a full lap', () => {
      const count = 10;
      let i = 0;
      for (let n = 0; n < count; n++) i = wrapIndex(i + 1, count);

      expect(i).toBe(0);
      expect(shape(count, i)).toEqual(shape(count, 0));
    });

    it('every image is the leading sharp one exactly once around the ring', () => {
      const seen = new Set<number>();
      for (let i = 0; i < 10; i++) seen.add(filmstrip(10, i).clear[0]!.index);

      expect(seen.size).toBe(10);
    });

    it('takes an out-of-range current without complaint', () => {
      expect(shape(10, 13)).toEqual(shape(10, 3));
      expect(shape(10, -1)).toEqual(shape(10, 9));
    });
  });
});
