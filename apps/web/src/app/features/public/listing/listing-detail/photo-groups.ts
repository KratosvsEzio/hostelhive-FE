import { ListingPhoto } from '@hostelhive/data-access';

export interface PhotoGroup {
  /** `null` is the unlabelled bucket; the view names it, so the name can be translated. */
  label: string | null;
  photos: ListingPhoto[];
  /** Where this group's first photo sits in the flat gallery, for opening the carousel. */
  offset: number;
}

/** The wire shape, before it is known to be a usable photo. */
interface RawAttachment {
  url?: string | null;
  label?: string | null;
}

/**
 * The host's label for a photo, or `null` when there isn't one.
 *
 * Blank and whitespace-only count as absent: a label the host cleared comes back as `""` from
 * some form paths, and a group headed by an empty string is indistinguishable from the
 * unlabelled bucket while sorting apart from it.
 */
export function photoLabel(raw: RawAttachment): string | null {
  const label = raw.label;
  if (typeof label !== 'string') return null;
  const trimmed = label.trim();
  return trimmed === '' ? null : trimmed;
}

/** Attachments that are actually photos, in wire order, each carrying its label. */
export function toListingPhotos(raw: readonly RawAttachment[] | null | undefined): ListingPhoto[] {
  return (raw ?? [])
    .filter((a) => !!a?.url)
    .map((a) => ({ url: a.url as string, label: photoLabel(a) }));
}

/**
 * The gallery, grouped into the sections the grouped layout draws.
 *
 * Sections come out in the order their first photo appears, so the host's upload order is
 * what orders the page — there is nothing else to sort by that would not be arbitrary, and
 * alphabetical would put "Bathroom" above "Bedroom" on every listing in the product.
 *
 * **The unlabelled bucket always goes last**, whatever order its photos arrived in. It is the
 * one group that is not about anything, so leading with it would open the gallery on the
 * photos that say least. It is also where every photo sits today: the field is new, so until
 * hosts start filling it in this returns a single group and the layout reads as one long
 * section — correct, and not worth special-casing into the old view.
 *
 * `offset` is the index of the group's first photo in the flat list, so clicking a thumbnail
 * can hand the carousel a position without either view knowing how the other is built.
 */
export function photoGroups(photos: readonly ListingPhoto[]): PhotoGroup[] {
  const byLabel = new Map<string, ListingPhoto[]>();
  const unlabelled: ListingPhoto[] = [];

  for (const photo of photos) {
    if (photo.label === null) {
      unlabelled.push(photo);
      continue;
    }
    const bucket = byLabel.get(photo.label);
    if (bucket) bucket.push(photo);
    else byLabel.set(photo.label, [photo]);
  }

  const ordered: { label: string | null; photos: ListingPhoto[] }[] = [
    ...[...byLabel.entries()].map(([label, group]) => ({ label, photos: group })),
  ];
  if (unlabelled.length) ordered.push({ label: null, photos: unlabelled });

  let offset = 0;
  return ordered.map((group) => {
    const withOffset = { ...group, offset };
    offset += group.photos.length;
    return withOffset;
  });
}

/**
 * The gallery flattened back out, in the order the groups present it.
 *
 * The carousel walks this rather than the raw list, so an index means the same thing in both
 * layouts: clicking the third photo of the second section opens the carousel on that photo,
 * not on whatever happened to be third on the wire.
 */
export function groupedOrder(groups: readonly PhotoGroup[]): ListingPhoto[] {
  return groups.flatMap((g) => g.photos);
}
