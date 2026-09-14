/**
 * The photo a hostel leads with, moved to the front of its own list.
 *
 * A host picks it by starring a photo in the hostel form, which calls
 * `PUT /api/attachments/:uuid/mark_as_primary`; the server sets `is_primary` on that one and
 * clears it on its siblings. The wire order it comes back in is upload order, and carries no
 * trace of the choice — so anything that reads `attachments[0]` shows whatever was uploaded
 * first and the star changes nothing a seeker can see.
 *
 * Reordering rather than returning a flag, because "the lead photo" is read in six places —
 * the search card, the map pin's popup, the map's docked card, the gallery hero, the
 * `og:image` on the share preview, and the JSON-LD — all of them by taking index 0. A flag
 * would need each of those six to remember to honour it. The order *is* the contract, and
 * the rest of the list keeps its upload order behind the leader.
 *
 * A record with no primary at all is left exactly as it arrived: every hostel uploaded before
 * the star shipped is in that state, and promoting an arbitrary photo would be a silent
 * guess. `findIndex` also means a record dirty enough to carry two primaries settles on the
 * earlier one rather than on whichever happened to be scanned last.
 */
export function primaryFirst<T extends { is_primary?: boolean | null }>(
  attachments: readonly T[] | null | undefined,
): T[] {
  const list = [...(attachments ?? [])];
  const at = list.findIndex((a) => a?.is_primary);
  // -1 is "no primary"; 0 is "already leading". Both leave the list alone.
  if (at <= 0) return list;
  const [primary] = list.splice(at, 1);
  list.unshift(primary);
  return list;
}
