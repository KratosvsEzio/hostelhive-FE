# API and data

How the app talks to the Rails backend: the HTTP client and interceptor chain, the normalised error and the toast it raises, the typed services per backend area, the shared models, fixtures, and where the API base URL comes from. Endpoint contracts are in `docs/api/hostelhive-api.md`; this file is about the plumbing.

## Where it lives
- `apps/web/src/app/core/provide-data-access.ts` — `provideDataAccess(config, interceptors)`: `HttpClient` with `withFetch()`, plus an `XhrFactory` binding for libraries that still use XHR.
- `apps/web/src/app/core/api-config.ts` — `API_CONFIG` (`baseUrl`, the API origin; paths carry `/api` or `/public`).
- `apps/web/src/app/core/api-resource.ts` — `ApiClient` (`get/post/put/patch/delete`, prefixes `baseUrl`) and `apiGet()` (an `httpResource` wrapper, currently unused).
- `apps/web/src/app/core/tokens.ts` — `ACCESS_TOKEN`, `UNAUTHORIZED_HANDLER`, `API_ERROR_NOTIFIER`, `SUPPRESS_ERROR_TOAST`.
- `apps/web/src/app/core/interceptors/` — `auth-interceptor.ts`, `push-token-interceptor.ts`, `error-interceptor.ts`, `ssr-timeout-interceptor.ts`.
- `apps/web/src/app/core/refetch-delay.ts` — `RefetchDelay` + interceptor: delays the next matching GET ~1 s after a mutation so the search index can settle.
- `apps/web/src/app/core/errors/api-error-message.ts` — `extractServerMessages`, `serverMessageText`, `toToastCopy`.
- `apps/web/src/app/core/notification.service.ts` — toasts (`show/error/info/success`, `muteErrors`).
- `apps/web/src/app/util/models/` — request/response types, exported as `@hostelhive/data-access` (`tsconfig.base.json`); `api-error.ts` defines `ApiError`, `paginated.ts` `Paginated<T>`.
- `apps/web/src/app/util/pagination.ts` — `ApiPagination`, `pageParams` (`page` + `limit`).
- `apps/web/src/app/services/` — one typed service per area, all re-exported from `index.ts` as `@services`.
- `tools/generate-api-env.mjs` — writes the git-ignored, generated `api.env.ts` (next to `apps/web/src/app/app.config.ts`) from `.env` `API_URL` (default `http://localhost:3000`); run by `sync-api-env` before build and serve (`apps/web/project.json`).

## How it works
Chain order (`apps/web/src/app/app.config.ts`): `authInterceptor` → `pushTokenInterceptor` → `errorInterceptor` → `refetchDelayInterceptor` → `ssrTimeoutInterceptor`. Base URL = `readDevApiBaseUrl() ?? apiEnv.apiUrl`.

`errorInterceptor` turns every failure into `ApiError { status, code, message, serverMessages?, method? }`. `message` is the server's text when the body is a Rails envelope, else Angular's message. 401 from our origin (credential endpoints excepted) goes to `UNAUTHORIZED_HANDLER`; other failures go to `API_ERROR_NOTIFIER` unless the request set `SUPPRESS_ERROR_TOAST`. The error is always re-thrown, so screens can also render it inline. 4xx toasts are pinned, 5xx/network auto-dismiss after 6 s (`app.config.ts`).

Backend conventions the mappers rely on:
- Envelope: success `{ ...payload, success: true }`; error `{ success: false, errors: [...] }`, though `errors` may be a string, a field map, or a singular `error` (`api-error-message.ts`).
- Ids are obfuscated hashids, but some embedded copies (attachment labels, search index fields) carry the raw integer, so the two never compare. Key by name or slug (`apps/web/src/app/services/moderation-api.ts`, `apps/web/src/app/features/public/listing/listing-detail/photo-groups.ts`).
- Status/disposition objects are `{ id, name, slug, color }` (`HostelStatus` in `apps/web/src/app/util/models/hostel.ts`); branch on `slug`.
- Amounts often arrive as decimal strings (`"2000.0"`); parse at the mapper (`apps/web/src/app/services/listing-detail-api.ts`).

### Services map (`apps/web/src/app/services/`)
- `auth-api.ts` — sign in/up, Google, invitation, password reset, `/api/users/current`.
- `hostels-api.ts` — authed `/api/hostels` CRUD, menus, meals; unwraps the envelope.
- `listings-api.ts` — public search (`/public/hostels`) mapped to `Listing`, prices in the visitor's currency.
- `listing-detail-api.ts` — public hostel detail and room types; `listing-detail.fixture.ts` now only supplies the `ListingDetail` type.
- `host-shell-api.ts` — `/api/host/hostels` list and manager accounts.
- `host-property-store.ts` — active-hostel selection; clears when the session ends.
- `host-ops-api.ts` — rooms, renters, bills, expenses; utility batch/meta still from `host-ops.fixtures.ts`.
- `staff-api.ts` — staff employment records (not logins).
- `overview-api.ts` — host dashboard cards and charts.
- `subscription-api.ts` / `subscription-store.ts` — plans, contracts, orders; plans and the current contract come from `subscription.fixtures.ts`.
- `admin-api.ts` — roles, permissions, contracts, payments; falls back to `admin.fixtures.ts` permission groups.
- `moderation-api.ts` — moderator hostels and attachments live; delta media, dispositions, audit, profile from `moderation.fixtures.ts`.
- `users-api.ts`, `student-api.ts`, `favourites-api.ts`, `offers-api.ts`, `products-api.ts`, `documents-api.ts`, `image-upload.service.ts` (presigned S3 upload), `search-capacity.ts` (shared signal), `google-auth.service.ts`.

## Reuse, don't rebuild
- Inject `ApiClient`; never build `baseUrl + path` yourself or call `fetch` (except deliberately for third parties, as `apps/web/src/app/core/geo/geo-preference.ts` does to keep the bearer token off them).
- Use `pageParams` / `ApiPagination` for paging; `isSubscriptionError` (`apps/web/src/app/util/subscription-error.ts`) and `isNetworkError` (`apps/web/src/app/util/network-error.ts`) for classifying failures.
- Show success/info with `NotificationService`; do not add per-call error toasts, the interceptor already raises one.

## Traps
- **`ApiError.message` comment is stale.** `util/models/api-error.ts` says never show it; since `normalize()` prefers the server text, the auth forms show it on purpose. It still falls back to Angular's URL-bearing message when the body is not an envelope.
- **Comments claiming "stub pending Q-API"** in `moderation-api.ts` and `subscription-api.ts` are only partly true; check each method.
- **Writes that 500 after committing** (backend serializer bugs on `/staffs`) surface as "Couldn't save" while the row exists; re-read before retrying.
- **Probing the API from the console**: `withFetch()` captures `window.fetch` at bootstrap, so console fetch/XHR hooks see nothing.
- The base-URL gate is still on `main` (`apps/web/src/app/app.html`), marked for removal before go-live.

## Decisions
- [API failures toast globally, with a per-request opt-out](../decisions/api-and-data/global-error-toast-with-opt-out.md)
- [Server-side requests time out at 5 s; browser requests never do](../decisions/api-and-data/ssr-only-request-timeout.md)

## See also
- [auth-and-session](./auth-and-session.md) — token, 401 handling
- [dates-money-and-time-zones](./dates-money-and-time-zones.md) — how dates and amounts are sent and read
- [ssr-seo-and-prerender](./ssr-seo-and-prerender.md), [tooling](./tooling.md), [host-billing-and-subscription](./host-billing-and-subscription.md)
- `docs/api/hostelhive-api.md`, `docs/RISKS.md` (R1, R4, R8, R9, R16), `docs/DEPLOY.md`
