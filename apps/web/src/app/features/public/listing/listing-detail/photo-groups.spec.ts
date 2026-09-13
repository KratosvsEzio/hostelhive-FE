import { ListingPhoto } from '@hostelhive/data-access';
import {
  groupedOrder,
  photoGroups,
  photoLabel,
  toListingPhotos,
} from './photo-groups';

function photo(url: string, label: string | null = null): ListingPhoto {
  return { url, label };
}

/** Groups as `[label, urls]`, for a compact assertion. */
function shape(photos: ListingPhoto[]): [string | null, string[]][] {
  return photoGroups(photos).map((g) => [g.label, g.photos.map((p) => p.url)]);
}

describe('photoLabel', () => {
  it('takes the label the host set', () => {
    expect(photoLabel({ label: 'Kitchen' })).toBe('Kitchen');
  });

  it('trims it', () => {
    expect(photoLabel({ label: '  Kitchen  ' })).toBe('Kitchen');
  });

  /**
   * The three shapes that all mean "no label". The field is new, so every photo taken before
   * it shipped arrives as one of these — today, that is every photo in the product.
   */
  it('reads a missing key as unlabelled', () => {
    expect(photoLabel({})).toBeNull();
  });

  it('reads an explicit null as unlabelled', () => {
    expect(photoLabel({ label: null })).toBeNull();
  });

  it('reads a blank string as unlabelled', () => {
    expect(photoLabel({ label: '' })).toBeNull();
    expect(photoLabel({ label: '   ' })).toBeNull();
  });

  // A label that arrives as a number or an object is not a label.
  it('reads a non-string as unlabelled', () => {
    expect(photoLabel({ label: 7 } as unknown as { label?: string | null })).toBeNull();
  });
});

describe('toListingPhotos', () => {
  it('keeps wire order', () => {
    const out = toListingPhotos([{ url: 'a' }, { url: 'b' }, { url: 'c' }]);

    expect(out.map((p) => p.url)).toEqual(['a', 'b', 'c']);
  });

  it('drops attachments with no url', () => {
    const out = toListingPhotos([{ url: 'a' }, { url: '' }, { url: null }, { url: 'b' }]);

    expect(out.map((p) => p.url)).toEqual(['a', 'b']);
  });

  it('carries the label through', () => {
    expect(toListingPhotos([{ url: 'a', label: 'Kitchen' }])[0]!.label).toBe('Kitchen');
  });

  it('survives a null payload', () => {
    expect(toListingPhotos(null)).toEqual([]);
    expect(toListingPhotos(undefined)).toEqual([]);
  });
});

describe('photoGroups', () => {
  it('gathers photos under their label', () => {
    expect(
      shape([photo('a', 'Kitchen'), photo('b', 'Bathroom'), photo('c', 'Kitchen')]),
    ).toEqual([
      ['Kitchen', ['a', 'c']],
      ['Bathroom', ['b']],
    ]);
  });

  // Upload order, not alphabetical — otherwise "Bathroom" leads every listing in the product.
  it('orders sections by where each first appears', () => {
    expect(
      shape([photo('a', 'Rooftop'), photo('b', 'Bathroom'), photo('c', 'Rooftop')]).map(
        ([label]) => label,
      ),
    ).toEqual(['Rooftop', 'Bathroom']);
  });

  /**
   * The unlabelled bucket goes last whatever order it arrived in: it is the one group that
   * is not about anything, so it should not be what the gallery opens on.
   */
  it('puts the unlabelled bucket last', () => {
    expect(shape([photo('a'), photo('b', 'Kitchen'), photo('c')])).toEqual([
      ['Kitchen', ['b']],
      [null, ['a', 'c']],
    ]);
  });

  // Today's reality: the field is new, so nothing is labelled yet.
  it('returns one unlabelled group when nothing is labelled', () => {
    expect(shape([photo('a'), photo('b'), photo('c')])).toEqual([[null, ['a', 'b', 'c']]]);
  });

  it('omits the unlabelled group when everything is labelled', () => {
    expect(shape([photo('a', 'Kitchen')]).some(([label]) => label === null)).toBe(false);
  });

  it('has nothing to group when there are no photos', () => {
    expect(photoGroups([])).toEqual([]);
  });

  // Blank and absent land in the same bucket rather than sorting apart from each other.
  it('files every shape of missing label together', () => {
    const photos = toListingPhotos([
      { url: 'a' },
      { url: 'b', label: null },
      { url: 'c', label: '  ' },
    ]);

    expect(shape(photos)).toEqual([[null, ['a', 'b', 'c']]]);
  });

  it('treats labels differing only in surrounding space as one', () => {
    const photos = toListingPhotos([
      { url: 'a', label: 'Kitchen' },
      { url: 'b', label: ' Kitchen ' },
    ]);

    expect(shape(photos)).toEqual([['Kitchen', ['a', 'b']]]);
  });

  describe('offset', () => {
    /**
     * The index of each group's first photo in the flat list, so a thumbnail can open the
     * carousel at the right place without either layout knowing how the other is built.
     */
    it('counts from the start of the flattened gallery', () => {
      const groups = photoGroups([
        photo('a', 'Kitchen'),
        photo('b', 'Kitchen'),
        photo('c', 'Bath'),
        photo('d'),
      ]);

      expect(groups.map((g) => [g.label, g.offset])).toEqual([
        ['Kitchen', 0],
        ['Bath', 2],
        [null, 3],
      ]);
    });

    it('lands on the same photo the flattened order has at that index', () => {
      const photos = [
        photo('a', 'Kitchen'),
        photo('b'),
        photo('c', 'Kitchen'),
        photo('d', 'Bath'),
      ];
      const groups = photoGroups(photos);
      const flat = groupedOrder(groups);

      for (const g of groups) {
        expect(flat[g.offset]!.url).toBe(g.photos[0]!.url);
      }
    });
  });
});

describe('groupedOrder', () => {
  /**
   * The carousel walks this, not the raw wire list, so an index means the same thing in both
   * layouts — otherwise clicking the first unlabelled photo would open some labelled one.
   */
  it('flattens the groups in the order they are shown', () => {
    const photos = [photo('a'), photo('b', 'Kitchen'), photo('c')];

    expect(groupedOrder(photoGroups(photos)).map((p) => p.url)).toEqual(['b', 'a', 'c']);
  });

  it('keeps every photo exactly once', () => {
    const photos = [photo('a'), photo('b', 'K'), photo('c', 'B'), photo('d', 'K')];
    const flat = groupedOrder(photoGroups(photos));

    expect(flat.length).toBe(photos.length);
    expect(new Set(flat.map((p) => p.url)).size).toBe(photos.length);
  });

  // With nothing labelled, the grouped order is the wire order — no surprise reshuffle.
  it('leaves an all-unlabelled gallery in its original order', () => {
    const photos = [photo('a'), photo('b'), photo('c')];

    expect(groupedOrder(photoGroups(photos)).map((p) => p.url)).toEqual(['a', 'b', 'c']);
  });
});
