import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

/** localStorage key for the browser preview override (`?mobile=1` / `?mobile=0`). */
const PREVIEW_KEY = 'hh-mobile-preview';

/**
 * Below this width the app uses the native chrome (bottom tab bars, sheets, More
 * screen) instead of the web chrome. 768px is the phone/tablet split: at 768–1023 the
 * consoles already have their own overlay-drawer sidebar, so this leaves that alone.
 */
const PHONE_MAX = 767;

/**
 * Platform switch for the mobile-app chrome (bottom tab bars, sheets, More screen).
 *
 * `isMobile` is true inside the Capacitor WebView, and on the web whenever the
 * viewport is phone-sized — so a narrow browser gets the same chrome the packaged app
 * does, and a desktop window never does. It tracks resize and rotation, so the chrome
 * swaps live rather than only at page load.
 *
 * `?mobile=1` on any URL pins the native chrome on regardless of width (useful for
 * demoing it on a desktop); `?mobile=0` clears that pin and returns to width-based
 * behaviour. SSR always renders the web chrome; the signal only flips in the browser.
 */
@Injectable({ providedIn: 'root' })
export class MobileApp {
  readonly isMobile = signal(false);

  constructor() {
    if (typeof window === 'undefined') return;
    try {
      const flag = new URLSearchParams(window.location.search).get('mobile');
      if (flag === '1') localStorage.setItem(PREVIEW_KEY, '1');
      if (flag === '0') localStorage.removeItem(PREVIEW_KEY);

      // The packaged app and an explicit pin are both unconditional — no width test.
      if (
        Capacitor.isNativePlatform() ||
        localStorage.getItem(PREVIEW_KEY) === '1'
      ) {
        this.isMobile.set(true);
        return;
      }

      const mq = window.matchMedia(`(max-width: ${PHONE_MAX}px)`);
      this.isMobile.set(mq.matches);
      mq.addEventListener('change', (e) => this.isMobile.set(e.matches));
    } catch {
      this.isMobile.set(Capacitor.isNativePlatform());
    }
  }
}
