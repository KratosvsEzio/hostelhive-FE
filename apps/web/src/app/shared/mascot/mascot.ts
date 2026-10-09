import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';

/**
 * What the bee is doing.
 * - `searching` — flies in, then hunts with the magnifying glass on a loop. For a wait.
 * - `oops`      — one apologetic shrug, then holds still. For a failure.
 * - `still`     — the resting pose, no motion. For an empty state.
 */
export type MascotMode = 'searching' | 'oops' | 'still';

const BASE = '/mascot';

/**
 * Whether this engine can play VP9 WebM *with its alpha channel*.
 *
 * WebKit plays VP9 and drops the alpha, painting a black square where the page should show
 * through, and it says "probably" to `canPlayType` regardless — so the answer has to come from
 * the engine, not the codec query. Every iOS browser is WebKit underneath, whatever it is called.
 */
export function supportsAlphaWebm(userAgent: string): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return false;
  const webkit = /AppleWebKit/.test(userAgent);
  const blink = /Chrome|Chromium|Edg\//.test(userAgent);
  return !webkit || blink;
}

/**
 * The HostelHive bee, as a decorative illustration for waits, failures and empty states.
 *
 * Kept on a short leash on purpose: it never carries meaning (the copy beside it does, and it
 * is `aria-hidden`), it shows nothing at all on the server, and anyone who asked their system
 * for less motion gets the still pose. Chrome, Edge and Firefox get the alpha WebM; Safari gets
 * the animated WebP. Both are 60 fps and framed tight on the bee, so `size` is the bee itself.
 *
 * `delay` holds the bee back so a fast answer never flashes it — a loader that appears for
 * 80 ms reads as a glitch, not as a loader.
 *
 * `<hh-mascot mode="searching" [size]="96" [delay]="300" />`
 */
@Component({
  selector: 'hh-mascot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    class: 'inline-grid shrink-0 select-none pointer-events-none',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  template: `
    @switch (render()) {
      @case ('still') {
        <img [src]="base + '/still.webp'" alt="" class="size-full object-contain" />
      }
      @case ('video') {
        @if (mode() === 'searching') {
          <video
            class="size-full [grid-area:1/1]"
            [class.opacity-0]="looping()"
            [src]="base + '/enter.webm'"
            [muted]="true"
            muted
            autoplay
            playsinline
            preload="auto"
            disablepictureinpicture
            (ended)="startLoop(search)"
          ></video>
          <video
            #search
            class="size-full [grid-area:1/1]"
            [class.opacity-0]="!looping()"
            [src]="base + '/search.webm'"
            [muted]="true"
            muted
            loop
            playsinline
            preload="auto"
            disablepictureinpicture
          ></video>
        } @else {
          <video
            class="size-full"
            [src]="base + '/oops.webm'"
            [muted]="true"
            muted
            autoplay
            playsinline
            preload="auto"
            disablepictureinpicture
          ></video>
        }
      }
      @case ('image') {
        <img [src]="imageSrc()" alt="" class="size-full object-contain" (load)="imageLoaded()" />
      }
    }
  `,
})
export class Mascot implements OnInit {
  /** What the bee is doing. */
  readonly mode = input<MascotMode>('still');
  /** Edge length of the box the bee sits in, in CSS pixels. */
  readonly size = input(128);
  /** Milliseconds to wait before showing anything. */
  readonly delay = input(0);

  protected readonly base = BASE;

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly reducedMotion =
    this.isBrowser &&
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly alphaVideo = this.isBrowser && supportsAlphaWebm(navigator.userAgent);

  /** False until the delay has run out — and always false on the server. */
  private readonly shown = signal(false);
  /** The entrance has finished and the search loop has taken over. */
  protected readonly looping = signal(false);

  protected readonly render = computed<'none' | 'still' | 'video' | 'image'>(() => {
    if (!this.shown()) return 'none';
    if (this.mode() === 'still' || this.reducedMotion) return 'still';
    return this.alphaVideo ? 'video' : 'image';
  });

  /** WebP path. The entrance has no `ended` event as an image, so it is swapped on its length. */
  protected readonly imageSrc = computed(() => {
    if (this.mode() === 'oops') return `${BASE}/oops.webp`;
    return `${BASE}/${this.looping() ? 'search' : 'enter'}.webp`;
  });

  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timers.forEach(clearTimeout));
  }

  ngOnInit(): void {
    if (!this.isBrowser) return;
    const show = () => this.shown.set(true);
    const wait = this.delay();
    if (wait > 0) this.timers.push(setTimeout(show, wait));
    else show();
  }

  private swapScheduled = false;

  /**
   * Starts the entrance clock once the entrance WebP has actually arrived. Timed from mount, a
   * slow connection swapped to the loop before the bee had finished flying in.
   */
  protected imageLoaded(): void {
    if (this.mode() !== 'searching' || this.swapScheduled) return;
    this.swapScheduled = true;
    this.timers.push(setTimeout(() => this.looping.set(true), ENTER_MS));
  }

  /** Hands over from the entrance to the loop, on the frame the entrance ends. */
  protected startLoop(search: HTMLVideoElement): void {
    this.looping.set(true);
    search.currentTime = 0;
    // A rejected play() (autoplay policy, tab in the background) leaves the last entrance
    // frame showing, which is the rest pose the loop starts from anyway.
    search.play()?.catch(() => undefined);
  }
}

/** Length of `enter.webp`, in milliseconds. */
const ENTER_MS = 900;
