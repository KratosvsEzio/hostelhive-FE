# Booking dates travel as plain days in the hostel's zone

**Status:** Accepted
**Area:** [dates-money-and-time-zones](../../area/dates-money-and-time-zones.md)

## Context
A booking means 2 pm at the hostel, not wherever the guest is browsing. The first live booking flow (117318c) resolved check-in/check-out instants in the browser: it guessed the hostel's IANA zone from its free-text `country` (`apps/web/src/app/core/geo/country-time-zones.ts`), converted the wall time with `apps/web/src/app/util/zoned-time.ts`, and sent UTC `Z`. The hostel record had no timezone field then. Backend PR azeem-hamza/hostelhive#10 added a required `timezone` on the hostel.

## Decision
Guest booking create and edit, host booking create, and the host booking-list date filters send plain `yyyy-MM-dd` (`calendarDay`, from the picker's local parts). Changing a booking (`MyBookingsApi.update`) goes through the same `toBookingRequest` builder as creating one, so the two cannot drift. The server applies the hostel's own `timezone`. The hostel form and onboarding wizard require an IANA zone, pre-filled from `browserTimeZone()` and picked with `<hh-timezone-select>`. Hosts cannot change it once the hostel has bookings; admins and moderators can.

## Alternatives rejected
- **Client-resolved UTC instants**: pin the booking to the browser's guess, which is wrong for any hostel whose country maps badly (wide countries get one principal zone) or is misspelled.
- **Whole-day naive bounds (`dayRangeStart/End`)** for booking filters: the server now does zone resolution itself.
- **`Date.toISOString()` on the picker value**: moves the day backwards for anyone east of Greenwich (`calendarDay` doc comment).

## Consequences
- Reading bookings back is the mirror image: `GET /api/bookings` returns timestamps with the hostel's offset, and `wallTime()` reads the wall clock from the string rather than converting (`apps/web/src/app/features/user/bookings/my-bookings-api.ts`).
- The comments on `ApiCreateBookingRequest` still describe UTC instants and are stale; PR #40's description also predates this change.
- `zoned-time.ts` and `country-time-zones.ts` no longer have importers outside their specs.
- Backend caveat (PR #42 description): `search_helper.rb`'s `gte/lte` branch omits `time_zone`, so plain-day **filters** are read as UTC; day-edge bookings in non-UTC hostels can be off by one until the backend fixes it.
- Release coupling: the hostel form must send `timezone` before backend PR #10 is deployed, or hostel creation fails.

## Evidence
- `apps/web/src/app/features/public/listing/booking/booking-request.ts` (`calendarDay`, `toBookingRequest`)
- `apps/web/src/app/features/host/bookings/host-bookings-api.ts`
- `apps/web/src/app/util/time-zones.ts`, `apps/web/src/app/shared/timezone/timezone-select.ts`
- 3f766f0 feat(host): time zones, mark as paid, occupancies, expired subscriptions (Trello #81), merged as PR #42
- 117318c feat(booking): book a room against the real endpoint, on the hostel's clock (the superseded approach)
