# Only a 401 ends a session

**Status:** Accepted
**Area:** [auth-and-session](../../area/auth-and-session.md)

## Context
On startup `AuthService.restoreSession()` validates the persisted JWT with `GET /api/users/current`, and after sign-in `hydrateInBackground()` makes the same call. The first version cleared the session on any failure of that call. On the Capacitor app the back button exits the app, so every reopen is a cold start, and one unreachable request (offline, DNS, 5xx, CORS, mixed content) deleted a valid 30-day token.

## Decision
Only an HTTP 401 from that validation clears the session. Every other failure keeps the token and the cached user. `isUnauthorized()` reads `.status` structurally so it works on both `ApiError` and a raw `HttpErrorResponse`; status 0 (network) is deliberately not a rejection. The one case the client ends a session by itself is a JWT whose own `exp` has passed (`isJwtExpired`), and that check returns false for anything it cannot read with certainty.

## Alternatives rejected
- **Clear on any failure** ("a token we can't verify must not keep a session"): the original behaviour, removed because it signed mobile users out on every flaky cold start.
- **Time out the validation with RxJS `timeout()`**: cancels the HTTP request on teardown; `Promise.race` caps the wait while letting the request finish and still update the session.

## Consequences
- A user whose token was revoked server-side stays "signed in" offline until the first authed request returns 401; the global `UNAUTHORIZED_HANDLER` then clears the session with no message (`docs/RISKS.md` R15).
- Code that adds a new validation path must apply the same rule, or reintroduce the logout bug.

## Evidence
- `apps/web/src/app/core/auth/auth.service.ts` (`restoreSession`, `hydrateInBackground`, `isUnauthorized`)
- `apps/web/src/app/core/auth/jwt.ts`
- c079248 feat(brand,mobile): swap the logo raster for SVGs and add a native photo picker (the diff to `auth.service.ts` that replaced clear-on-any-failure)
- a45cd84 feat(auth): retire an expired JWT without a round trip; refresh app icons
