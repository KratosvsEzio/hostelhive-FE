import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Dropdown, DropdownOption } from '../dropdown/dropdown';

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
  imports: [Dropdown],
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
            <img
              [src]="p.url"
              class="aspect-[4/3] w-full object-cover opacity-50"
              alt=""
            />
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
              <img
                [src]="p.url"
                class="aspect-[4/3] w-full object-cover"
                [class.opacity-40]="p.uploadProgress !== undefined"
                alt=""
              />

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
                    class="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold text-white"
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
                      title="Replace"
                      (click)="replacePhoto.emit(p.id)"
                    >
                      <i class="ti ti-replace text-sm" aria-hidden="true"></i>
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-ink-700 hover:bg-white"
                      title="Set primary"
                      (click)="setPrimary.emit(p.id)"
                    >
                      <i class="ti ti-star text-sm" aria-hidden="true"></i>
                    </button>
                    <button
                      type="button"
                      class="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-danger hover:bg-white"
                      title="Remove"
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
                  [compact]="true"
                  placeholder="Select label"
                  [options]="labelOptions()"
                  [value]="labelMap().get(p.id) ?? null"
                  (valueChange)="onLabelChange(p.id, $event)"
                />
              </div>
            }
          </div>
        }
      }

      <!-- Add / replace tile -->
      <button
        type="button"
        (click)="addPhoto.emit()"
        class="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed border-ink-300 text-ink-400 transition hover:border-brand-300 hover:text-brand-500"
      >
        <i class="ti ti-upload text-xl" aria-hidden="true"></i>
        <span class="mt-1 text-xs font-medium">Replace / add</span>
      </button>
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

  protected onLabelChange(id: string, v: string | string[] | null): void {
    this.labelChange.emit({ id, value: typeof v === 'string' ? v : null });
  }
}
