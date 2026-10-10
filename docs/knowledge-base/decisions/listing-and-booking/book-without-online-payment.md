# Guests book without paying online, after a summary they confirm

**Status:** Accepted
**Area:** [listing-and-booking](../../area/listing-and-booking.md)

## Context

The first booking flow (PR #31) held rooms, then took a deposit online, then confirmed. Online payment was then removed from the seeker flow. Without a payment step, pressing Book in the side rail would create a booking from a panel the guest may not have read since setting the dates.

## Decision

- Nothing is charged online. The rail shows one figure — what the stay costs — settled with the hostel.
- Book opens `BookingSummary`, which restates dates, rooms and total (read from the basket, not recomputed) and asks for name, phone, email and an optional note. Only its confirm calls `POST /api/bookings`.
- The server prices the stay and checks availability; the client sends rooms and dates, never a total. A refused basket is refused whole.
- The response is read only for `booking_ref`; the modal then becomes the receipt. Without a reference, a toast says the booking was sent.
- Signed-out guests may browse and build a basket but are sent to `/auth` (with `returnUrl`) before booking; the basket lives in the page so it survives.

## Alternatives rejected

- **Keep the hold → pay → confirm flow.** Removed with payment (commit `4c980a8`); the hold endpoints remain only in the mock.
- **Create the booking straight from the rail.** The rail may be out of view and unread since the dates were set (`booking-summary.ts`).
- **Send the basket's total.** "A total computed in a browser is a number the guest can edit" (commit `117318c`, `booking-api.ts`).
- **A bespoke dialog.** Built and discarded for `hh-confirm-modal`, which already carried the dialog semantics (commit `4c980a8`).
- **Read more of the create response.** Every field read is a field that breaks the confirmation when renamed (`booking-request.ts` `CreatedBooking`).

## Consequences

- Deposit language left in comments (`booking-rail.ts`, `booking-basket.ts`) is stale.
- Bookings arrive in the host's list as requests for the host to confirm.

## Evidence

- `apps/web/src/app/features/public/listing/booking/booking-summary.ts`, `apps/web/src/app/features/public/listing/booking/booking-api.ts` (`createBooking`), `apps/web/src/app/features/public/listing/booking/booking-request.ts`
- `apps/web/src/app/features/public/listing/listing-detail/listing-detail.ts` (`startBooking`, `confirmBooking`)
- Commits `4c980a8` feat(booking): book without paying, and say what it costs before you do; `117318c` feat(booking): book a room against the real endpoint…; PR #33, PR #37
