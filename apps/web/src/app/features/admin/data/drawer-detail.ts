// Shared helpers for the admin detail drawers (contracts, payments): a loading/error/data state
// wrapper for an on-demand sub-detail fetch, and a hostel image resolver for the carousel.
import { Observable, catchError, map, of, startWith } from 'rxjs';
import { HostelAttachment, HostelDetail } from '@hostelhive/data-access';

/** Loading/error/data state for a drawer sub-detail (hostel, host) fetched on demand. */
export interface DetailState<T> {
  loading: boolean;
  error: boolean;
  data: T | null;
}

/** Fetch a drawer sub-detail keyed off an id, as a loading → data/error state stream. */
export function loadDetail<T>(
  id: number | string | null,
  fetch: (id: number | string) => Observable<T>,
): Observable<DetailState<T>> {
  if (id == null)
    return of<DetailState<T>>({ loading: false, error: false, data: null });
  return fetch(id).pipe(
    map((data): DetailState<T> => ({ loading: false, error: false, data })),
    startWith<DetailState<T>>({ loading: true, error: false, data: null }),
    catchError(() =>
      of<DetailState<T>>({ loading: false, error: true, data: null }),
    ),
  );
}

/** Resolve a hostel's display images — banner first, then any image attachments (de-duped). */
export function resolveHostelImages(h: HostelDetail): string[] {
  const urls = [
    ...(h.banner ?? []).map(attachmentUrl),
    ...(h.attachments ?? []).filter(isImageAttachment).map(attachmentUrl),
  ].filter((u): u is string => !!u);
  return [...new Set(urls)];
}

/** Best URL for an attachment — the direct `url`, else its first variant. */
function attachmentUrl(a: HostelAttachment | null | undefined): string | null {
  if (!a) return null;
  if (a.url) return a.url;
  const variant = a.variants ? Object.values(a.variants).find(Boolean) : null;
  return variant ?? null;
}

/** True when an attachment is an image (by content type, else type/filename hints). */
function isImageAttachment(a: HostelAttachment | null | undefined): boolean {
  if (!a) return false;
  if (a.content_type) return a.content_type.startsWith('image/');
  const hint = `${a.attachment_type ?? ''} ${a.file_name ?? ''}`.toLowerCase();
  return /image|photo|banner|cover|\.(png|jpe?g|webp|gif|avif)$/.test(hint);
}
