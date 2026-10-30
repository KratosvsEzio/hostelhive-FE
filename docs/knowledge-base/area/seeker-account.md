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
- **Refusals**:
  - update and cancel suppress the global toast;
  - a refusal keeps the dialog or review open, with a key from `changeFailureKey(err, 'update' | 'cancel')` (`booking-change-failure.ts`);
  - the outcomes are the 3-day cutoff, no longer editable or cancellable, room, dates, not found, network, `changeFailed` or `cancelFailed`.
- **Favourite hearts** (search cards, home cards, the map card and popup, the listing page) read `FavoritesStore`, which follows `SessionStore`'s user **id**: sign-in, restore or an account switch empties it and reloads `GET /api/favourites` quietly (`SUPPRESS_ERROR_TOAST`); sign-out or a 401 empties it and deletes the cache. Writes are optimistic with an exact rollback, a per-hostel in-flight lock, a merge so a load never undoes an in-flight or just-settled write, and a quiet reload after any non-401 failure (`apps/web/src/app/util/favorites-store.ts`). Guests are sent to `/auth?mode=login&returnUrl=…` before the store is touched (`listing-card.ts`, `search-map.ts` `redirectGuest`, `listing-detail.ts` `toggleSaved`).
- **Favourites page** lists `GET /api/favourites` through `toListing` (its own request), rendered with `hh-listing-card [savable]=false` and a confirm-before-remove; removal goes through `FavoritesStore.unsave`, and the row comes back if the server refuses (`favorites.ts`).
- **Notifications**: `GET /api/notifications` (`user_invites`, `aggs.unread`); items are marked read as they scroll into view (`IntersectionObserver` → `mark_as_read`); invites accept/reject; review requests deep-link to `/hostel/:id?review=<id>`, and billing notices to `/host/<hostel_id>/subscription` (`hostelId` on `UserInvite`, from the server's `hostel_id`; see host-billing-and-subscription). **Meal confirmations are accepted only here**: `StudentApi.acceptInvite` → `POST /api/notifications/:id/mark_as_accepted`, and a backend job marks the meal confirmed, which the host's mess confirmations list then shows. The meal email carries no link. The retired `/mess/confirm` and `/meal_confirmation` redirect here through `toNotifications` (`app.routes.ts`), which drops the query string. After an accept, reject or delete, the page and the bell re-read the list at once (`refresh`); the notifications index refreshes on write (BE PR #75, Trello #198), so that read already carries the change and the bell's `aggs.unread`.
- **Settings**: language and currency apply on pick, not on Save; a picked avatar is committed immediately and rolled back on failure; the analytics switch is hidden when no GA id is configured.

## Reuse, don't rebuild
- `MyBookingsApi` and its pure helpers (`wallTime`, `timingOf`, `canEdit`, `canCancel`, `mapsUrl`) for anything showing a guest booking.
- `toBookingRequest` for any booking write; `BookingBasket` + picker + rail for any room selection UI.
- `toListing` (via `FavouritesApi`) and `hh-listing-card` for saved hostels; `FavoritesStore` (`isFavorite`, `toggle`, `unsave`) for any heart — never call the `FavouritesApi` writes directly.

## Traps
- **The favourites cache is per user, and only a paint-ahead.** `hh:favorites` holds `{ owner, items }` and is painted only when `owner` is the current session user id; anything else (another user, the legacy bare array) is discarded, and the server list replaces it on every load. Key anything new on `user()?.id`, not the user object — restore and `refreshSession` re-set the same user (`favorites-store.ts`).
- **Changing dates/rooms may not save.** PR #40 shipped it ahead of the backend (see decision); contact-only edits and cancel work.
- **Download confirmation link.** `confirmationLink(booking)` (`apps/web/src/app/features/user/bookings/my-bookings-api.ts`) returns the stored PDF's `confirmation_pdf.url` only for a `confirmed`, `checked-in` or `checked-out` stage, else `''`; `booking-detail.html` draws it in the reference strip, outside the `!finished()` block, so a checked-out guest keeps it. A guest change sends a confirmed booking back to pending while the old PDF stays attached, and a cancelled or no-show booking is not confirmed, so those stages show nothing. The PDF is stored by an asynchronous job after the booking is confirmed, so the link appears on the next open of the booking, not in the reply that confirmed it, and a booking whose store failed (or that was confirmed before the field existed) never shows one. Only `url` is read; `confirmation_pdf_url` is gone.
- **Disposition vs status**: a new guest booking's disposition can be `pending-payment` under status `pending` — still editable. Use `canEdit`, not the stage.
- **`docs/RISKS.md` R4/BE-2 is stale on favourites**: `GET /api/favourites`, `POST /api/favourites/mark_as_favourite` and `DELETE /api/favourites/mark_as_unfavourite` all exist (401 unauthenticated vs 404 for an unknown path, checked live 2026-10-10 — `docs/implement/Bugs/105.md`).
- `NotificationsPage` builds an `IntersectionObserver` in its constructor; safe only because the route never server-renders. Its tabs and empty states are English literals, and so are `security.ts` toasts. Type labels are translated (`notification-types.ts`, Trello #214).

## Decisions
- [Guests can change a pending booking's stay, shipped ahead of backend support](../decisions/seeker-account/change-booking-shipped-ahead-of-backend.md)
- [Favourites follow the session user, with the server as the source of truth](../decisions/seeker-account/favourites-follow-the-session-user.md)
- [Meal confirmations happen only in notifications; there is no tokened confirm page](../decisions/seeker-account/meal-confirmations-only-in-notifications.md)

## See also
- [listing-and-booking](./listing-and-booking.md) — booking creation, room picker, basket
- [auth-and-session](./auth-and-session.md) — `authGuard`, `SessionStore`
- [dates-money-and-time-zones](./dates-money-and-time-zones.md) — wall times, currency symbols
- [i18n](./i18n.md), [host-console](./host-console.md) (the host side of the same bookings)
- `docs/RISKS.md` (R1, R4, R10), `docs/trello-tickets.md`
