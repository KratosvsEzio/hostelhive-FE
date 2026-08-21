import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CurrentUser, SignUpResponse } from '@hostelhive/data-access';
import { AuthApi } from '@services';
import { PushNotificationsService } from '@core/push-notifications';
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
import { isJwtExpired } from './jwt';
import { ROLES, Role } from './roles';
import { flattenPermissions } from './permissions';
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
  private readonly push = inject(PushNotificationsService);
  private readonly router = inject(Router);

  /** Email/password sign-in → JWT → navigate immediately; session hydrates in background. */
  signIn(email: string, password: string): Observable<void> {
    return this.api
      .signIn({ email, password })
      .pipe(
        tap((token) => this.hydrateInBackground(token)),
        map(() => void 0),
      );
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

  /** Google OAuth: exchange the client-side access token → navigate immediately. */
  googleLogin(accessToken: string): Observable<void> {
    return this.api
      .googleLogin({ access_token: accessToken })
      .pipe(
        tap((token) => this.hydrateInBackground(token)),
        map(() => void 0),
      );
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
      tap(() => {
        this.session.clear();
        // Kill this device's push registration and mint a fresh one for whoever signs
        // in next: `rotate()` deletes the token at Firebase, so nothing addressed to
        // the departing user can reach this device, and generates a new registration
        // id so the next session is stored under its own key. Fire-and-forget —
        // sign-out must not wait on Firebase.
        void this.push.rotate();
      }),
      map(() => void 0),
    );
  }

  /**
   * Validate the persisted session on app start. If a JWT was persisted from a previous visit,
   * verify it against `GET /api/users/current` and log the user back in when it's valid.
   *
   * Only a **401** ends the session. Any other failure — offline, DNS, 5xx, CORS, a
   * mixed-content block — tells us nothing about whether the token is still good, so the
   * session is kept and the cached user stands. Clearing on those was what signed mobile
   * users out: the back button calls `App.exitApp()`, so every reopen is a cold start, and
   * one unreachable request was enough to delete a perfectly valid 30-day token.
   *
   * A cached user is restored first for an instant optimistic render; this background check
   * then confirms or revokes it. Never throws (safe to await in an app initializer) and is
   * time-capped so a slow or unreachable API can't hang bootstrap.
   */
  restoreSession(): Promise<void> {
    const token = this.session.readPersistedToken();
    if (!token) return Promise.resolve();

    // The token carries its own deadline, so a dead one can be retired without asking the
    // server — the request would only come back 401. This is the single case where the app
    // may end a session on its own; `isJwtExpired` returns false for anything it cannot read
    // with certainty (opaque token, no `exp`, device clock ahead of `iat`) so an unreadable
    // token still goes to the server rather than being thrown away.
    if (isJwtExpired(token)) {
      this.session.clear();
      return Promise.resolve();
    }

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
      .catch((err: unknown) => {
        // Unverified is not the same as invalid. Keep the session on anything that is not an
        // outright rejection, so a returning user stays signed in until they say otherwise.
        if (!isUnauthorized(err)) return;
        // The server rejected the token → drop the session (which also deletes the
        // `hh_auth_token` cookie) and send them to the landing page.
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
   * Ask for notification permission now that the user is signed in.
   *
   * Deliberately here rather than at app start: on Android 13+ the system shows the
   * POST_NOTIFICATIONS dialog only once, so asking at cold start spends that single
   * chance before the user has seen anything worth being notified about. A no-op if
   * permission was already granted or the app is not running natively.
   *
   * Fire-and-forget — sign-in must never wait on a permission dialog.
   */
  private promptForPush(): void {
    void this.push.init({ prompt: true });
  }

  /**
   * Sets the token immediately and fetches the user profile in the background.
   * The caller's observable completes as soon as the sign-in POST returns 200 —
   * the modal closes instantly while the session hydrates.
   */
  private hydrateInBackground(token: string): void {
    this.session.setAccessToken(token);
    this.promptForPush();
    this.api.currentUser().pipe(
      map(toSessionUser),
      tap((user) => this.session.setSession(user, token)),
      catchError((err: unknown) => {
        // Same rule as restoreSession: the token was just minted by a successful sign-in, so
        // a network blip here says nothing about it. Only an outright rejection ends the
        // session — otherwise the user is dropped to signed-out on the page they just landed on.
        if (isUnauthorized(err)) this.session.clear();
        return of(null);
      }),
    ).subscribe();
  }

  /**
   * Stores the token (so the interceptor can authorize the follow-up request),
   * fetches the current user, and writes the full session. If the user fetch
   * fails, the dangling token is cleared so we never sit in a half-authed state.
   */
  private establishSession(token: string): Observable<SessionUser> {
    this.session.setAccessToken(token);
    this.promptForPush();
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

/**
 * True only when the server actually rejected the credentials.
 *
 * Reads `.status` structurally so it holds for both the normalised `ApiError` the error
 * interceptor produces and a raw `HttpErrorResponse` if one ever reaches here. A network
 * failure surfaces as status 0, which is deliberately NOT a rejection.
 */
function isUnauthorized(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { status?: unknown }).status === 401
  );
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
    permissions: flattenPermissions(u.permissions),
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
