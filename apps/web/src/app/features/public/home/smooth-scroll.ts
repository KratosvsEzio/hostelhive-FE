import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, PLATFORM_ID, inject } from '@angular/core';

/**
 * Smooth, eased wheel scrolling for the page that calls it, removed again when it is destroyed.
 *
 * A mouse wheel moves the page in whole notches, about 100 px in a single frame each, which
 * reads as a series of jumps on a long, photographic page however fast it renders. Lenis turns
 * each notch into a short glide. It leaves alone what is already smooth or not ours to change:
 * touch and trackpad scrolling stay native, so does everyone who asked for reduced motion, and
 * anything with its own scroll inside the page (a dropdown list) keeps it.
 *
 * Loaded on demand, so it never reaches the initial bundle or the server.
 * Must be called in an injection context.
 */
export function useSmoothScroll(): void {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
  let gone = false;
  let stop: (() => void) | undefined;
  inject(DestroyRef).onDestroy(() => {
    gone = true;
    stop?.();
  });
  void import('lenis').then(({ default: Lenis }) => {
    if (gone) return;
    const lenis = new Lenis({
      autoRaf: true,
      // How much of the remaining distance each frame covers: lower glides longer.
      lerp: 0.12,
      allowNestedScroll: true,
      respectReducedMotion: true,
    });
    stop = () => lenis.destroy();
  });
}
