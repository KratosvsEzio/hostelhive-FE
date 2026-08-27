import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Dropdown, DropdownOption } from '../dropdown/dropdown';

/** MIME types accepted by every hostel photo picker. */
export const ACCEPTED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/webp',
] as const;

/** Dot-prefixed lower-case extensions matching `ACCEPTED_IMAGE_MIMES`. */
export const ACCEPTED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.avif',
  '.heic',
  '.heif',
  '.webp',
] as const;

/** Extensions ride alongside the MIME types because Windows often has no OS registration for HEIC/AVIF. */
export const ACCEPT_ATTR = [
  ...ACCEPTED_IMAGE_MIMES,
  ...ACCEPTED_IMAGE_EXTENSIONS,
].join(',');

/** Maximum number of photos a single hostel may hold. */
export const MAX_PHOTOS = 10;

/** Shown when a batch would push a hostel past `MAX_PHOTOS`. */
export const PHOTO_LIMIT_MESSAGE =
  'A hostel can have at most 10 photos — remove one before adding more.';

/** Shown when a picked file is not one of the accepted image formats. */
export const IMAGE_TYPE_MESSAGE =
  'JPG, PNG, WebP, AVIF or HEIC images only.';

/** Outcome of validating a picked file against the accepted image formats. */
export type ImageFileVerdict = 'ok' | 'type' | 'size';

const GENERIC_MIMES = new Set(['', 'application/octet-stream']);

const EXTENSION_MIMES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.webp': 'image/webp',
};

/** Lower-case dot-prefixed extension of `name`, or `''` when it has none. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

/**
 * Classifies a picked file against the accepted image formats and `maxBytes`.
 * Accepts a file whose MIME is allowed, or whose MIME is empty/generic while its
 * extension is allowed — browsers routinely report no MIME for HEIC/HEIF/AVIF.
 */
export function classifyImageFile(file: File, maxBytes: number): ImageFileVerdict {
  const mime = file.type.toLowerCase();
  const extension = fileExtension(file.name);
  const mimeAllowed = (ACCEPTED_IMAGE_MIMES as readonly string[]).includes(mime);
  const extensionAllowed = (
    ACCEPTED_IMAGE_EXTENSIONS as readonly string[]
  ).includes(extension);
  if (!mimeAllowed && !(GENERIC_MIMES.has(mime) && extensionAllowed))
    return 'type';
  if (file.size > maxBytes) return 'size';
  return 'ok';
}

/**
 * The MIME type to advertise when uploading `file`. Falls back to the extension
 * so an unlabelled HEIC/AVIF still presigns and lands on S3 correctly typed.
 */
export function imageMimeType(file: File): string {
  const mime = file.type.toLowerCase();
  if (mime && !GENERIC_MIMES.has(mime)) return mime;
  return EXTENSION_MIMES[fileExtension(file.name)] ?? 'application/octet-stream';
}

/** Short upper-case format name for a file, e.g. "HEIC". */
export function imageFormatLabel(file: File): string {
  const extension = fileExtension(file.name);
  if (extension) return extension.slice(1).toUpperCase();
  const subtype = file.type.split('/')[1] ?? '';
  return subtype ? subtype.toUpperCase() : 'Image';
}

/** A single item in the photo grid. Map your domain photo type to this before passing in. */
export interface PhotoGridPhoto {
  id: string;
  url: string;
  primary: boolean;
  /** 0–100 while an upload is in progress; omit (or undefined) when idle. */
  uploadProgress?: number;
  /** Dims the card and shows a "Rejected" overlay with an Undo button. */
  rejected?: boolean;
  rejectReason?: string;
  /** Short format name (e.g. "HEIC") shown when the browser can't decode the preview. */
  format?: string;
}

/**
 * Reusable photo grid used in the moderator/admin review pages and the host
 * onboarding wizard. Handles the visual layer only — file input, upload logic,
 * and confirmation modals stay in the parent.
 *
 * Outputs:
 *   addPhoto       — user clicked the "Replace / add" tile
 *   replacePhoto   — user clicked Replace on the primary card (id emitted)
 *   setPrimary     — user clicked the Star button (id emitted)
 *   removePhoto    — user clicked X (id emitted; parent shows confirm modal if needed)
 *   undoReject     — user clicked Undo on a rejected card (id emitted)
 *   labelChange    — user picked a label from the per-card dropdown ({ id, value })
 */
@Component({
  selector: 'hh-photo-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, TranslocoPipe],
  template: `
    @if (uploadError()) {
      <p
        class="mb-3 flex items-center gap-1.5 rounded-lg bg-danger/5 px-3 py-2 text-xs font-medium text-danger"
      >
        <i class="ti ti-alert-circle" aria-hidden="true"></i>{{ uploadError() }}
      </p>
    }

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      @for (p of photos(); track p.id) {
        @if (p.rejected) {
          <!-- Rejected overlay -->
          <div class="relative overflow-hidden rounded-xl ring-2 ring-danger">
            @if (isUndecodable(p.url)) {
              <div
                class="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 bg-ink-50 opacity-50"
              >
                <i
                  class="ti ti-photo-off text-xl text-ink-400"
                  aria-hidden="true"
                ></i>
                <span class="text-[10px] font-medium text-ink-400">
                  {{ p.format || 'Image' }} · preview unavailable
                </span>
              </div>
            } @else {
              <img
                [src]="p.url"
                class="aspect-[4/3] w-full object-cover opacity-50"
                alt=""
                (error)="onPreviewError(p.url)"
              />
            }
            <div
              class="absolute inset-0 flex flex-col items-center justify-center"
            >
              <span
                class="rounded-full bg-danger px-2 py-0.5 text-[10px] font-semibold text-white"
              >
                Rejected
                @if (p.rejectReason) {
                  · {{ p.rejectReason }}
                }
              </span>
              <button
                type="button"
                class="mt-1 text-[11px] font-medium text-white underline"
                (click)="undoReject.emit(p.id)"
              >
                Undo
              </button>
            </div>
          </div>
        } @else {
          <div class="group overflow-hidden rounded-xl ring-1 ring-ink-100">
            <div class="relative">
              @if (isUndecodable(p.url)) {
                <div
                  class="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 bg-ink-50"
                  [class.opacity-40]="p.uploadProgress !== undefined"
                >
                  <i
                    class="ti ti-photo-off text-xl text-ink-400"
                    aria-hidden="true"
                  ></i>
                  <span class="text-[10px] font-medium text-ink-400">
                    {{ p.format || 'Image' }} · preview unavailable
                  </span>
                </div>
              } @else {
                <img
                  [src]="p.url"
                  class="aspect-[4/3] w-full object-cover"
                  [class.opacity-40]="p.uploadProgress !== undefined"
                  alt=""
                  (error)="onPreviewError(p.url)"
                />
              }

              @if (p.uploadProgress !== undefined) {
                <!-- Upload progress overlay -->
                <div
                  class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-900/50 px-3"
                >
                  <span class="text-sm font-semibold text-white"
                    >{{ p.uploadProgress }}%</span
                  >
                  <div
                    class="h-1.5 w-full overflow-hidden rounded-full bg-white/30"
                  >
                    <div
                      class="h-full rounded-full bg-white transition-[width] duration-200"
                      [style.width.%]="p.uploadProgress"
                    ></div>
                  </div>
                </div>
              } @else {
                @if (p.primary) {
                  <span
                    class="absolute start-2 top-2 flex items-center gap-1 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold text-white"
                  >
                    <i
                      class="ti ti-star text-[10px]"
                      aria-hidden="true"
                    ></i>Primary
                  </span>
                }
                <div
                  class="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-ink-900/70 to-transparent p-2"
                >
                  @if (p.primary) {
                    <button
                      type="button"
                      class="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-ink-700 hover:bg-white"
                      [title]="'common.replace' | transloco"
                      (click)="replacePhoto.emit(p.id)"
                    >
                      <i class="ti ti-replace text-sm" aria-hidden="true"></i>
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-ink-700 hover:bg-white"
                      [title]="'common.setPrimary' | transloco"
                      (click)="setPrimary.emit(p.id)"
                    >
                      <i class="ti ti-star text-sm" aria-hidden="true"></i>
                    </button>
                    <button
                      type="button"
                      class="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-danger hover:bg-white"
                      [title]="'common.remove' | transloco"
                      (click)="removePhoto.emit(p.id)"
                    >
                      <i class="ti ti-x text-sm" aria-hidden="true"></i>
                    </button>
                  }
                </div>
              }
            </div>

            @if (labelOptions().length && p.uploadProgress === undefined) {
              <div class="border-t border-ink-100 bg-white px-1.5 py-1">
                <hh-dropdown
                  variant="field"
                  size="sm"
                  [placeholder]="'common.selectLabel' | transloco"
                  [options]="labelOptions()"
                  [value]="labelMap().get(p.id) ?? null"
                  (valueChange)="onLabelChange(p.id, $event)"
                />
              </div>
            }
          </div>
        }
      }

      <!-- Add / replace tile.

           Projected when the caller supplies one, because offering "take a photo" as well as
           "choose a file" needs the camera — Capacitor natively, getUserMedia on the web — and
           that lives in the app, not here. The default below stays for callers that only need
           a file, so nothing has to change to keep working. -->
      <ng-content select="[addTile]">
        <button
          type="button"
          [disabled]="atLimit()"
          [title]="atLimit() ? atLimitTitle() : ''"
          (click)="addPhoto.emit()"
          class="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-xl border border-dashed border-ink-300 text-ink-400 transition enabled:hover:border-brand-300 enabled:hover:text-brand-500 disabled:cursor-not-allowed disabled:border-ink-200 disabled:bg-ink-50 disabled:text-ink-300"
        >
          <i class="ti ti-upload text-xl" aria-hidden="true"></i>
          <span class="mt-1 text-xs font-medium">Replace / add</span>
        </button>
      </ng-content>
    </div>
  `,
})
export class PhotoGrid {
  readonly photos = input<PhotoGridPhoto[]>([]);
  /** When non-empty, shows a label dropdown below each idle photo card. */
  readonly labelOptions = input<DropdownOption[]>([]);
  /** Current label value per photo id — drives the dropdown selection. */
  readonly labelMap = input<Map<string, string | null>>(new Map());
  /** Inline error shown above the grid (e.g. upload failure). */
  readonly uploadError = input('');
  /** Greys out the "Replace / add" tile once the photo limit is reached. */
  readonly atLimit = input(false);
  /** Tooltip explaining why the add tile is greyed out. */
  readonly atLimitTitle = input(PHOTO_LIMIT_MESSAGE);

  /** User clicked the "Replace / add" tile. */
  readonly addPhoto = output<void>();
  /** User clicked Replace on the primary photo card. */
  readonly replacePhoto = output<string>();
  /** User clicked the Star button on a non-primary card. */
  readonly setPrimary = output<string>();
  /** User clicked X on a non-primary card. */
  readonly removePhoto = output<string>();
  /** User clicked Undo on a rejected card. */
  readonly undoReject = output<string>();
  /** User changed the label dropdown on a photo card. */
  readonly labelChange = output<{ id: string; value: string | null }>();

  /** URLs the browser failed to decode — keyed by URL so a replaced card re-tries. */
  private readonly undecodableUrls = signal<ReadonlySet<string>>(new Set());

  protected isUndecodable(url: string): boolean {
    return this.undecodableUrls().has(url);
  }

  protected onPreviewError(url: string): void {
    this.undecodableUrls.update((s) => new Set(s).add(url));
  }

  protected onLabelChange(id: string, v: string | string[] | null): void {
    this.labelChange.emit({ id, value: typeof v === 'string' ? v : null });
  }
}
