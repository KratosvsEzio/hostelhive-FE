# The JWT lives in a JS-readable first-party cookie, with no refresh token

**Status:** Accepted
**Area:** [auth-and-session](../../area/auth-and-session.md)

## Context
`docs/HostelHive-Frontend-Build-Plan.md` (question Q-AUTH and the stack table) planned an access token in memory, a refresh token in an httpOnly cookie, and an interceptor doing 401 → refresh → retry. The backend never shipped that: `sign_in`, `google_login` and `confirm_invitation` return a single JWT, and there is no refresh endpoint.

## Decision
`SessionStore` persists the JWT in a first-party cookie `hh_auth_token` (path `/`, 30-day max-age, `samesite=lax`, `secure` on HTTPS) that the app itself writes and reads, and attaches it as a bearer header. The cached `SessionUser` (profile, not credential) goes to localStorage under `hh.auth.user` for an instant optimistic restore. A token found under the old localStorage key `hh.auth.token` is read once and moved into the cookie.

## Alternatives rejected
- **httpOnly cookie**: only the server can set one, and the FE must read the token to build the `Authorization` header.
- **localStorage for the token**: the original builds did this; it was migrated away and is now only read for migration and then scrubbed.
- **Memory + refresh token**: no refresh endpoint exists. `authInterceptor` still sets `withCredentials: true` "for the refresh cookie", which nothing uses today.

## Consequences
- The token is readable by any script on the origin, so XSS exposes it, as it would with localStorage.
- The cookie is never sent to the API cross-origin; it only exists for the app to read.
- No silent refresh: a 401 signs the user out (`docs/RISKS.md` R15). The build plan's Q-AUTH answer does not describe the shipped code, and is marked *Superseded* there.
- The server cannot read the cookie during SSR either, because the server never seats a session (see [auth-and-session](../../area/auth-and-session.md)).

## Evidence
- `apps/web/src/app/core/auth/session-store.ts` (header comment, `persistToken`, `readPersistedToken`)
- `apps/web/src/app/core/interceptors/auth-interceptor.ts`
- `docs/HostelHive-Frontend-Build-Plan.md` (Q-AUTH row)
- 24ceaad Initial commit — HostelHive FE (cookie and legacy migration both present from the first commit)
