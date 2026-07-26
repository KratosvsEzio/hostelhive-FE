import {
  IMAGE_TYPE_MESSAGE,
  MAX_PHOTOS,
  PHOTO_LIMIT_MESSAGE,
  classifyImageFile,
} from '@hostelhive/ui';
import { MAX_UPLOAD_BYTES } from '@services/documents-api';

/** Outcome of screening a picked batch of hostel photos. */
export interface PhotoPickResult {
  /** Files that passed every check and should be uploaded. */
  accepted: File[];
  /** Message to surface to the host, or `null` when nothing was rejected. */
  error: string | null;
}

function megabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

function reasonsFor(typeRejects: number, sizeRejects: number, maxBytes: number): string {
  const reasons: string[] = [];
  if (typeRejects) reasons.push(IMAGE_TYPE_MESSAGE);
  if (sizeRejects) reasons.push(`Images must be under ${megabytes(maxBytes)} MB.`);
  return reasons.join(' ');
}

/**
 * Screens a picked batch of files against the accepted image formats, the upload
 * size cap and the per-hostel photo limit. The limit is batch-atomic: a batch that
 * would overflow it is rejected whole rather than silently truncated. Every
 * rejection yields an `error`, so a pick never ends without a visible effect.
 */
export function screenPickedPhotos(
  files: File[],
  currentCount: number,
  maxBytes: number = MAX_UPLOAD_BYTES,
): PhotoPickResult {
  if (currentCount + files.length > MAX_PHOTOS)
    return { accepted: [], error: PHOTO_LIMIT_MESSAGE };

  const accepted: File[] = [];
  let typeRejects = 0;
  let sizeRejects = 0;
  for (const file of files) {
    const verdict = classifyImageFile(file, maxBytes);
    if (verdict === 'ok') accepted.push(file);
    else if (verdict === 'type') typeRejects++;
    else sizeRejects++;
  }

  const rejected = typeRejects + sizeRejects;
  if (!rejected) return { accepted, error: null };

  const reasons = reasonsFor(typeRejects, sizeRejects, maxBytes);
  if (!accepted.length) return { accepted, error: reasons };
  const noun = rejected === 1 ? 'file' : 'files';
  return { accepted, error: `${rejected} ${noun} skipped — ${reasons}` };
}

/**
 * Screens the single file picked to replace an existing photo. Never consults the
 * photo limit — a replacement does not change the count.
 */
export function screenReplacementPhoto(
  file: File,
  maxBytes: number = MAX_UPLOAD_BYTES,
): PhotoPickResult {
  const verdict = classifyImageFile(file, maxBytes);
  if (verdict === 'ok') return { accepted: [file], error: null };
  return {
    accepted: [],
    error: reasonsFor(verdict === 'type' ? 1 : 0, verdict === 'size' ? 1 : 0, maxBytes),
  };
}
