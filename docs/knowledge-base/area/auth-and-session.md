# Auth and session

Who the visitor is, what they may do, and how that survives a reload. Covers the session store, guards, roles and permission flags, the sign-in / sign-up / Google / invitation / password-reset screens, and how the bearer token reaches the API. HTTP plumbing itself (interceptor chain, error shape) is in [api-and-data](./api-and-data.md).

## Where it lives
- `apps/web/src/app/core/auth/session-store.ts` — `SessionStore`: signals for user, token, roles, permissions; cookie + localStorage persistence; `hasRole`, `hasPermission`.
- `apps/web/src/app/core/auth/auth.service.ts` — `AuthService`: sign-in, Google, confirm invitation, `refreshSession`, `signOut`, `restoreSession`; maps `/api/users/current` to `SessionUser`.
- `apps/web/src/app/core/auth/roles.ts` — the eight `Role`s, `STAFF_ROLES`, `HOST_ROLES`.
- `apps/web/src/app/core/auth/permissions.ts` — flattens the API permission tree into `group:Subject:action` flags.
- `apps/web/src/app/core/auth/guards.ts` — `authGuard`, `roleGuard(...)`, `permissionGuard(flag)`.
- `apps/web/src/app/core/auth/has-permission.directive.ts` — `*hhHasPermission`.
- `apps/web/src/app/core/auth/guarded-url.ts` — `isGuardedUrl`, `safeInternalUrl` (open-redirect guard for `returnUrl`).
- `apps/web/src/app/core/auth/jwt.ts` — reads `exp`/`iat` without verifying.
- `apps/web/src/app/core/auth/provide-auth.ts` — binds `ACCESS_TOKEN` and `UNAUTHORIZED_HANDLER` (declared in `apps/web/src/app/core/tokens.ts`).
- `apps/web/src/app/services/auth-api.ts` — `AuthApi`, pure HTTP for `/api/user/*` and `/api/users/current`.
- `apps/web/src/app/services/google-auth.service.ts` — GIS token client on web, Capacitor plugin on native.
- `apps/web/src/app/features/auth/` — `lead-wall/` (Register / Log in), `forgot-password/`, `reset-password/`, `confirm-invitation/`; routes in `apps/web/src/app/app.routes.ts`.

## How it works
- **Sign-in**: `AuthApi.signIn` returns only a JWT; `AuthService.hydrateInBackground` seats it in memory, then `GET /api/users/current` resolves roles and permissions and `setSession` persists both. The Lead Wall navigates as soon as the token arrives, before roles are known (`apps/web/src/app/features/auth/lead-wall/lead-wall.ts`).
- **Sign-up** returns no token; the account is activated from the emailed link, which lands on `/confirm_invitation` and exchanges the one-time token for a JWT (`AuthService.confirmInvitation`). If someone is already signed in, the page asks first and Continue signs them out before the exchange (`signOutThenConfirmInvitation`).
- **Primary role** = first match in `ROLES` order (most privileged first); `allRoles` keeps every held role (`toSessionUser` in `auth.service.ts`).
- **Restore on load** (`app.config.ts` initializer → `restoreSession`): an expired token (`exp`, or the backend's own `expiry` claim) clears locally; otherwise a cached user is restored optimistically and validated in the background, holding `StartupGate` (`apps/web/src/app/core/startup-gate.ts`). Without a cached user, bootstrap waits up to 8 s via `Promise.race`.
- **Token attach**: `authInterceptor` adds `Authorization: Bearer` and `withCredentials` only to URLs under `API_CONFIG.baseUrl` (`apps/web/src/app/core/interceptors/auth-interceptor.ts`). Any 401 from our API, except the four credential endpoints, calls `UNAUTHORIZED_HANDLER` with the bearer the request carried, and `provideAuth()` clears the session only if that is still the signed-in token (`apps/web/src/app/core/interceptors/error-interceptor.ts`, `apps/web/src/app/core/auth/provide-auth.ts`).
- **SSR**: there is no token on the server. Every guard returns `true` when `window` is undefined; console and account routes are `RenderMode.Client` (`apps/web/src/app/app.routes.server.ts`).
- **Sign-out**: best-effort `DELETE /api/user/sign_out`, always clears, and rotates the push registration.
- **Password reset**: the emailed link lands on `/reset_password?token=…`, which sends `PATCH /api/user/reset_password` without the global toast.
  - `classifyResetFailure` (`apps/web/src/app/features/auth/reset-password/reset-failure.ts`) sorts the reply. A 404 with a backend message means the link is used or invalid. A 403 means either an expired link or an admin/moderator account; the account panel offers Contact us and Back to login, but no new link.
  - Those three cases replace the form with a panel and move focus to its heading. A 422, a network failure or anything else shows inline.
  - Per-attempt state is a `linkedSignal` on the token, so a new link starts over and a late reply for the old one is ignored (`reset-password.ts`).
- **Confirmation link failures**: `classifyConfirmFailure` (`apps/web/src/app/features/auth/confirm-invitation/confirm-failure.ts`) sorts the `confirm_invitation` reply into four kinds, each with its own card (`ERROR_COPY` in `confirm-invitation.ts`):
  - a 404 with a backend message → "This link no longer works", with a neutral badge and "just log in" copy;
  - a 403 whose text says "expired" as a whole word → "This link has expired", which also offers Contact us. There is no resend endpoint, and signing up again fails because the email is taken;
  - no connection → "Can't reach the server";
  - anything else → the generic "Confirmation failed".
  
  `AccountConfirmedNotSignedIn` is checked before classifying. Focus moves to the error heading after a server or network failure, but not for a missing token.
- **Forgot password**: `classifyForgotFailure` (`apps/web/src/app/features/auth/forgot-password/forgot-failure.ts`) sorts the `forgot_password` reply.
  - A 201, or a 404 with backend text, shows the same neutral sent screen ("If an account exists for {{email}}…").
  - A 422 (a link is already out) shows the sent screen with an "already sent" notice.
  - A 429 and a network failure each get their own message.
  - A 500 (today's unknown-email crash) and anything else stay on the form with "couldn't send, check the address".
  - The sent screen and Resend use `sentEmail`, the address captured when Send started, never the live field.
- **Sign-in, sign-up, Google and verify errors** (the lead wall): `classifyAuthFailure(err, action)` (`apps/web/src/app/features/auth/lead-wall/auth-failure.ts`).
  - **Sign-in is neutral:** a 401 and a 404 that carries its own text both show "Email or password is incorrect.". The backend still answers an unknown email with 404 "User not found", so the network tab differs; the BE developer has been asked for a 401.
  - Sign-up keeps "already exists". A 403 (the nested no-roles reply) shows "can't sign in right now". A Google popup error with no status shows "didn't finish".
- These classifiers read errors through `apps/web/src/app/core/errors/api-error-text.ts` (`errorStatus`, `serverText`, `isBareNotFound`), never through `err.message`.

## Reuse, don't rebuild
- Gate routes with `roleGuard(...HOST_ROLES)` / `permissionGuard('host:Room:index')`, buttons with `*hhHasPermission` — never compare `session.role()` by hand (it is only the primary role).
- After a backend action that changes roles (first hostel), call `AuthService.refreshSession()`.
- Sanitize any redirect target with `safeInternalUrl`; use `isGuardedUrl(router.config, url)` before sending a guest back somewhere.
- Auth forms render errors inline; pass `SUPPRESS_ERROR_TOAST` as `AuthApi` does.

## Traps
- **Empty permissions = allow all.** `SessionStore.hasPermission` fails open when the payload has no flags; only a non-empty set denies.
- **Flag format.** Real flags are `group:Subject:action` (`apps/web/src/app/features/host/host.routes.ts`); the `payments.refund` examples in `roles.ts`, `guards.ts` and `has-permission.directive.ts` are stale.
- **Post-login destination reads unhydrated roles.** `LeadWall.destination()` runs before `/api/users/current` returns, so with no `returnUrl` staff can land on `/` instead of their console.
- **`propertyId` is always `null`** — `/users/current` does not expose it (`auth.service.ts`).
- **`jwt.ts` reads `exp`**, but `docs/api/hostelhive-api.md` documents the payload as `{…, jti, expiry}`. If the backend really sends `expiry`, local expiry never triggers and the server decides (safe, just a wasted request).
- **Only the English text tells the 403s apart**: the two reset 403s, and the expired confirmation 403. If the backend rewords them, users get the generic message. The backend has been asked for machine codes. On both pages a bare Rails `"Not Found"` 404 is classed `unknown`, not a used link (`reset-failure.ts`, `confirm-failure.ts`).
- **The "no roles" 403 from `issue_token` reaches the page with no text**: the backend nests the `errors` array and `extractServerMessages` drops nested arrays. On the confirmation page it arrives after the account is already activated and the link spent, but it shows the generic card.
- **The forgot-password page is neutral, but the API is not.** Today the backend answers an unknown email with a 500 (`sessions_controller.rb:87`, confirmed live 2026-10-11) and a known one with 201 or 422. The "already sent" notice therefore only ever appears for a real account. Sign-in's 404 "User not found" (the page now shows the neutral message, #151) and sign-up's "already registered" reveal accounts at the API too.
- **Stale layering comments**: `auth.service.ts`, `provide-auth.ts` and `tokens.ts` speak of separate `@hostelhive/auth` / `data-access` libraries; everything now lives in `apps/web/src/app/core/` and `lib/src/data-access/index.ts` is an empty stub.
- **`docs/HostelHive-Frontend-Build-Plan.md` (Q-AUTH)** plans memory token + httpOnly refresh cookie + 401-refresh-retry. None of that exists (the plan now marks it *Superseded*); see the cookie decision below. A 401 silently signs the user out (RISKS R15).
- `ConfirmInvitation` runs its one-time POST in `afterNextRender`; `lib/src/ui/lib/dialog-focus/dialog-focus.ts` documents that hook silently never firing in some zoneless renders. Check here first if the link "hangs on verifying".

## Decisions
- [Only a 401 ends a session](../decisions/auth-and-session/only-a-401-ends-a-session.md)
- [A confirmation link asks before it replaces a signed-in session](../decisions/auth-and-session/confirmation-link-asks-before-replacing-a-session.md)
- [An unrecognised reset failure fails closed](../decisions/auth-and-session/unrecognised-reset-failure-fails-closed.md)
- [Forgot password answers an unknown email neutrally](../decisions/auth-and-session/forgot-password-answers-unknown-email-neutrally.md)
- [The JWT lives in a JS-readable first-party cookie, with no refresh token](../decisions/auth-and-session/jwt-in-readable-first-party-cookie.md)
- [Permission children are the grant, and an empty set is not gated](../decisions/auth-and-session/permission-children-are-the-grant.md)
- [Web Google sign-in uses the GIS token client](../decisions/auth-and-session/web-google-sign-in-uses-gis-token-client.md)

## See also
- [api-and-data](./api-and-data.md) — interceptors, `ApiError`, toasts
- [app-shell-and-routing](./app-shell-and-routing.md) — route table, startup gate
- [ssr-seo-and-prerender](./ssr-seo-and-prerender.md) — render modes
- [mobile-app](./mobile-app.md) — native Google sign-in, push rotation
- [admin-and-moderation](./admin-and-moderation.md), [host-console](./host-console.md) — where permission guards are applied
- `docs/api/hostelhive-api.md` (Core ▸ User), `docs/RISKS.md` (R15)
