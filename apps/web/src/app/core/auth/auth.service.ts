import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CurrentUser, SignUpResponse } from '@hostelhive/data-access';
import { AuthApi } from '@services';
import {
  Observable,
  catchError,
  firstValueFrom,
  map,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { ROLES, Role } from './roles';
import { SessionStore, SessionUser } from './session-store';

/**
 * Orchestrates authentication: calls the API (`AuthApi`), then hydrates the
 * `SessionStore`. Lives in the auth lib — not `data-access` — so the token
 * bridge stays one-directional (auth → data-access, never the reverse).
 *
 * Because the backend's sign_in/google_login return only a JWT, we then fetch
 * `GET /api/users/current` (authorized by that token) to resolve the user + role.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  /** Email/password sign-in → JWT → fetch the user → hydrate the session. */
  signIn(email: string, password: string): Observable<SessionUser> {
    return this.api
      .signIn({ email, password })
      .pipe(switchMap((token) => this.establishSession(token)));
  }

  /**
   * Registration. The API creates the account and emails a confirmation link, and
   * returns the user + a message but NO token — so the user is **not** signed in
   * yet. They must confirm their email, then sign in. Callers should route to a
   * "check your email" state on success.
   */
  signUp(input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }): Observable<SignUpResponse> {
    return this.api.signUp({ user: input });
  }

  /** Google OAuth: exchange the client-side access token for a session. */
  googleLogin(accessToken: string): Observable<SessionUser> {
    return this.api
      .googleLogin({ access_token: accessToken })
      .pipe(switchMap((token) => this.establishSession(token)));
  }

  /**
   * Confirm an emailed invitation/registration link: exchange the one-time `token` for a JWT,
   * then hydrate the session so the user lands logged in. `establishSession` persists the JWT,
   * so the login survives a reload.
   */
  confirmInvitation(token: string): Observable<SessionUser> {
    return this.api
      .confirmInvitation(token)
      .pipe(switchMap((jwt) => this.establishSession(jwt)));
  }

  /**
   * Re-fetch the current user from the API and update the session in place.
   * Call this after an action that may change the user's roles on the backend
   * (e.g. creating a first hostel grants the `host` role).
   * Errors are propagated to the caller — use `catchError` if you want best-effort behaviour.
   */
  refreshSession(): Observable<SessionUser> {
    const token = this.session.accessToken();
    if (!token) return throwError(() => new Error('No active session'));
    return this.api.currentUser().pipe(
      map(toSessionUser),
      tap((user) => this.session.setSession(user, token)),
    );
  }

  /** Revoke the JWT server-side, then clear the local session — always, even if the call fails. */
  signOut(): Observable<void> {
    return this.api.signOut().pipe(
      catchError(() => of(null)), // best-effort revoke — we clear locally regardless
      tap(() => this.session.clear()),
      map(() => void 0),
    );
  }

  /**
   * Validate the persisted session on app start. If a JWT was persisted from a previous visit,
   * verify it against `GET /api/users/current` and log the user back in when it's valid. If the
   * token is invalid OR the call fails for any reason (401 / network / 5xx / timeout), the session
   * is dropped — which deletes the `hh_auth_token` cookie — and the user is sent to the landing
   * page. A cached user is restored first for an instant optimistic render; this background check
   * then confirms or revokes it. Never throws (safe to await in an app initializer) and is
   * time-capped so a slow or unreachable API can't hang bootstrap.
   */
  restoreSession(): Promise<void> {
    const token = this.session.readPersistedToken();
    if (!token) return Promise.resolve();
    const cachedUser = this.session.readPersistedUser();

    // Seat the persisted token into the session BEFORE the validation request fires. The auth
    // interceptor reads the bearer from the in-memory session (not localStorage) at request time,
    // so if currentUser() is subscribed first the request goes out with no Authorization header
    // (→ 401 → the session, and the stored token, get wrongly cleared on every reload). A cached
    // user is also restored here for an instant optimistic login.
    if (cachedUser) this.session.setSession(cachedUser, token);
    else this.session.setAccessToken(token);

    // Never pass through pipe(timeout()) here — RxJS timeout() cancels the HTTP
    // request via subscription teardown, which shows as (canceled) in DevTools.
    // Instead, keep the HTTP request alive and use Promise.race to cap the wait.
    const validate = firstValueFrom(this.api.currentUser())
      .then((u) => this.session.setSession(toSessionUser(u), token))
      .catch(() => {
        // Token invalid (401) or the API failed (network / 5xx) → treat the user as
        // signed out: drop the session (which also deletes the `hh_auth_token` cookie) and send
        // them to the landing page. No optimism — a token we can't verify must not keep a session.
        this.session.clear();
        void this.router.navigateByUrl('/');
      });

    if (cachedUser) {
      // Optimistic login already applied above — validate in the background, don't block bootstrap
      // (so a flaky or offline API never signs a returning user out).
      void validate;
      return Promise.resolve();
    }
    // No cached user (older token-only state): block bootstrap on the validation so route guards
    // see the restored session on a reload. Cap the wait at 8 s via Promise.race so a dead API
    // cannot hang bootstrap — but the HTTP request itself keeps running to completion.
    return Promise.race([
      validate,
      new Promise<void>((resolve) => setTimeout(resolve, 8_000)),
    ]);
  }

  /**
   * Stores the token (so the interceptor can authorize the follow-up request),
   * fetches the current user, and writes the full session. If the user fetch
   * fails, the dangling token is cleared so we never sit in a half-authed state.
   */
  private establishSession(token: string): Observable<SessionUser> {
    this.session.setAccessToken(token);
    return this.api.currentUser().pipe(
      map(toSessionUser),
      tap((user) => this.session.setSession(user, token)),
      catchError((err) => {
        this.session.clear();
        return throwError(() => err);
      }),
    );
  }
}

/** Maps the API's current-user payload onto the FE `SessionUser`. */
function toSessionUser(u: CurrentUser): SessionUser {
  const slugs = new Set(
    (u.roles ?? []).map((r) => r.slug.toLowerCase().replace(/_/g, '-')),
  );
  return {
    id: String(u.id),
    name: u.name,
    email: u.email,
    role: primaryRole(slugs, u.is_admin),
    allRoles: ROLES.filter((r) => slugs.has(r)),
    permissions: [], // CurrentUserSerializer exposes roles, not granular flags (BE follow-up)
    propertyId: null, // not exposed by /users/current yet
  };
}

/**
 * Picks the highest-privilege role from the user's roles. `ROLES` is ordered most→
 * least privileged, so the first slug that matches wins. Falls back to `admin`
 * when the API only flags `is_admin`, else the least-privileged `seeker`.
 */
function primaryRole(slugs: Set<string>, isAdmin: boolean | undefined): Role {
  for (const role of ROLES) {
    if (slugs.has(role)) return role;
  }
  return isAdmin ? 'admin' : 'seeker';
}
