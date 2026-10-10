# Seeker account

The signed-in seeker's own pages: `/account/*` (bookings, one booking, change a booking, favourites, settings, password) and `/notifications`. Both trees are `authGuard`ed and client-rendered. Making a booking is [listing-and-booking](./listing-and-booking.md); sign-in and the session itself are [auth-and-session](./auth-and-session.md).

## Where it lives
- `apps/web/src/app/app.routes.ts` — the `account` children and `notifications`; `apps/web/src/app/app.routes.server.ts` lists both as `RenderMode.Client`.
- `apps/web/src/app/features/user/account-shell/account-shell.ts` — sidebar (Bookings, Favorites, Settings, Password & security) + outlet. `/account/help` redirects to `/faqs`.
- `apps/web/src/app/features/user/bookings/my-bookings-api.ts` — `MyBookingsApi` (`list`, `get`, `update`, `cancel`), `toGuestBooking`, `wallTime`, `timingOf`, `canEdit` / `canCancel`, `stageFor`.
- `apps/web/src/app/features/user/bookings/bookings.ts` — the list, grouped current / upcoming / past.
- `apps/web/src/app/features/user/bookings/booking-detail.ts` — one booking: stage track, stay, money, guest, hostel photo/phones/map; cancel dialog.
- `apps/web/src/app/features/user/bookings/booking-edit.ts` + `booking-edit-modal.ts` — change dates, rooms, headcount and guest details.
- `apps/web/src/app/features/user/bookings/booking-status.ts` — stage labels shared by list and detail.
- `apps/web/src/app/features/user/favorites/favorites.ts`, `apps/web/src/app/util/favorites-store.ts`, `apps/web/src/app/services/favourites-api.ts`.
- `apps/web/src/app/features/user/settings/settings.ts` — profile, avatar, language, currency, analytics consent.
- `apps/web/src/app/features/user/security/security.ts` — change password (`AuthApi.changePassword`).
- `apps/web/src/app/features/notifications/notifications.ts`, `apps/web/src/app/services/student-api.ts` — notifications, invites, reviews.

## How it works
- **Bookings list**: `GET /api/bookings` (JWT-scoped, `page` + `limit`, 20 per page). Rows are grouped by *when* (`timingOf`: stage first, then dates). A row hands its `GuestBooking` to the detail page in `history.state`, which draws at once and then refreshes from `GET /api/bookings/:id`.
- **Two serializers**: the list sends numbers, `nights`, `balance_due`, flat `room_type_name`; the single booking sends decimal strings, nests line names, and omits `nights`/`balance_due`. `toGuestBooking` reads both and derives what is missing.
- **Dates** arrive with the hostel's offset; `wallTime()` reads the wall clock from the string — never `new Date()`.
- **Lifecycle**: `disposition.slug` drives the stage track (`requested → confirmed → checked-in → checked-out`, off-track `cancelled` / `no-show`; legacy `pending-allotment`/`room-assigned` folded in). Edit/cancel rules read `status.slug`: pending any time, confirmed only while check-in is more than 3 days away (`GUEST_CHANGE_CUTOFF_MS`), mirroring the server.
- **Change booking** (`/account/bookings/:id/edit`): the listing's `hh-room-picker` and `hh-booking-rail` over a `BookingBasket` seeded from the booking; a review modal; one `PATCH /api/bookings/:id`. Dates and `line_items` are sent only if the stay changed, built by `toBookingRequest`; `guests` is never sent. Cancel: `POST /api/bookings/:id/mark_as_cancelled`, and the reply replaces the page's copy.
- **Favourites page** lists `GET /api/favourites` through `toListing`, rendered with `hh-listing-card [savable]=false` and a confirm-before-remove.
- **Notifications**: `GET /api/notifications` (`user_invites`, `aggs.unread`); items are marked read as they scroll into view (`IntersectionObserver` → `mark_as_read`); invites accept/reject; review requests deep-link to `/hostel/:id?review=<id>`. `RefetchDelay` (`apps/web/src/app/core/refetch-delay.ts`) delays the refetch after a mutation.
- **Settings**: language and currency apply on pick, not on Save; a picked avatar is committed immediately and rolled back on failure; the analytics switch is hidden when no GA id is configured.

## Reuse, don't rebuild
- `MyBookingsApi` and its pure helpers (`wallTime`, `timingOf`, `canEdit`, `canCancel`, `mapsUrl`) for anything showing a guest booking.
- `toBookingRequest` for any booking write; `BookingBasket` + picker + rail for any room selection UI.
- `toListing` (via `FavouritesApi`) and `hh-listing-card` for saved hostels.

## Traps
- **Favourites have two sources of truth.** Hearts read `FavoritesStore`, a localStorage snapshot (`hh:favorites`) that is never seeded from `/api/favourites` and never cleared on sign-out (`clear()` has no caller); the Favorites page reads the server. A new device shows no hearts; a shared browser shows the previous user's. Writes are `catchError(() => of(null))`, so failures are silent (`favourites-api.ts`, RISKS R1).
- **Signed-out hearts** on search cards and map popups save locally and fire a write that fails silently; only the listing page sends guests to `/auth` (`listing-card.ts`, `listing-detail.ts` `toggleSaved`).
- **Changing dates/rooms may not save.** PR #40 shipped it ahead of the backend (see decision); contact-only edits and cancel work.
- **Disposition vs status**: a new guest booking's disposition can be `pending-payment` under status `pending` — still editable. Use `canEdit`, not the stage.
- **`docs/RISKS.md` R4/BE-2** says no favourites route exists, while `favorites.ts` reads `GET /api/favourites`. One of them is stale — verify against the API.
- `NotificationsPage` builds an `IntersectionObserver` in its constructor; safe only because the route never server-renders. Its tabs, type labels and empty states are English literals; `security.ts` toasts are too.

## Decisions
- [Guests can change a pending booking's stay, shipped ahead of backend support](../decisions/seeker-account/change-booking-shipped-ahead-of-backend.md)

## See also
- [listing-and-booking](./listing-and-booking.md) — booking creation, room picker, basket
- [auth-and-session](./auth-and-session.md) — `authGuard`, `SessionStore`
- [dates-money-and-time-zones](./dates-money-and-time-zones.md) — wall times, currency symbols
- [i18n](./i18n.md), [host-console](./host-console.md) (the host side of the same bookings)
- `docs/RISKS.md` (R1, R4, R10), `docs/trello-tickets.md`
