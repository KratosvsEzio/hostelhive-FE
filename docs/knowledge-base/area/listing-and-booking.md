# Listing and booking

The public hostel page `/hostel/:slug` and everything a seeker does on it: gallery, rooms, reviews, contact reveal, favouriting, and the guest booking flow (room picker → basket → summary → `POST /api/bookings`). What happens to a booking afterwards (list, change, cancel) is [seeker-account](./seeker-account.md); the host's side of bookings is [host-console](./host-console.md).

## Where it lives
- `apps/web/src/app/features/public/listing/listing.routes.ts` — `:slug` → `ListingDetail`.
- `apps/web/src/app/features/public/listing/listing-detail/listing-detail.ts` — the page: load state, SEO + `LodgingBusiness` JSON-LD (`applySeo`), login gate, contact reveal, reviews, share, booking orchestration. Gallery helpers: `photo-groups.ts`, `filmstrip.ts`.
- `apps/web/src/app/features/public/listing/booking/` — `room-offer.ts` (pure money/unit rules, `canBookOnline`), `room-picker.ts`, `booking-basket.ts` (`BookingBasket`, provided per page), `booking-rail.ts`, `booking-summary.ts`, `booking-request.ts` (`toBookingRequest`), `booking-api.ts` + `booking-api.contract.ts`, `room-offers.fixture.ts`.
- `apps/web/src/app/services/listing-detail-api.ts` — `ListingDetailApi.getBySlug`, `toRoomOffers`, `toListingDetail`; view model in `apps/web/src/app/services/listing-detail.fixture.ts`.
- `apps/web/src/app/services/hostels-api.ts` — `getById` (`GET /public/hostel_detail/:id`), `showPhone` (`GET /api/hostels/:id/show_phone`).
- `apps/web/src/app/services/offers-api.ts` — cached `/api/offer_categories`.
- Utils: `apps/web/src/app/util/occupancy-type.ts`, `apps/web/src/app/util/room-types.ts`, `apps/web/src/app/util/primary-photo.ts`, `apps/web/src/app/util/attachment-url.ts`, `apps/web/src/app/util/pricing-period.ts`.

## How it works
- **Load**: `ListingDetail` fetches on the server too (the public endpoint needs no token), so SSR HTML has name, price and description. `getBySlug` maps only a **404** to `undefined` ("listing removed"); status 0 shows "can't connect", anything else a retryable error.
- **Mapping** (`toListingDetail`): `room_types` → `RoomOffer[]`; `occupancy_type` read through `isPrivateOccupancy` (`private` and `private_room`); "From" price = cheapest *payable* price (discount if real). Photos ordered by `primaryFirst` so index 0 is the host's starred photo everywhere. Descriptions are HTML rendered with `[innerHTML]` + `.hh-rich`.
- **Booking gate**: `bookingPeriod` = `billing_frequency` (`night`/`month`), falling back to accommodation type; `canBookOnline` is true only for nightly. Monthly hostels show the same room cards without booking controls and keep the contact path.
- **Basket**: `BookingBasket` is provided by the page (one hostel per basket). Private rooms are sold whole, shared rooms by the bed; prices are copied onto the line when added. Guests = sum of lines.
- **Book**: Book → `BookingSummary` (review) → `confirmBooking` → `BookingApi.createBooking` → `POST /api/bookings` (JWT). Body from `toBookingRequest`: plain `yyyy-MM-dd` dates, phone digits only, `quantity` only on private lines, `guests` per line. Only `booking_ref` is read back; on failure the basket is kept and the error shows in the modal.
- **Contact**: phone/WhatsApp/"Choose a room" open a login gate for guests (`gateIntent`); signed in, `show_phone` reveals primary, secondary and email.
- **Reviews**: listed from `/api/nps_ratings`; a review can only be posted from a review-request notification (`?review=<notificationId>` → `/api/notifications/:id/add_review`).

## Reuse, don't rebuild
- `room-offer.ts` (`effectivePrice`, `discountPercent`, `unitFor`, `canBookOnline`) and `occupancy-type.ts` (`isPrivateOccupancy`, `unitNoun`, `isValidDiscount`) — never compare to `'private'` by hand.
- `hh-room-picker`, `hh-booking-rail`, `BookingBasket` and `toBookingRequest` are reused by the account's change-booking page; keep them hostel-agnostic.
- `primaryFirst` for any lead photo; `usableVariant` before trusting an attachment variant URL.
- `periodFromBillingFrequency` then `periodForAccommodation` for any "per night / per month" label.

## Traps
- **`BookingApi` is mostly a mock.** Only `createBooking` is HTTP; holds, availability, cancellation quotes, host bookings and calendars are in-memory (`booking-api.ts` header). `ListingDetail._publishRooms` feeds the mock the real room types.
- **Private-room availability is invented**: `PRIVATE_UNITS_UNKNOWN = 9` is a stepper ceiling, not inventory (`listing-detail-api.ts`).
- **The contact gate is lead capture, not privacy.** The public detail document already carries `primary_phone`/`secondary_phone` (`publicPhones`, read by the booking page) (`listing-detail.fixture.ts`).
- **Stale comments**: `ApiCreateBookingRequest` still says dates are "ISO 8601, UTC, 2pm on the hostel's clock" while `toBookingRequest` sends plain days (`booking-request.ts`); `HostelsApi.getById` is documented as `GET /api/hostels/:id` but calls `/public/hostel_detail/:id`; `booking-rail.ts` still describes a "payable now" deposit that no longer exists; `room-offer.ts` says "Stub pending Q-API" though the room types are live.
- **`is_featured` is not on the detail payload**, so the featured pill never shows on this page (commit `aee277d`).
- `attachment-url.ts`: backend variant URLs are malformed (`amazonaws.comhostelhive`); `usableVariant` rejects them rather than repairing.

## Decisions
- [Online booking only for hostels that bill nightly](../decisions/listing-and-booking/online-booking-only-for-nightly-hostels.md)
- [Book without paying online, after a summary step](../decisions/listing-and-booking/book-without-online-payment.md)
- [Booking dates are sent as plain days; the server applies the hostel's zone](../decisions/dates-money-and-time-zones/booking-dates-sent-as-plain-days.md) (recorded under dates, money and time zones)

## See also
- [search-and-discovery](./search-and-discovery.md) — how seekers reach this page
- [seeker-account](./seeker-account.md) — list/change/cancel bookings, favourites
- [dates-money-and-time-zones](./dates-money-and-time-zones.md) — wall dates, currencies
- [ssr-seo-and-prerender](./ssr-seo-and-prerender.md), [auth-and-session](./auth-and-session.md), [host-console](./host-console.md)
- `docs/api/hostelhive-api.md`, `docs/trello-tickets.md`
