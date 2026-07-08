import { Injectable } from '@angular/core';
import { from, map, Observable } from 'rxjs';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

/**
 * Wraps @codetrix-studio/capacitor-google-auth: native sign-in on Android/iOS,
 * GIS popup fallback on web. Initialized in app.config.ts via GoogleAuth.initialize().
 * The access_token is piped to POST /api/user/google_login by AuthService.googleLogin().
 */
@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  getAccessToken(): Observable<string> {
    return from(GoogleAuth.signIn()).pipe(
      map((user) => user.authentication.accessToken),
    );
  }
}
