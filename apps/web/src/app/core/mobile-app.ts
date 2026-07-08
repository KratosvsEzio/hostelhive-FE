import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

/** localStorage key for the browser preview override (`?mobile=1` / `?mobile=0`). */
const PREVIEW_KEY = 'hh-mobile-preview';

/**
 * Platform switch for the mobile-app chrome (bottom tab bars, sheets, More screen).
 *
 * `isMobile` is true inside the Capacitor WebView (Android/iOS). For designing and
 * verifying in a desktop browser, `?mobile=1` on any URL persists a preview override
 * (`?mobile=0` clears it) — the same SPA then renders the native chrome on the web.
 * SSR always renders the web chrome; the signal only flips in the browser.
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
      this.isMobile.set(
        Capacitor.isNativePlatform() ||
          localStorage.getItem(PREVIEW_KEY) === '1',
      );
    } catch {
      this.isMobile.set(Capacitor.isNativePlatform());
    }
  }
}
