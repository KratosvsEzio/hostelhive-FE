import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the Angular SPA (the `build-mobile` output) into native
 * iOS/Android shells. `webDir` points at the no-SSR browser bundle produced by
 * `nx run web:build-mobile`.
 *
 * NOTE: `appId` is the store/bundle identity (Android package + iOS bundle ID).
 * It is painful to change after the first store submission — confirm it before
 * publishing.
 */
const config: CapacitorConfig = {
  appId: 'com.hostelhive.app',
  appName: 'HostelHive',
  webDir: 'dist/apps/web-mobile/browser',
  server: {
    // https scheme → WebView origin is https://localhost, which keeps secure-
    // context web APIs (geolocation, crypto.subtle, service workers) available.
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
  },
};

export default config;
