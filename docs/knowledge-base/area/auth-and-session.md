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
- **Sign-up** returns no token; the account is activated from the emailed link, which lands on `/confirm_invitation` and exchanges the one-time token for a JWT (`AuthService.confirmInvitation`).
- **Primary role** = first match in `ROLES` order (most privileged first); `allRoles` keeps every held role (`toSessionUser` in `auth.service.ts`).
- **Restore on load** (`app.config.ts` initializer → `restoreSession`): an expired `exp` clears locally; otherwise a cached user is restored optimistically and validated in the background, holding `StartupGate` (`apps/web/src/app/core/startup-gate.ts`). Without a cached user, bootstrap waits up to 8 s via `Promise.race`.
- **Token attach**: `authInterceptor` adds `Authorization: Bearer` and `withCredentials` only to URLs under `API_CONFIG.baseUrl` (`apps/web/src/app/core/interceptors/auth-interceptor.ts`). Any 401 from our API, except the four credential endpoints, calls `UNAUTHORIZED_HANDLER` → `session.clear()` (`apps/web/src/app/core/interceptors/error-interceptor.ts`).
- **SSR**: there is no token on the server. Every guard returns `true` when `window` is undefined; console and account routes are `RenderMode.Client` (`apps/web/src/app/app.routes.server.ts`).
- **Sign-out**: best-effort `DELETE /api/user/sign_out`, always clears, and rotates the push registration.

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
- **`resetPassword` has no `SUPPRESS_ERROR_TOAST`**, so a failure shows both a toast and the inline error (`apps/web/src/app/services/auth-api.ts`).
- **Stale layering comments**: `auth.service.ts`, `provide-auth.ts` and `tokens.ts` speak of separate `@hostelhive/auth` / `data-access` libraries; everything now lives in `apps/web/src/app/core/` and `lib/src/data-access/index.ts` is an empty stub.
- **`docs/HostelHive-Frontend-Build-Plan.md` (Q-AUTH)** plans memory token + httpOnly refresh cookie + 401-refresh-retry. None of that exists (the plan now marks it *Superseded*); see the cookie decision below. A 401 silently signs the user out (RISKS R15).
- `ConfirmInvitation` runs its one-time POST in `afterNextRender`; `lib/src/ui/lib/dialog-focus/dialog-focus.ts` documents that hook silently never firing in some zoneless renders. Check here first if the link "hangs on verifying".

## Decisions
- [Only a 401 ends a session](../decisions/auth-and-session/only-a-401-ends-a-session.md)
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
