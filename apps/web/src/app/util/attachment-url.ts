/**
 * A processed rendition of an attachment, if it can be trusted.
 *
 * The backend builds variant URLs by joining the bucket to the key, and the join is missing a
 * separator. `PUT /api/attachments/:uuid/mark_as_primary` answers, verbatim:
 *
 *     url                 …s3.ap-south-1.amazonaws.com/unprocessed/hostelhive/documents/<id>
 *     variants.document   …s3.ap-south-1.amazonaws.comhostelhive/documents/<id>/document.png
 *
 * `amazonaws.comhostelhive` is not a host that resolves, so the address does not 404 — it
 * fails to find a server at all. Nothing reads it today, because every attachment arrives with
 * a usable `url` and the thumbnail resolvers only reach for a variant when that is missing. It
 * is a trap rather than a defect, and this is what stops the first caller falling into it.
 *
 * **Rejected rather than repaired**, deliberately. The slash is not the only difference — the
 * key differs too (`unprocessed/hostelhive/documents/<id>` against
 * `hostelhive/documents/<id>/document.png`) — so a patched-up address would be a guess at
 * where the file lives, and a guess rendered into an `<img>` is indistinguishable from a
 * photograph of the hostel. That is the trick `hh-photo-placeholder` exists to have stopped.
 * Returning nothing lets the caller show the honest empty state instead.
 *
 * The test is simply that a rendition lives where its original lives: same host as some
 * attachment in the same payload. With no reference to compare against, the first candidate is
 * returned unchecked — the aim is to catch a known-bad shape, not to invent a policy about
 * addresses this app has never seen.
 *
 * @param reference any URL known to be well-formed — in practice a sibling attachment's `url`.
 */
export function usableVariant(
  variants: Readonly<Record<string, string>> | null | undefined,
  reference: string | null | undefined,
  order: readonly string[] = ['thumb', 'small', 'medium'],
): string | null {
  const all = variants ?? {};
  const preferred = order.map((k) => all[k]);
  const candidates = [...preferred, ...Object.values(all)].filter(
    (u): u is string => typeof u === 'string' && u !== '',
  );
  if (!candidates.length) return null;

  const expected = hostOf(reference);
  if (!expected) return candidates[0];
  return candidates.find((u) => hostOf(u) === expected) ?? null;
}

/** The host of a URL, or null if it is not one. Never throws — callers pass server data. */
function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
