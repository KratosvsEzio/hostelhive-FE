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
 * - `greeting` — flies in, waves hello, then hovers on a calm loop. No prop: for the app
 *                starting up, where nobody is searching anything yet.
 * - `oops`     — magnifying glass in hand, one apologetic shrug, then holds still. For a
 *                failed search.
 * - `still`    — the resting pose with the glass, no motion. For an empty search.
 * - `search`   — hunts on a loop with the magnifying glass. For a search box.
 * - `key`      — holds up a room key on a loop. For moving in and for hosting.
 */
export type MascotMode = 'greeting' | 'oops' | 'still' | 'search' | 'key';

const BASE = '/mascot';

/** Length of `hello.webp`, in milliseconds. */
const HELLO_MS = 1500;

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
 * the animated WebP. Both are framed tight on the bee, so `size` is the bee itself.
 *
 * `delay` holds the bee back so a fast answer never flashes it — a loader that appears for
 * 80 ms reads as a glitch, not as a loader.
 *
 * `<hh-mascot mode="greeting" [size]="96" [delay]="300" />`
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
        <img [src]="stillSrc()" alt="" class="size-full object-contain" />
      }
      @case ('video') {
        @if (mode() === 'greeting') {
          <video
            class="size-full [grid-area:1/1]"
            [class.opacity-0]="looping()"
            [src]="base + '/hello.webm'"
            [muted]="true"
            muted
            autoplay
            playsinline
            preload="auto"
            disablepictureinpicture
            (ended)="startLoop(hover)"
          ></video>
          <video
            #hover
            class="size-full [grid-area:1/1]"
            [class.opacity-0]="!looping()"
            [src]="base + '/hover.webm'"
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
            [src]="base + '/' + mode() + '.webm'"
            [loop]="mode() !== 'oops'"
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
  /** The greeting has finished and the hover loop has taken over. */
  protected readonly looping = signal(false);

  protected readonly render = computed<'none' | 'still' | 'video' | 'image'>(() => {
    if (!this.shown()) return 'none';
    if (this.mode() === 'still' || this.reducedMotion) return 'still';
    return this.alphaVideo ? 'video' : 'image';
  });

  /** The still pose matches the mode: no glass for the greeting, the glass for search states. */
  protected readonly stillSrc = computed(() =>
    this.mode() === 'greeting' || this.mode() === 'key'
      ? `${BASE}/hover-still.webp`
      : `${BASE}/still.webp`,
  );

  /** WebP path. An image has no `ended` event, so the greeting is swapped on its length. */
  protected readonly imageSrc = computed(() => {
    const m = this.mode();
    if (m === 'oops' || m === 'search' || m === 'key') return `${BASE}/${m}.webp`;
    return `${BASE}/${this.looping() ? 'hover' : 'hello'}.webp`;
  });

  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private swapScheduled = false;

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

  /**
   * Starts the greeting clock once the greeting WebP has actually arrived. Timed from mount, a
   * slow connection swapped to the loop before the bee had finished waving.
   */
  protected imageLoaded(): void {
    if (this.mode() !== 'greeting' || this.swapScheduled) return;
    this.swapScheduled = true;
    this.timers.push(setTimeout(() => this.looping.set(true), HELLO_MS));
  }

  /** Hands over from the greeting to the loop, on the frame the greeting ends. */
  protected startLoop(hover: HTMLVideoElement): void {
    this.looping.set(true);
    hover.currentTime = 0;
    // A rejected play() (autoplay policy, tab in the background) leaves the last greeting
    // frame showing, which is the rest pose the loop starts from anyway.
    hover.play()?.catch(() => undefined);
  }
}
