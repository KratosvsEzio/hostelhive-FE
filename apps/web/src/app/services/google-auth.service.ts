import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { googleOAuthEnv } from '../google-oauth.env';

declare const google: {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (r: { access_token?: string; error?: string }) => void;
        error_callback?: (e: unknown) => void;
      }): { requestAccessToken(): void };
    };
  };
};

/**
 * Loads Google Identity Services on demand and exchanges a user consent for an
 * OAuth2 access token, which the backend accepts at POST /api/user/google_login.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private scriptReady = false;

  /** Opens the Google OAuth popup and resolves with the access_token. */
  getAccessToken(): Observable<string> {
    return new Observable<string>((observer) => {
      this.loadScript()
        .then(() => {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: googleOAuthEnv.clientId,
            scope: 'email profile',
            callback: (res) => {
              if (res.access_token) {
                observer.next(res.access_token);
                observer.complete();
              } else {
                observer.error(new Error(res.error ?? 'Google sign-in cancelled'));
              }
            },
            error_callback: (err) => observer.error(err),
          });
          client.requestAccessToken();
        })
        .catch((err) => observer.error(err));
    });
  }

  private loadScript(): Promise<void> {
    if (this.scriptReady) return Promise.resolve();
    if (document.getElementById('gsi-client')) {
      this.scriptReady = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.id = 'gsi-client';
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => { this.scriptReady = true; resolve(); };
      s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(s);
    });
  }
}
