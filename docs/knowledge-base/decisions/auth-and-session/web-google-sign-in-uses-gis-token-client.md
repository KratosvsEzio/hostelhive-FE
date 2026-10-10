# Web Google sign-in uses the GIS token client

**Status:** Accepted
**Area:** [auth-and-session](../../area/auth-and-session.md)

## Context
Google sign-in on web failed with a 500 from `accounts.google.com/o/oauth2/iframerpc`. The cause was `@codetrix-studio/capacitor-google-auth`'s web implementation, which loads the retired `gapi.auth2` platform library. Its newest release (3.4.0-rc.4) still does, so upgrading was not an option.

## Decision
- Native (Android/iOS) keeps the Capacitor plugin (Play Services, unaffected). Web never calls its `initialize()`.
- Web uses Google Identity Services `initTokenClient`, which returns an OAuth access token. `POST /api/user/google_login` already accepts that, so no backend change was needed.
- GIS is preloaded in an app initializer, because `requestAccessToken()` opens a popup and must run inside the click. Fetching the script at click time gets the popup blocked on first use.
- An `error_callback` is wired: GIS never calls the success callback for a closed or blocked popup.
- On the Register tab the Google button sits behind the terms checkbox, because `google_login` creates the account on first use.

## Alternatives rejected
- **`google.accounts.id` (ID token)**: stronger (signature verified locally), but the backend does not accept `id_token` yet. Android already fetches one and discards it.
- **Keep the plugin on web**: broken, and no upgrade fixes it.

## Consequences
- Two code paths in `GoogleAuthService`; the native one is lazy-imported to stay off the web bundle.
- A full round trip through Google's consent screen was not exercised when this shipped (commit body).

## Evidence
- `apps/web/src/app/services/google-auth.service.ts`
- `apps/web/src/app/app.config.ts` (Google Auth initializer)
- `apps/web/src/app/features/auth/lead-wall/lead-wall.ts` (`googleBlocked`, `googleSignIn`)
- 9e39e57 fix(auth): move web Google sign-in to GIS and gate it behind terms consent (PR #21)
