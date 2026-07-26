import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  CurrentUser,
  CurrentUserResponse,
  GoogleLoginRequest,
  MessageResponse,
  SignInRequest,
  SignUpRequest,
  SignUpResponse,
  TokenResponse,
} from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';

/** Auth forms render their failures inline, so their requests opt out of the global error toast. */
function inlineErrors(): HttpContext {
  return new HttpContext().set(SUPPRESS_ERROR_TOAST, true);
}

/**
 * Auth endpoints (Core ▸ User) + the current-user lookup. **Pure HTTP** — no
 * session coupling, so `data-access` stays independent of `@hostelhive/auth`;
 * `AuthService` (auth lib) wires the results into `SessionStore`.
 *
 * Backend contract (api/jwt/sessions_controller): `sign_in` & `google_login`
 * return only `{ token }`; `sign_up` returns `{ user, message }` and no token
 * (the account is activated via an emailed confirmation link); `sign_out` is a
 * DELETE that revokes the JWT server-side. The bearer token for the authed calls
 * is attached by `authInterceptor` from the session.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly api = inject(ApiClient);

  /** POST /api/user/sign_in → JWT. */
  signIn(body: SignInRequest): Observable<string> {
    return this.api
      .post<TokenResponse>('/api/user/sign_in', body, inlineErrors())
      .pipe(map(requireToken));
  }

  /** POST /api/user/sign_up → created user + confirmation message (no token). */
  signUp(body: SignUpRequest): Observable<SignUpResponse> {
    return this.api.post<SignUpResponse>('/api/user/sign_up', body, inlineErrors());
  }

  /** POST /api/user/google_login → JWT (exchanges a Google OAuth access token). */
  googleLogin(body: GoogleLoginRequest): Observable<string> {
    return this.api
      .post<TokenResponse>('/api/user/google_login', body, inlineErrors())
      .pipe(map(requireToken));
  }

  /**
   * POST /api/user/confirm_invitation → JWT. Activates the account from the emailed
   * confirmation link (which carries a one-time `token`) and signs the user in.
   */
  confirmInvitation(token: string): Observable<string> {
    return this.api
      .post<TokenResponse>('/api/user/confirm_invitation', { token }, inlineErrors())
      .pipe(map(requireToken));
  }

  /** DELETE /api/user/sign_out → revokes the JWT server-side. */
  signOut(): Observable<MessageResponse> {
    return this.api.delete<MessageResponse>('/api/user/sign_out');
  }

  /** PATCH /api/users/change_password → updates the authenticated user's password. */
  changePassword(body: { current_password: string; new_password: string }): Observable<unknown> {
    return this.api.patch<unknown>('/api/users/change_password', body);
  }

  /** GET /api/users/current → the authenticated user (with roles). */
  currentUser(): Observable<CurrentUser> {
    return this.api
      .get<CurrentUserResponse>('/api/users/current')
      .pipe(map((r) => r.user));
  }
}

/** The token is the whole point of sign_in/google_login — fail loudly if it's absent. */
function requireToken(r: TokenResponse): string {
  if (!r.token) throw new Error('Auth response did not include a token.');
  return r.token;
}
