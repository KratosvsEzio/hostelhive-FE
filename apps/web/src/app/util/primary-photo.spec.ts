import { primaryFirst } from './primary-photo';

/** Terser than repeating the object shape; only the two fields that matter here. */
function att(id: string, is_primary = false): { id: string; is_primary: boolean } {
  return { id, is_primary };
}

const ids = (list: { id: string }[]): string[] => list.map((a) => a.id);

describe('primaryFirst', () => {
  /**
   * The defect this exists for.
   *
   * "Backpacker" (`MjvuEl`) returns ten active attachments, the sixth of them flagged
   * `is_primary: true`. Every public surface leads with index 0, so the host starred a photo
   * and the search card, the map pin and the share preview all went on showing the first one
   * they uploaded. Nothing in the payload distinguished the choice except this flag.
   */
  it('leads with the starred photo, however far down the list it sits', () => {
    const wire = [
      att('2d68b7ab'), att('31d2388e'), att('26a7c889'), att('04a93251'), att('c90a92ff'),
      att('467bc0b4', true),
      att('7e392201'), att('2879148f'), att('37156d4f'), att('ea85233b'),
    ];
    expect(ids(primaryFirst(wire))[0]).toBe('467bc0b4');
  });

  it('keeps every other photo in upload order behind it', () => {
    const wire = [att('a'), att('b'), att('c', true), att('d')];
    expect(ids(primaryFirst(wire))).toEqual(['c', 'a', 'b', 'd']);
  });

  /**
   * Every hostel uploaded before the star shipped is in this state — and several in the live
   * search payload still are. Promoting something would be a guess dressed up as the host's
   * decision, so the list has to come back untouched.
   */
  it('leaves a list with no starred photo exactly as it arrived', () => {
    const wire = [att('a'), att('b'), att('c')];
    expect(ids(primaryFirst(wire))).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op when the starred photo already leads', () => {
    expect(ids(primaryFirst([att('a', true), att('b')]))).toEqual(['a', 'b']);
  });

  /** The server clears siblings, but a record that predates it can carry two. Take the first. */
  it('settles on the earlier one if a record carries two', () => {
    expect(ids(primaryFirst([att('a'), att('b', true), att('c', true)]))).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the caller list', () => {
    const wire = [att('a'), att('b', true)];
    primaryFirst(wire);
    expect(ids(wire)).toEqual(['a', 'b']);
  });

  it('survives an absent list', () => {
    expect(primaryFirst(null)).toEqual([]);
    expect(primaryFirst(undefined)).toEqual([]);
    expect(primaryFirst([])).toEqual([]);
  });
});
