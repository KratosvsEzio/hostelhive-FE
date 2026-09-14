import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Directive,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject,
  input,
} from '@angular/core';

/**
 * How near the viewport an image has to get before it is fetched.
 *
 * 200px, not the 600px this started as. "One screen of warning" sounds right and is the wrong
 * unit: a margin only defers what falls outside it, so it has to be small relative to the
 * thing it guards, not relative to the screen. The photo grid is ~1249px of content in a
 * ~730px scroller at 375px — 730 + 600 = 1330, wider than the entire grid, so every tile was
 * inside the window the moment it opened and all ten originals fetched. 14.97 MB, unchanged
 * from having no directive at all.
 *
 * 200px defers everything past ~990px on that viewport, which is half the grid, and still
 * gives a scrolling reader most of a screen of lead.
 */
const DEFAULT_ROOT_MARGIN = '200px';

/**
 * Loads an image only once it is genuinely near the viewport.
 *
 * `loading="lazy"` is the right instinct and it is not enough here. Chrome scales its
 * load-distance margin with viewport height, and on a 790px phone that margin swallowed the
 * whole 1451px photo grid — measured: all ten tiles requested within five seconds of opening
 * the gallery, **15.3 MB**, one file alone 7.8 MB. The same attribute genuinely works on a
 * short viewport (5 of 10 deferred at 784×214), which is what made it look correct.
 *
 * So the distance is set explicitly rather than left to the heuristic. One observer per image,
 * disconnected the moment it fires — this never re-runs, and a tile that has loaded stays
 * loaded when it scrolls away.
 *
 * ```html
 * <img [hhLazySrc]="photo.url" alt="" class="…" />
 * ```
 *
 * On the server the `src` is written directly: there is no viewport to intersect with, and an
 * `<img>` with no `src` in the SSR payload is an image the crawler cannot see.
 */
@Directive({
  selector: 'img[hhLazySrc]',
})
export class LazySrc implements AfterViewInit, OnDestroy {
  readonly hhLazySrc = input.required<string>();

  /**
   * How far ahead to start loading. Exposed because the right value depends on what is being
   * guarded, not on the screen — see {@link DEFAULT_ROOT_MARGIN}. A caller with a short
   * scroller wants less than one with a long page.
   */
  readonly lazyMargin = input(DEFAULT_ROOT_MARGIN);

  private readonly host = inject<ElementRef<HTMLImageElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private observer?: IntersectionObserver;

  ngAfterViewInit(): void {
    const img = this.host.nativeElement;

    // No viewport on the server, and no observer in an environment without one — both fall
    // back to loading normally rather than to never loading at all.
    if (!this.isBrowser || typeof IntersectionObserver === 'undefined') {
      this.load();
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        this.load();
        this.disconnect();
      },
      { rootMargin: this.lazyMargin() },
    );
    this.observer.observe(img);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private load(): void {
    const img = this.host.nativeElement;
    const url = this.hhLazySrc();
    if (url && img.getAttribute('src') !== url) img.setAttribute('src', url);
  }

  private disconnect(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }
}
