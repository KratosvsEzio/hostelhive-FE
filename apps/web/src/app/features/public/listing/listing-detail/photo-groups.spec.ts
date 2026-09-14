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
    expect(photoLabel({ attachment_label: { name: 'Kitchen' } })).toBe('Kitchen');
  });

  it('trims it', () => {
    expect(photoLabel({ attachment_label: { name: '  Kitchen  ' } })).toBe('Kitchen');
  });

  /**
   * The three shapes that all mean "no label". The field is new, so every photo taken before
   * it shipped arrives as one of these — today, that is every photo in the product.
   */
  it('reads a missing key as unlabelled', () => {
    expect(photoLabel({})).toBeNull();
  });

  it('reads an explicit null as unlabelled', () => {
    expect(photoLabel({ attachment_label: { name: null } })).toBeNull();
  });

  it('reads a blank string as unlabelled', () => {
    expect(photoLabel({ attachment_label: { name: '' } })).toBeNull();
    expect(photoLabel({ attachment_label: { name: '   ' } })).toBeNull();
  });

  // A photo nobody has filed has no `attachment_label` at all, not an empty one.
  it('reads a null attachment_label as unlabelled', () => {
    expect(photoLabel({ attachment_label: null })).toBeNull();
  });

  // A name that arrives as a number or an object is not a name.
  it('reads a non-string name as unlabelled', () => {
    expect(
      photoLabel({ attachment_label: { name: 7 } } as unknown as {
        attachment_label?: { name?: string | null } | null;
      }),
    ).toBeNull();
  });

  /**
   * The id is deliberately not read. The options list sends it obfuscated while the copy
   * embedded on each photo has been sending the raw database integer, so grouping on it would
   * split one label into two sections depending on which endpoint the photo came from.
   */
  it('ignores the id entirely', () => {
    expect(
      photoLabel({ attachment_label: { id: 31, name: 'Bathroom' } } as unknown as {
        attachment_label?: { name?: string | null } | null;
      }),
    ).toBe('Bathroom');
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
    expect(toListingPhotos([{ url: 'a', attachment_label: { name: 'Kitchen' } }])[0]!.label).toBe('Kitchen');
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
      { url: 'b', attachment_label: { name: null } },
      { url: 'c', attachment_label: { name: '  ' } },
    ]);

    expect(shape(photos)).toEqual([[null, ['a', 'b', 'c']]]);
  });

  it('treats labels differing only in surrounding space as one', () => {
    const photos = toListingPhotos([
      { url: 'a', attachment_label: { name: 'Kitchen' } },
      { url: 'b', attachment_label: { name: ' Kitchen ' } },
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

/**
 * The listing page's lead photograph.
 *
 * Four things read index 0 of this list and nothing else: the gallery hero, the `og:image`
 * a shared link previews with, the JSON-LD `image`, and the frame the carousel opens on.
 * All four were showing whatever the host happened to upload first, whatever they starred.
 */
describe('toListingPhotos leads with the starred photo', () => {
  it('hoists it out of the middle of the upload order', () => {
    const out = toListingPhotos([
      { url: 'a' },
      { url: 'starred', is_primary: true },
      { url: 'c' },
    ]);

    expect(out.map((p) => p.url)).toEqual(['starred', 'a', 'c']);
  });

  it('carries the starred photo its own label, not the one it displaced', () => {
    const out = toListingPhotos([
      { url: 'a', attachment_label: { name: 'Bedroom' } },
      { url: 'starred', attachment_label: { name: 'Kitchen' }, is_primary: true },
    ]);

    expect(out[0]).toEqual({ url: 'starred', label: 'Kitchen' });
  });

  /**
   * Sections come out in the order their first photo lands, so hoisting the starred photo
   * also moves its section to the top. That is the point: the gallery should open on the
   * part of the hostel the host chose to lead with, not on whichever room was uploaded first.
   */
  it('brings the starred photo section to the top of the grouped gallery', () => {
    const photos = toListingPhotos([
      { url: 'bed1', attachment_label: { name: 'Bedroom' } },
      { url: 'bed2', attachment_label: { name: 'Bedroom' } },
      { url: 'kit1', attachment_label: { name: 'Kitchen' }, is_primary: true },
    ]);

    expect(photoGroups(photos).map((g) => g.label)).toEqual(['Kitchen', 'Bedroom']);
    // …and the flat list the hero reads agrees with the order the carousel walks.
    expect(groupedOrder(photoGroups(photos))[0]!.url).toBe(photos[0]!.url);
  });

  it('leaves upload order alone when nothing is starred', () => {
    const out = toListingPhotos([{ url: 'a' }, { url: 'b' }, { url: 'c' }]);

    expect(out.map((p) => p.url)).toEqual(['a', 'b', 'c']);
  });
});
