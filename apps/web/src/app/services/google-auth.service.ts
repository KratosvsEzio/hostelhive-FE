import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Observable, from, map, switchMap } from 'rxjs';
import { googleOAuthEnv } from '@app/google-oauth.env';

/** GIS token-client response — only the fields we act on. */
interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }): TokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const GIS_SCRIPT_ID = 'hh-gis-client';
/** Matches the native plugin's scopes, so a user sees the same consent screen either way. */
const SCOPES = 'email profile';

/**
 * Google sign-in, split by platform because the two need different libraries.
 *
 * Native (Android/iOS) keeps `@codetrix-studio/capacitor-google-auth`, which talks to
 * Google Play Services directly and is unaffected by anything below.
 *
 * Web does NOT use that plugin. Its web implementation loads `apis.google.com/js/platform.js`
 * and calls `gapi.auth2`, the legacy Google Platform Library — Google has turned that down,
 * and it now fails with a 500 from `accounts.google.com/o/oauth2/iframerpc`. Version
 * 3.4.0-rc.4 is the newest published release and still ships that path, so there is no
 * upgrade out of it. Web therefore goes straight to Google Identity Services here.
 *
 * `initTokenClient` is deliberately the OAuth2 *token* flow rather than `google.accounts.id`:
 * it yields an access token, which is exactly what `POST /api/user/google_login` already
 * accepts. Moving to an ID token would be stronger (signature verified locally instead of a
 * Google round-trip per login) but needs the backend to accept `id_token` first.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private gisReady?: Promise<void>;

  /**
   * Fetch the GIS script ahead of any click.
   *
   * This is not just a latency win. `requestAccessToken()` opens a popup, so it has to run
   * inside the user's click; loading the script first would break that chain on the very
   * first attempt and the browser would block the popup. Called from the app initializer.
   */
  preload(): Promise<void> {
    if (Capacitor.isNativePlatform()) return Promise.resolve();
    return this.loadGis().catch(() => {
      // Swallowed on purpose: a failed preload must not take down app bootstrap. The
      // retry on click surfaces the error where the user can see it.
      this.gisReady = undefined;
    });
  }

  getAccessToken(): Observable<string> {
    return Capacitor.isNativePlatform() ? this.nativeToken() : this.webToken();
  }

  /** Native: Play Services via the Capacitor plugin, imported lazily to keep it off web bundles. */
  private nativeToken(): Observable<string> {
    return from(import('@codetrix-studio/capacitor-google-auth')).pipe(
      switchMap(({ GoogleAuth }) => GoogleAuth.signIn()),
      map((user) => user.authentication.accessToken),
    );
  }

  private webToken(): Observable<string> {
    if (!googleOAuthEnv.clientId) {
      return new Observable<string>((s) =>
        s.error(new Error('Google sign-in is not configured.')),
      );
    }
    return from(this.loadGis()).pipe(switchMap(() => this.requestToken()));
  }

  private requestToken(): Observable<string> {
    return new Observable<string>((subscriber) => {
      const gis = window.google;
      if (!gis) {
        subscriber.error(new Error('Google sign-in is unavailable. Please try again.'));
        return;
      }
      const client = gis.accounts.oauth2.initTokenClient({
        client_id: googleOAuthEnv.clientId,
        scope: SCOPES,
        callback: (response) => {
          if (response.access_token) {
            subscriber.next(response.access_token);
            subscriber.complete();
            return;
          }
          subscriber.error(
            new Error(
              response.error_description ??
                response.error ??
                'Google sign-in failed.',
            ),
          );
        },
        // Fires for a closed popup, a blocked popup, or a network failure — cases the
        // success callback never sees, so without this the caller hangs on `busy`.
        error_callback: (error) =>
          subscriber.error(
            new Error(error?.message ?? 'Google sign-in was cancelled.'),
          ),
      });
      client.requestAccessToken();
    });
  }

  /** Injects the GIS script once; resolves immediately if it is already there. */
  private loadGis(): Promise<void> {
    if (this.gisReady) return this.gisReady;
    this.gisReady = new Promise<void>((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('Google sign-in is unavailable during server rendering.'));
        return;
      }
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      const fail = (): void =>
        reject(new Error('Could not reach Google. Check your connection and try again.'));

      const existing = document.getElementById(GIS_SCRIPT_ID);
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', fail);
        return;
      }
      const script = document.createElement('script');
      script.id = GIS_SCRIPT_ID;
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', () => resolve());
      script.addEventListener('error', fail);
      document.head.appendChild(script);
    });
    return this.gisReady;
  }
}
