# Only a 401 ends a session

**Status:** Accepted
**Area:** [auth-and-session](../../area/auth-and-session.md)

## Context
On startup `AuthService.restoreSession()` validates the persisted JWT with `GET /api/users/current`, and after sign-in `hydrateInBackground()` makes the same call. The first version cleared the session on any failure of that call. On the Capacitor app the back button exits the app, so every reopen is a cold start, and one unreachable request (offline, DNS, 5xx, CORS, mixed content) deleted a valid 30-day token.

## Decision
Only an HTTP 401 from that validation clears the session. Every other failure keeps the token and the cached user. `isUnauthorized()` reads `.status` structurally so it works on both `ApiError` and a raw `HttpErrorResponse`; status 0 (network) is deliberately not a rejection. The one case the client ends a session by itself is a JWT whose own expiry has passed (`isJwtExpired`), and that check returns false for anything it cannot read with certainty. `jwtExpiresAt` reads the standard `exp` first and then the backend's own `expiry` claim — a number as seconds, a string only with an explicit zone (` UTC`, ` GMT`, `Z`, `+05:00`, `+0500`); a zoneless or unreadable value is unknown, never expired. The backend issued only `expiry` until BE PR #39, which added a numeric `exp` beside it (`be-hostelhive` `app/controllers/concerns/jwt_authentication/issuer.rb`); the `expiry` fallback still covers tokens issued before that. The payload has no `iat`, so the clock-sanity check cannot run for these tokens.

**Only the rejected session ends.** `errorInterceptor` passes the bearer the 401'd request was sent with to `UNAUTHORIZED_HANDLER(rejectedToken)`, and `provideAuth()` clears only when that is still the signed-in token. A late 401 for a token that has since been replaced (another account seated meanwhile) leaves the new session alone; a request sent with no token ends nothing. `restoreSession`'s late writes follow the same rule: its success write and its 401 clear-and-go-home act only on the token they validated (the 401 branch still clears when the handler already emptied the session).

The account-confirmation link (`establishSession`) follows the same rule, with one addition: it seats the new token over whatever session was there, so on any non-401 failure it **puts the previous token back** (only if the session still holds the new one). The persisted cookie and cached user were never replaced, so a signed-in user is fully restored and a signed-out visitor returns to tokenless. On native it also rotates push when a previous session is restored, because the backend re-linked the device to the new account when it issued the token.

## Alternatives rejected
- **Clear on any failure** ("a token we can't verify must not keep a session"): the original behaviour, removed because it signed mobile users out on every flaky cold start.
- **Time out the validation with RxJS `timeout()`**: cancels the HTTP request on teardown; `Promise.race` caps the wait while letting the request finish and still update the session.
- **Let any 401 clear whoever is signed in** (the handler before Trello #125): a late 401 for a replaced token signed out the account that replaced it — reproduced through the real interceptors when a confirmation link switched accounts while the previous account's startup validation was still pending.

## Consequences
- A user whose token was revoked server-side stays "signed in" offline until the first authed request returns 401; the global `UNAUTHORIZED_HANDLER` then clears the session with no message (`docs/RISKS.md` R15) — provided that request carried the token still signed in.
- A stale overnight session (the 30-day cookie outlives the 8 h server token) is now retired at startup without a server call, instead of validating, getting a 401 and sending the visitor home.
- Code that adds a new validation path must apply the same rule, or reintroduce the logout bug.
- A confirmation that fails after the one-time token was exchanged reaches the page as `AccountConfirmedNotSignedIn`: the account is confirmed and the link spent either way, so the page says so and offers log in (or home, if the previous account was put back) rather than "Confirmation failed".

## Evidence
- `apps/web/src/app/core/auth/auth.service.ts` (`restoreSession`, `hydrateInBackground`, `establishSession`, `AccountConfirmedNotSignedIn`); `apps/web/src/app/features/auth/confirm-invitation/confirm-invitation.ts`
- `apps/web/src/app/core/errors/is-unauthorized.ts` (`isUnauthorized`, shared with `apps/web/src/app/util/favorites-store.ts` since Trello #116)
- `apps/web/src/app/core/auth/auth.service.spec.ts` pins the rule at all three call sites — `restoreSession`, `signIn` → `hydrateInBackground`, and `confirmInvitation` → `establishSession` (Trello #124, PR #100): a 401 clears the session; status 0 and 500 keep it, or put the previous one back
- `apps/web/src/app/core/auth/jwt.ts` (`jwtExpiresAt` reads `exp`, then `expiry`) and `jwt.spec.ts`
- `apps/web/src/app/core/interceptors/error-interceptor.ts`, `apps/web/src/app/core/tokens.ts` (`UNAUTHORIZED_HANDLER(rejectedToken)`), `apps/web/src/app/core/auth/provide-auth.ts`; pinned by `provide-auth.spec.ts`, `error-interceptor.spec.ts` and the real-interceptor `restoreSession` cases in `auth.service.spec.ts` (Trello #125, PR #106)
- c079248 feat(brand,mobile): swap the logo raster for SVGs and add a native photo picker (the diff to `auth.service.ts` that replaced clear-on-any-failure)
- a45cd84 feat(auth): retire an expired JWT without a round trip; refresh app icons
