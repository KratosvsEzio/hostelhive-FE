# Guests can change a pending booking's dates and rooms, shipped ahead of backend support

**Status:** Accepted
**Area:** [seeker-account](../../area/seeker-account.md)

## Context

Trello #79 asked for guest update and cancel. The backend's `PATCH /api/bookings/:id` (azeem-hamza/hostelhive#7) permitted dates, guests and `line_items`, but as built it could not store line changes (`line_items` passed as bare hashes to a plain `has_many`, a 500), recomputed totals only `on: :create`, and checked neither past dates nor availability.

## Decision

- Build the full change flow anyway: `/account/bookings/:id/edit` reuses the listing's room picker and rail over a `BookingBasket` seeded from the booking, then a review modal, then one `PATCH`.
- Send only the guest details and note when the stay is unchanged; add dates and `line_items` (from the same `toBookingRequest` that creates bookings) only when it changed. Never send `guests`; the server sums it.
- Show a server refusal (422) inside the review dialog; name rooms the hostel no longer offers instead of dropping them.
- Mirror the server's editability rule client-side (`canEdit`/`canCancel`) but let the server decide.

## Alternatives rejected

- **Limit editing to contact details until the backend is ready.** Those were the only edits the backend could store, but the full flow was shipped because the front end "already sends the documented shape, so it needs no change once that lands" (PR #40 body).
- **A separate edit form.** Reusing the picker and rail means the guest meets the screen they booked on, and create/change cannot drift (`booking-edit.ts`, `my-bookings-api.ts` `update`).

## Consequences

- Until the backend accepts nested line changes and reprices, saving a changed stay is expected to fail; contact-only edits and cancel work (commit `150e47f` body). Check the backend before reporting this as a front-end bug.
- PR #41 later allowed changing a confirmed booking more than 3 days before check-in, which sends it back to pending; the review modal warns about that.

## Evidence

- `apps/web/src/app/features/user/bookings/booking-edit.ts`, `apps/web/src/app/features/user/bookings/booking-edit-modal.ts`, `apps/web/src/app/features/user/bookings/my-bookings-api.ts`
- Commit `150e47f` feat(account): change a pending booking's dates, rooms and guests; PR #40 (KratosvsEzio/hostelhive-FE); PR #41 (Trello #80)
