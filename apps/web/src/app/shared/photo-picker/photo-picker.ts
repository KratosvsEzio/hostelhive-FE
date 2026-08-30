import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  ACCEPT_ATTR,
  Button,
  IMAGE_TYPE_MESSAGE,
  classifyImageFile,
} from '@hostelhive/ui';
import { CameraPermissionDeniedError, NativeCamera } from './native-camera';
import { TranslocoPipe } from '@jsverse/transloco';

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * One reusable image picker offering all three input methods everywhere the app takes a
 * photo: **drag & drop**, **choose from device files**, and **take a photo with the camera**
 * (the Capacitor native camera in the packaged app, a `getUserMedia` overlay on the web). It
 * owns selection + preview + camera only; the parent still uploads the emitted File
 * (mirroring `hh-photo-grid`'s split), so it drops into any existing upload flow.
 *
 * One photo at a time unless {@link maxFiles} says otherwise, and either way it emits one
 * file per event — so a caller that takes a single image never has to know about the rest.
 *
 * `<hh-photo-picker [preview]="url()" shape="circle" [uploading]="busy()" [error]="err()"
 *    (picked)="onFile($event)" />`
 */
/** See {@link PhotoPicker.shape}. */
export type PhotoPickerShape = 'circle' | 'rect' | 'square' | 'wide';

const TILE_CLASS: Record<PhotoPickerShape, string> = {
  circle: 'h-24 w-24 rounded-full',
  rect: 'aspect-[4/3] w-full overflow-hidden rounded-xl',
  square: 'aspect-square w-full overflow-hidden rounded-xl',
  wide: 'w-full overflow-hidden rounded-xl py-10',
};
@Component({
  selector: 'hh-photo-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, TranslocoPipe],
  host: { '(document:click)': 'onDocClick($event)' },
  templateUrl: './photo-picker.html',
})

export class PhotoPicker {
  /** Current image to show (URL, object URL, or data URL). Empty → the empty placeholder. */
  readonly preview = input<string | null>(null);
  /** Placeholder caption when empty, e.g. "Add photo" / "Upload front". */
  readonly label = input<string | undefined>(undefined);
  /**
   * The tile’s footprint. Behaviour is identical across all four — only the box changes.
   *
   * `circle` avatars, `rect` (4:3) grid tiles and documents, `square` for a tile sitting in a
   * 1:1 grid, `wide` for a full-width empty-state dropzone. The last two exist because the
   * sites that needed them had hand-rolled their own file-only tiles rather than lose their
   * shape — which cost them the camera. A shape is a cheaper thing to add than a duplicate.
   */
  readonly shape = input<PhotoPickerShape>('rect');
  /** Shows a spinner over the tile while the parent uploads. */
  readonly uploading = input(false);
  /** Parent-supplied error (e.g. upload failed) — shown alongside local validation errors. */
  readonly error = input('');
  /** `accept` attribute for the file input. Defaults to the app's accepted image formats. */
  readonly accept = input(ACCEPT_ATTR);
  /** Reject files larger than this (bytes). */
  readonly maxBytes = input(DEFAULT_MAX_BYTES);
  /**
   * How many images this picker may take in one go. One, unless told otherwise.
   *
   * The caller passes the number of slots still free, not a fixed cap: a grid with three
   * empty tiles opens the file dialog on three, and the same grid with two already filled
   * opens it on one. Anything beyond that is dropped here rather than sent on, because the
   * picker is where the selection happens — clamping later means the host has already chosen
   * files that will silently not arrive.
   *
   * Selecting three photos used to mean opening the dialog three times, since the input had
   * no `multiple` and took `files[0]`. A drag of three files behaved the same way: two were
   * discarded without a word.
   */
  readonly maxFiles = input(1);

  /**
   * Emits each chosen image (validated) from any of the three methods.
   *
   * Once per file rather than one array, so every existing single-image caller is unchanged:
   * a picker left at `maxFiles = 1` still emits exactly once, and the multi case is the same
   * event happening more than once.
   */
  readonly picked = output<File>();

  /**
   * What was left out of a pick, and why — for a parent that outlives this tile.
   *
   * The picker shows the message itself, but a grid takes the tile away the moment its last
   * slot fills, and the pick that fills it is exactly the one likely to have dropped a file.
   * A parent that renders its own error line can hold on to the reason; one that does not is
   * unaffected, since the message still appears here whenever the tile is still there.
   */
  readonly rejected = output<string>();

  private readonly nativeCamera = inject(NativeCamera);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * One class string for both menu rows, because they cannot be the same element.
   *
   * "Choose from files" has to be a <label> wrapping a hidden file input — that is what opens
   * the file dialog without a click handler. "Take a photo" is a button. They used to be an
   * hh-button and a hand-rolled label, which meant two paddings, two gaps and two font sizes —
   * and since the icons inherit their size from the text, two icon sizes as well.
   */
  protected readonly menuItemClass =
    'flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-start text-sm text-ink-700 transition hover:bg-ink-50';

  protected readonly dragOver = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly cameraOpen = signal(false);
  private readonly localError = signal('');

  private readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('video');
  private stream: MediaStream | null = null;

  protected readonly tileClass = computed(() => TILE_CLASS[this.shape()]);
  protected readonly displayError = computed(() => this.error() || this.localError());

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopCamera());
  }

  // ── Drag & drop ─────────────────────────────────────────────────────────────

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    this.take(event.dataTransfer?.files ?? null);
  }

  // ── File picker ─────────────────────────────────────────────────────────────

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Copied out before the reset, and not merely referenced: `input.files` is a live view of
    // the input's selection, so clearing the value empties the list already in hand and the
    // pick arrives as nothing at all.
    const files = Array.from(input.files ?? []);
    input.value = ''; // let the same file be re-picked after a validation reject
    this.menuOpen.set(false);
    this.take(files);
  }

  // ── Camera ──────────────────────────────────────────────────────────────────

  protected async takePhoto(): Promise<void> {
    this.menuOpen.set(false);
    if (this.nativeCamera.available) {
      try {
        const file = await this.nativeCamera.capture();
        if (file) this.take([file]);
      } catch (e) {
        this.localError.set(
          e instanceof CameraPermissionDeniedError
            ? 'Camera access is off. Enable the camera for this app in Settings.'
            : 'Couldn\'t open the camera.',
        );
      }
      return;
    }
    await this.openWebCamera();
  }

  private async openWebCamera(): Promise<void> {
    if (!this.isBrowser || !navigator.mediaDevices?.getUserMedia) {
      this.localError.set('Camera is not available on this device.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      this.cameraOpen.set(true);
      // Defer until the <video> is in the DOM.
      setTimeout(() => {
        const el = this.videoEl()?.nativeElement;
        if (el) {
          el.srcObject = this.stream;
          void el.play();
        }
      });
    } catch {
      this.localError.set('Couldn\'t access the camera. Check browser permissions.');
    }
  }

  protected captureWebPhoto(): void {
    const el = this.videoEl()?.nativeElement;
    if (!el?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext('2d')?.drawImage(el, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) this.take([new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' })]);
        this.stopCamera();
      },
      'image/jpeg',
      0.92,
    );
  }

  protected stopCamera(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.cameraOpen.set(false);
  }

  // ── Menu ────────────────────────────────────────────────────────────────────

  protected toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((o) => !o);
  }

  protected onDocClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  // ── Validation + emit ───────────────────────────────────────────────────────

  /**
   * Screens everything the host chose and emits what fits, one file at a time.
   *
   * Every way in lands here — dialog, drop, camera — so a batch and a single photo are
   * screened by the same rules, and a batch of one behaves exactly as it did before this took
   * more than one.
   *
   * A file over the cap is dropped, but never quietly: keeping the first three of five and
   * saying nothing leaves the host watching two photos not appear with no way to tell whether
   * the upload failed or the limit did. Rejections are counted rather than set as they go,
   * because a message written per file would let the last photo in the selection decide what
   * the host is told about all of them. Screening is still per file, so one oversized photo
   * does not cost the two good ones it was picked with.
   */
  private take(list: FileList | File[] | null): void {
    const files = Array.from(list ?? []);
    if (!files.length) return;

    const room = Math.max(1, this.maxFiles());
    const overflow = Math.max(0, files.length - room);
    const accepted: File[] = [];
    let typeRejects = 0;
    let sizeRejects = 0;

    for (const file of files.slice(0, room)) {
      const verdict = classifyImageFile(file, this.maxBytes());
      if (verdict === 'ok') accepted.push(file);
      else if (verdict === 'type') typeRejects++;
      else sizeRejects++;
    }

    const problem = this.rejectionMessage(
      overflow,
      typeRejects,
      sizeRejects,
      accepted.length,
      room,
    );
    this.localError.set(problem);
    for (const file of accepted) this.picked.emit(file);
    // After the accepted files, so a parent that clears its own copy on `picked` does not
    // clear the message this pick just produced.
    if (problem) this.rejected.emit(problem);
  }

  /**
   * What to say about the files that did not make it — `''` when they all did.
   *
   * Shaped like `screenPickedPhotos`, which screens the hostel-photo grid: the bare reason
   * when nothing survived, and a count in front of it when some did, so "2 files skipped"
   * accounts for the gap between what the host chose and what appeared.
   */
  private rejectionMessage(
    overflow: number,
    typeRejects: number,
    sizeRejects: number,
    acceptedCount: number,
    room: number,
  ): string {
    const rejected = overflow + typeRejects + sizeRejects;
    if (!rejected) return '';

    const reasons: string[] = [];
    if (overflow) {
      reasons.push(room === 1 ? 'Only one more photo fits.' : `Only ${room} more photos fit.`);
    }
    if (typeRejects) reasons.push(IMAGE_TYPE_MESSAGE);
    if (sizeRejects) reasons.push('That image is too large.');

    const why = reasons.join(' ');
    if (!acceptedCount) return why;
    return `${rejected} ${rejected === 1 ? 'file' : 'files'} skipped — ${why}`;
  }
}
