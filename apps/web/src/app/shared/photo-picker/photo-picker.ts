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
 * One reusable single-image picker offering all three input methods everywhere the app
 * takes a photo: **drag & drop**, **choose from device files**, and **take a photo with the
 * camera** (the Capacitor native camera in the packaged app, a `getUserMedia` overlay on the
 * web). It owns selection + preview + camera only; the parent still uploads the emitted File
 * (mirroring `hh-photo-grid`'s split), so it drops into any existing upload flow.
 *
 * `<hh-photo-picker [preview]="url()" shape="circle" [uploading]="busy()" [error]="err()"
 *    (picked)="onFile($event)" />`
 */
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
  /** `circle` for avatars, `rect` for documents/receipts/covers. */
  readonly shape = input<'circle' | 'rect'>('rect');
  /** Shows a spinner over the tile while the parent uploads. */
  readonly uploading = input(false);
  /** Parent-supplied error (e.g. upload failed) — shown alongside local validation errors. */
  readonly error = input('');
  /** `accept` attribute for the file input. Defaults to the app's accepted image formats. */
  readonly accept = input(ACCEPT_ATTR);
  /** Reject files larger than this (bytes). */
  readonly maxBytes = input(DEFAULT_MAX_BYTES);

  /** Emits the chosen image (validated) from any of the three methods. */
  readonly picked = output<File>();

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
    const file = event.dataTransfer?.files?.[0];
    if (file) this.emit(file);
  }

  // ── File picker ─────────────────────────────────────────────────────────────

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // let the same file be re-picked after a validation reject
    this.menuOpen.set(false);
    if (file) this.emit(file);
  }

  // ── Camera ──────────────────────────────────────────────────────────────────

  protected async takePhoto(): Promise<void> {
    this.menuOpen.set(false);
    if (this.nativeCamera.available) {
      try {
        const file = await this.nativeCamera.capture();
        if (file) this.emit(file);
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
        if (blob) this.emit(new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' }));
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

  private emit(file: File): void {
    const verdict = classifyImageFile(file, this.maxBytes());
    if (verdict === 'type') {
      this.localError.set(IMAGE_TYPE_MESSAGE);
      return;
    }
    if (verdict === 'size') {
      this.localError.set('That image is too large.');
      return;
    }
    this.localError.set('');
    this.picked.emit(file);
  }
}
