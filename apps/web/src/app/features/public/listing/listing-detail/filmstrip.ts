/** How many thumbnails are shown sharp at once. */
export const FILMSTRIP_CLEAR = 3;

export interface FilmstripSlot {
  /** Index into the gallery's images. */
  index: number;
  /** 1-based, for the label a screen reader reads. */
  number: number;
}

export interface Filmstrip {
  /** The blurred thumbnail before the window; carries the Previous button. */
  lead: FilmstripSlot | null;
  /** The sharp thumbnails, starting at the current image. */
  clear: FilmstripSlot[];
  /** The blurred thumbnail after the window; carries the Next button. */
  trail: FilmstripSlot | null;
}

/** `n` wrapped into `[0, count)`, for negative `n` too — `%` alone keeps the sign. */
export function wrapIndex(n: number, count: number): number {
  if (count <= 0) return 0;
  return ((n % count) + count) % count;
}

/**
 * The thumbnail window: three sharp, one blurred at each end.
 *
 * The strip used to render every image and scroll, which put ten thumbnails under the photo
 * and made the current one just the brightest of them. This shows the neighbourhood instead —
 * where you are, what is next, and a hint of what lies past each edge.
 *
 * **The current image leads the sharp three** rather than sitting in the middle of them, so
 * the image on screen is always the leftmost sharp thumbnail and the two beside it are what
 * comes next. On the first of ten that is 1·2·3 sharp, with 10 blurred before and 4 after.
 *
 * Both ends wrap, so there is no first or last to run out of: the strip is a ring, and the
 * buttons over the blurred ends always have somewhere to go.
 *
 * The ends are kept even when the gallery is small enough that they repeat an image already
 * sharp — with four photos, image 4 is both what precedes the window and what follows it.
 * Redundant, but the buttons live on those ends, and losing them would cost more than the
 * repetition does.
 */
export function filmstrip(
  count: number,
  current: number,
  span: number = FILMSTRIP_CLEAR,
): Filmstrip {
  if (count <= 0) return { lead: null, clear: [], trail: null };

  const start = wrapIndex(current, count);
  const width = Math.min(Math.max(1, span), count);

  const slot = (index: number): FilmstripSlot => ({ index, number: index + 1 });
  const clear = Array.from({ length: width }, (_, i) => slot(wrapIndex(start + i, count)));

  // One image is a gallery with nowhere to go; the ends would both point back at it.
  if (count <= 1) return { lead: null, clear, trail: null };

  return {
    lead: slot(wrapIndex(start - 1, count)),
    clear,
    trail: slot(wrapIndex(start + width, count)),
  };
}
