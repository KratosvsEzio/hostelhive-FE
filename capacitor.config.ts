import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Capacitor wraps the Angular SPA (the `build-mobile` output) into native
 * iOS/Android shells. `webDir` points at the no-SSR browser bundle produced by
 * `nx run web:build-mobile`.
 *
 * NOTE: `appId` is the store/bundle identity (Android package + iOS bundle ID).
 * It is painful to change after the first store submission — confirm it before
 * publishing.
 */

function readDotEnv(): Record<string, string> {
  const envPath = join(process.cwd(), '.env');
  const result: Record<string, string> = {};
  if (!existsSync(envPath)) return result;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trimStart().startsWith('#'))
      result[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return result;
}

const env = readDotEnv();

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
    GoogleAuth: {
      // Web OAuth 2.0 client ID from GCP Console → set GOOGLE_OAUTH_CLIENT_ID in .env
      // Android also needs an Android OAuth 2.0 client in GCP with the APK SHA-1 fingerprint.
      clientId: env['GOOGLE_OAUTH_CLIENT_ID'] ?? '',
      scopes: ['email', 'profile'],
    },
  },
};

export default config;
