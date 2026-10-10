# API failures toast globally, with a per-request opt-out

**Status:** Accepted
**Area:** [api-and-data](../../area/api-and-data.md)

## Context
The B8 error-handling audit (`docs/RISKS.md`) found about 20 mutation sites that failed silently (R1), an interceptor that only surfaced 5xx/network failures with two fixed strings (R9), a risk of echoing Angular's URL-bearing error message to users (R8), and identical toasts stacking when a dashboard fanned out against a down API (R16).

## Decision
- `errorInterceptor` normalises every failure to `ApiError` and calls the app's `API_ERROR_NOTIFIER` for 5xx, network (status 0) and every 4xx except 401. 401 goes only to `UNAUTHORIZED_HANDLER`.
- The error is always re-thrown, so a screen can also render it inline. The toast is an additive safety net, not the error handling.
- A request opts out with the `SUPPRESS_ERROR_TOAST` `HttpContext` token when its screen already shows the error inline (the auth forms, `image-upload.service.ts`).
- Toast copy comes from `toToastCopy`: titles are ours, never the server's; only 4xx envelope messages are echoed (max 200 chars); 5xx and network get generic copy so a Rails debug page or internal URL can't leak. GET/HEAD/OPTIONS failures say "Couldn't load", not "Couldn't save changes".
- 4xx toasts are pinned until dismissed; 5xx/network auto-dismiss after 6 s. Identical visible toasts coalesce; at most 4 show at once.
- `NotificationService.muteErrors()` suppresses toasts while the app is already handling a failure visibly (the subscription gate in `apps/web/src/app/layout/host-shell/host-shell.ts`).

## Alternatives rejected
- **Per-call error handling only**: what produced R1. Every new call site would have to remember.
- **Echo `HttpErrorResponse.message`**: leaks the API origin and path (R8).

## Consequences
- New calls get a toast for free; a screen that shows its own error must pass `SUPPRESS_ERROR_TOAST` or the user sees it twice.
- 401 never toasts, so expiry signs users out silently (R15).
- The 401 handler is scoped to our base URL. A 401 from a third-party host (ipapi.co behind the phone input) used to sign users out.

## Evidence
- `apps/web/src/app/core/interceptors/error-interceptor.ts`, `apps/web/src/app/core/errors/api-error-message.ts`, `apps/web/src/app/core/tokens.ts`, `apps/web/src/app/core/notification.service.ts`, `apps/web/src/app/app.config.ts`
- 309c1dd feat: surface API errors globally instead of failing silently
- `docs/RISKS.md` (R1, R8, R9, R15, R16)
