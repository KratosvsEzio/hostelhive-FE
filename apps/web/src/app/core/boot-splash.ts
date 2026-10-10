import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Signal, effect, inject } from '@angular/core';

/**
 * Shortest time the boot splash stays up, counted from navigation start: long enough for the
 * bee to fly in and wave, so a fast load still reads as a greeting rather than a flicker.
 */
export const BOOT_MIN_MS = 1600;

/** Matches the splash's CSS opacity transition in index.html. */
const FADE_MS = 250;

/**
 * Lifts the boot splash (`#hh-boot`, static HTML in index.html) once startup has resolved.
 *
 * The splash is painted by the server's HTML before any JavaScript runs; this is the only
 * thing that takes it down. It stays while `busy` (the StartupGate: session and country still
 * resolving) and for at least {@link BOOT_MIN_MS}.
 *
 * Call from an injection context — the root component's constructor.
 */
export function liftBootSplashWhenReady(busy: Signal<boolean>): void {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
  const splash = inject(DOCUMENT).getElementById('hh-boot');
  if (!splash) return;

  let lifted = false;
  effect((onCleanup) => {
    if (lifted || busy()) return;
    // A claim that starts inside the dwell re-runs this effect and cancels the lift.
    const timer = setTimeout(() => {
      lifted = true;
      lift(splash);
    }, Math.max(0, BOOT_MIN_MS - performance.now()));
    onCleanup(() => clearTimeout(timer));
  });
}

function lift(splash: HTMLElement): void {
  splash.classList.add('hh-boot-out');
  // Stop decoding the moment it is invisible, and drop the node once the fade is done.
  splash.querySelectorAll('video').forEach((v) => v.pause());
  setTimeout(() => splash.remove(), FADE_MS + 50);
}
