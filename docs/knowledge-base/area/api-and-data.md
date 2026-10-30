# API and data

How the app talks to the Rails backend: the HTTP client and interceptor chain, the normalised error and the toast it raises, the typed services per backend area, the shared models, fixtures, and where the API base URL comes from. Endpoint contracts are in `docs/api/hostelhive-api.md`; this file is about the plumbing.

## Where it lives
- `apps/web/src/app/core/provide-data-access.ts` — `provideDataAccess(config, interceptors)`: `HttpClient` with `withFetch()`, plus an `XhrFactory` binding for libraries that still use XHR.
- `apps/web/src/app/core/api-config.ts` — `API_CONFIG` (`baseUrl`, the API origin; paths carry `/api` or `/public`).
- `apps/web/src/app/core/api-resource.ts` — `ApiClient` (`get/post/put/patch/delete`, prefixes `baseUrl`, each with an optional trailing `HttpContext`), `ApiRequestOptions` / `requestContextArgs` (a service method's per-call toast opt-out), and `apiGet()` (an `httpResource` wrapper, currently unused).
- `apps/web/src/app/core/tokens.ts` — `ACCESS_TOKEN`, `UNAUTHORIZED_HANDLER`, `API_ERROR_NOTIFIER`, `SUPPRESS_ERROR_TOAST`.
- `apps/web/src/app/core/interceptors/` — `auth-interceptor.ts`, `push-token-interceptor.ts`, `error-interceptor.ts`, `ssr-timeout-interceptor.ts`.
- `apps/web/src/app/core/errors/api-error-message.ts` — `extractServerMessages`, `toToastCopy`.
- `apps/web/src/app/core/notification.service.ts` — toasts (`show/error/info/success`, `muteErrors`).
- `apps/web/src/app/util/models/` — request/response types, exported as `@hostelhive/data-access` (`tsconfig.base.json`); `api-error.ts` defines `ApiError`, `paginated.ts` `Paginated<T>`.
- `apps/web/src/app/util/pagination.ts` — `ApiPagination`, `pageParams` (`page` + `limit`).
- `apps/web/src/app/services/` — one typed service per area, all re-exported from `index.ts` as `@services`.
- `tools/generate-api-env.mjs` — writes the git-ignored, generated `api.env.ts` (next to `apps/web/src/app/app.config.ts`) from `.env` `API_URL` (default `http://localhost:3000`); run by `sync-api-env` before build and serve (`apps/web/project.json`).

## How it works
Chain order (`apps/web/src/app/app.config.ts`): `authInterceptor` → `pushTokenInterceptor` → `hostAccessInterceptor` → `errorInterceptor` → `ssrTimeoutInterceptor`.
- `hostAccessInterceptor` sits outside `errorInterceptor`, so it classifies the normalised `ApiError` on the way out.
- `ssrTimeoutInterceptor` is last, closest to the backend.

Base URL = `apiEnv.apiUrl`, the API origin; paths carry their own `/api` or `/public` prefix. `tools/generate-api-env.mjs` writes it into the git-ignored `apps/web/src/app/api.env.ts` from `API_URL` in the repo-root `.env`, defaulting to `http://localhost:3000`, and the serve and build targets run that script first. It's fixed at build time; nothing reads a URL at runtime. The backend-URL modal and `readDevApiBaseUrl()` were removed in `6b2f13d` (2026-10-10).

`errorInterceptor` turns every failure into `ApiError { status, code, message, serverMessages?, method? }`. `message` is a developer diagnostic, `<METHOD> <pathname> → <status>` (for example `POST /api/user/sign_in → 401`), built by `requestPath`/`diagnostic` in `error-interceptor.ts`. It has no origin, query, `statusText` or server wording; a non-HTTP error such as the SSR `TimeoutError` gets its name in place of the status. Text for users comes only from `serverMessages`, through `toToastCopy` or a classifier. 401 from our origin (credential endpoints excepted) goes to `UNAUTHORIZED_HANDLER`; other failures go to `API_ERROR_NOTIFIER` unless the request set `SUPPRESS_ERROR_TOAST`. The error is always re-thrown, so screens can also classify it and show their own translated copy. 4xx toasts are pinned, 5xx/network auto-dismiss after 6 s (`app.config.ts`).

Backend conventions the mappers rely on:
- Envelope: success `{ ...payload, success: true }`; error `{ success: false, errors: [...] }`, though `errors` may be a string, a field map, or a singular `error` (`api-error-message.ts`).
- Ids are obfuscated hashids, but some embedded copies (attachment labels, search index fields) carry the raw integer, so the two never compare. Key by name or slug (`apps/web/src/app/services/moderation-api.ts`, `apps/web/src/app/features/public/listing/listing-detail/photo-groups.ts`).
- Status/disposition objects are `{ id, name, slug, color }` (`HostelStatus` in `apps/web/src/app/util/models/hostel.ts`); branch on `slug`.
- Amounts often arrive as decimal strings (`"2000.0"`); parse at the mapper (`apps/web/src/app/services/listing-detail-api.ts`).
- Host list endpoints (bookings, renter bills) and `…/bookings/:id/occupancies` answer from a search index that lags the database by seconds to minutes; `GET …/bookings/:id` reads the database. Trust a successful write and the single read over a re-fetched list ([decision](../decisions/api-and-data/index-backed-reads-lag-trust-db-and-local-writes.md)).
- Some indexes refresh before the write answers (`prepend RefreshOnReindex` on the backend): utility bills and renter bills (BE PR #65), and rooms, staff and notifications (`user_invites`; BE PR #75, be `b68a19d`). A list read sent after one of those writes already has it, so Utilities, Rooms, Team, the notifications page and the bell re-read straight away. There is no timed re-fetch: `RefetchDelay`, which held the next GET for up to 1 s, was removed in Trello #198. For an index that still lags, ask the backend to add `RefreshOnReindex`; never add a delay.
- On those lists, `f[<field>]` is an exact-term filter. A hashid field the backend maps dynamically is analysed text, so filter it as `f[<field>.keyword]` (`bookingInvoices` in `apps/web/src/app/services/host-ops-api.ts`; [decision](../decisions/api-and-data/search-backed-filters-use-keyword-for-hashids.md)).

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
- `admin-api.ts` — roles, permissions, listings, payments; falls back to `admin.fixtures.ts` permission groups.
- `moderation-api.ts` — moderator hostels and attachments live; delta media, dispositions, audit, profile from `moderation.fixtures.ts`.
- `users-api.ts`, `student-api.ts`, `favourites-api.ts`, `offers-api.ts`, `documents-api.ts`, `image-upload.service.ts` (presigned S3 upload), `search-capacity.ts` (shared signal), `google-auth.service.ts`.

## Reuse, don't rebuild
- Inject `ApiClient`; never build `baseUrl + path` yourself or call `fetch` (except deliberately for third parties, as `apps/web/src/app/core/geo/geo-preference.ts` does to keep the bearer token off them).
- Use `pageParams` / `ApiPagination` for paging; `isNetworkError` (`apps/web/src/app/util/network-error.ts`) and, for a 403, `isCrmRequired` / `isPermissionRefusal` (`apps/web/src/app/core/host-access/host-access.ts`) for classifying failures. A 403 with no server code reaches the FE as `code: 'unknown_error'`. It is a permission refusal unless its message is the CRM one (the backend sometimes sends that without its code), and never a plan refusal. Call `isPermissionRefusal`; never compare `code` yourself.
- Show success/info with `NotificationService`; do not add per-call error toasts, the interceptor already raises one.
- To classify a failure for the screen, read the `ApiError` with `apps/web/src/app/core/errors/api-error-text.ts`, never by echoing `message`:
  - `errorStatus` gives the numeric status, or `null`;
  - `serverText` gives the joined, normalised `serverMessages`;
  - `isBareNotFound` detects Rails' own "Not Found".
  
  `reset-failure.ts` and `confirm-failure.ts` are the examples.
- For a `Booking` model 422 (any booking write, guest or host), use `bookingRefusal` (`apps/web/src/app/util/booking-refusal.ts`).
  - It returns `bookingsClosed`, `noLongerChangeable`, `withinCutoff`, `checkInPast`, `datesOutOfOrder`, `roomNotBookable`, the host stay-move kinds (`notEnoughBeds`, `alreadyCheckedIn`, `wrongStage`, `alreadyPaid`, `invoiceExists`, `roomAlreadyReleased`, `reasonRequired`, `allocationInvalid`), or `null`.
  - It matches the backend's exact wording, then keywords, in that priority.
  - Each screen maps the kind to its own key; the host stay moves do it in `apps/web/src/app/features/host/bookings/booking-move-failure.ts`.
- An image upload that never reached storage rejects with `UploadNetworkError` (`apps/web/src/app/services/image-upload.service.ts`); test with `instanceof`, not its text.
- To keep the toast off one call whose screen shows the error inline, give the service method a trailing `opts?: ApiRequestOptions` and spread `...requestContextArgs(opts)` into the `ApiClient` call; callers pass `{ suppressErrorToast: true }` (`host-ops-api.ts`, `host-bookings-api.ts`, `hostels-api.ts`). Without the flag the call is unchanged. All five `ApiClient` verbs accept the context; `auth-api.ts` builds its own with a private `inlineErrors()`.
- Decide "did the server reject the session?" with `isUnauthorized` (`apps/web/src/app/core/errors/is-unauthorized.ts`: a structural `.status === 401`, so status 0 is not a rejection), never a local check — two copies already had to be merged.

## Traps
- **Never render an error's `message`.** On an `ApiError` it is a developer diagnostic (since Trello #159, PR #137); plain `Error`s thrown by mappers and services carry developer text too ("booking X not in response", "Upload failed: 403").
  - Classify instead, through `api-error-text.ts`.
  - The guard `apps/web/src/app/core/errors/no-raw-error-message.spec.ts` fails the build on any `.message` read or `{ message }` destructuring in the `.ts` and `.html` files of `features/`, `layout/` and `shared/`. Its allowlist is exact: host billing's server refusal text (`serverMessages[0]`, taken only by `showChangeError()`, `showCheckoutError()` and `payErrorOutcome()` and copied on from there, never `ApiError.message`), admin billing's `AdminBillingError.message` (a 4xx's `serverMessages[0]`, set only by `adminBillingError()`), the inviter's note, the toast host and the notification bell (their own text, not errors).
  - Spec builders and old fixtures may still give `message` a server-text or URL value. That is harmless in negative tests, but it is not what the interceptor produces.
- **Comments claiming "stub pending Q-API"** in `moderation-api.ts` are only partly true; check each method.
- **Writes that 500 after committing** (backend serializer bugs on `/staffs`) surface as "Couldn't save" while the row exists; re-read before retrying.
- **The backend requires `email` on every staff record** (`staff.rb`), manager or not. A save without one is a 422 "Email can't be blank"; the Team form asks for it ([host-console](./host-console.md), "Every staff record needs an email").
- **Probing the API from the console**: `withFetch()` captures `window.fetch` at bootstrap, so console fetch/XHR hooks see nothing.
- The base-URL gate is still on `main` (`apps/web/src/app/app.html`), marked for removal before go-live.

## Decisions
- [API failures toast globally, with a per-request opt-out](../decisions/api-and-data/global-error-toast-with-opt-out.md)
- [Server-side requests time out at 5 s; browser requests never do](../decisions/api-and-data/ssr-only-request-timeout.md)
- [Index-backed reads lag: trust the database read and our own writes, never a re-fetched list](../decisions/api-and-data/index-backed-reads-lag-trust-db-and-local-writes.md)
- [Exact-match filters on a dynamically mapped hashid go to its `.keyword` field](../decisions/api-and-data/search-backed-filters-use-keyword-for-hashids.md)

## See also
- [auth-and-session](./auth-and-session.md) — token, 401 handling
- [dates-money-and-time-zones](./dates-money-and-time-zones.md) — how dates and amounts are sent and read
- [ssr-seo-and-prerender](./ssr-seo-and-prerender.md), [tooling](./tooling.md), [host-billing-and-subscription](./host-billing-and-subscription.md)
- `docs/api/hostelhive-api.md`, `docs/RISKS.md` (R1, R4, R8, R9, R16), `docs/DEPLOY.md`
