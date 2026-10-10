# Ask for push permission after sign-in; rotate the registration on sign-out

**Status:** Accepted
**Area:** [mobile-app](../../area/mobile-app.md)

## Context

The backend sends pushes through FCM and only needs the device token, which it reads from the
`X-FCM-Token` header. Firebase issues that token asynchronously. On Android 13+ the system shows the
`POST_NOTIFICATIONS` dialog only once: after a denial, the user has to go to system Settings to undo it.
The first version (PR #17) sent the token only on sign-in and used `Device.getId()` as `X-Device-Id`.

## Decision

- **Prompt after sign-in, not at cold start.** `apps/web/src/app/capacitor/native.ts` calls `init()` silently at startup, so a
  restored session gets a token only if permission was already granted. `AuthService` calls
  `init({ prompt: true })` once a sign-in succeeds. `init` can run again until registration succeeds.
- **The headers go on authenticated requests too,** not only on `sign_in`/`sign_up`/`google_login`/
  `confirm_invitation`. The prompt appears after the sign-in request has already gone out, so a new
  user's first token reaches the backend on the next authenticated call. A mid-session token rotation
  is reported the same way. Public endpoints are skipped.
- **Our own registration id.** `X-Device-Id` is a `crypto.randomUUID()` made per registration, not
  `Device.getId()`.
- **Rotate on sign-out, not on sign-in.** `rotate()` calls `unregister()`, which deletes the token at
  Firebase, then registers again with a fresh id.

## Alternatives rejected

- **Prompt at app start.** It uses up the one-time dialog before the user has a reason to say yes.
- **Headers on session calls only.** A new user's token would not arrive until their next sign-in, and
  rotations would fail silently.
- **`Device.getId()` as the key.** It is fixed for the life of the install, so it cannot key a
  per-session registration.
- **Rotate at sign-in.** The headers must already be on the sign-in request. Rotating then means
  either blocking login until Firebase answers, or sending the old token.

## Consequences

- The previous user cannot be reached on the device once they sign out.
- The backend must treat both headers as optional, upsert on the registration id, and bind the token
  from `sign_up` to the user that call creates. These are backend notes in PR #19; whether they are
  done is not visible from the frontend.

## Evidence

- `apps/web/src/app/core/push-notifications.ts` (`init`, `rotate` doc comments)
- `apps/web/src/app/core/interceptors/push-token-interceptor.ts`
- `apps/web/src/app/capacitor/native.ts`, `apps/web/src/app/core/auth/auth.service.ts` (`push.rotate()`,
  `push.init({ prompt: true })`)
- Commits `7f2cc9e` (PR #17), `07ce369` feat(push): add Firebase config, prompt after sign-in, and rotate
  on sign-out (PR #19), `2ac820e` (taps and foreground pushes), `8880ee8` (high-importance channel)
