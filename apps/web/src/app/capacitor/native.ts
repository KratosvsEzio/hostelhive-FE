import { inject, provideAppInitializer } from '@angular/core';
import { Location } from '@angular/common';
import { Capacitor } from '@capacitor/core';

/**
 * Native-only bootstrap. A no-op on the web/SSR builds (Capacitor APIs only
 * exist inside the native WebView), so the same `appConfig` serves both web and
 * mobile. When packaged with Capacitor it:
 *   - styles the status bar to match the white app chrome,
 *   - hides the splash screen once Angular is ready,
 *   - wires the Android hardware back button to Angular's history.
 *
 * The plugin packages are dynamically imported so they never enter the web
 * bundle's eager path.
 */
export function provideCapacitorNative() {
  return provideAppInitializer(() => {
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;

    // Captured in injection context, used inside the async block below.
    const location = inject(Location);

    void (async () => {
      const [{ StatusBar, Style }, { SplashScreen }, { App }] =
        await Promise.all([
          import('@capacitor/status-bar'),
          import('@capacitor/splash-screen'),
          import('@capacitor/app'),
        ]);

      // Light style = dark text/icons, for our light (white) status bar.
      try {
        await StatusBar.setStyle({ style: Style.Light });
        if (Capacitor.getPlatform() === 'android') {
          await StatusBar.setBackgroundColor({ color: '#ffffff' });
        }
      } catch {
        // Status bar styling is best-effort; never block startup on it.
      }

      await SplashScreen.hide();

      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          location.back();
        } else {
          void App.exitApp();
        }
      });
    })();
  });
}
