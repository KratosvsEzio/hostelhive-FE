# The room calendar's "today" is the hostel's date, read once, from a cached hostel lookup

**Status:** Accepted
**Area:** [host-console](../../area/host-console.md)

## Context
The room calendar's "today" used to be the device's date. Since #83 (D17) that date also decides when a checked-out stay stops holding beds, so a host whose device is in another zone saw wrong free beds around hostel midnight, and near a month end the calendar opened on the wrong month. The tenant form's availability check runs the same room-month calculation.

The hostel has an IANA `timezone` (required on create since #81), but the console's hostel cache is built from the index-backed `GET /api/host/hostels`, and the backend's hostel index (`hostel_index.rb` `search_data`) has no `timezone`. Only the record read, `GET /api/host/hostels/:id`, carries it.

## Decision
- `todayIn(zone, now)` (`apps/web/src/app/util/zoned-time.ts`) gives the `yyyy-MM-dd` on the zone's wall calendar. A missing or unknown zone (`isKnownTimeZone`) falls back to the device date; it never throws.
- The zone comes from `HostShellApi.hostelTimeZone(id)` (the record read, error toast suppressed, any failure → `null`), cached per hostel by `HostPropertyStore.timeZoneOf(id)`. A `null` answer is not cached, so a failed read is retried by the next screen. The cache is cleared on sign-out and owner switch.
- `RoomCalendar` takes a `timeZone` input and reads the clock **once**, at construction. One `today` value feeds the today cell, the roster's default day, the checked-out cut-off and the opening month. A page left open past hostel midnight keeps the day it opened on; a reload moves it.
- Room detail renders the calendar only once the zone has settled (skeleton until then), so the first paint doesn't jump from the device date to the hostel's. Monthly hostels have no calendar and make no zone request.
- `today` is a required option on `toRoomMonth` / `toRoomStay`; there is no device default left to fall into.

## Alternatives rejected
- **Wait for the backend to index `timezone`.** Asked for (message to the BE developer); the record read covers it until then and can be dropped once the list carries the field.
- **Map `timezone` into `HostListing` now.** The index doesn't send it, so the field would always be empty while looking like it works.
- **Fall back to `Asia/Karachi`.** Wrong for every hostel outside Pakistan; the device date at least keeps the old behaviour.
- **A timer that moves "today" at hostel midnight.** New behaviour for a bug fix, and it would re-base the month under the host's feet — the reason the clock is read once.
- **A visible "Hostel time" line.** Declined by the user; the highlight landing on the hostel's date is the correct result.

## Consequences
- One extra record read per hostel per session (the full hostel serializer), until the backend indexes `timezone`.
- Same-zone hosts see no change. The specs pin instants with `Date.UTC` and hostel zones on both sides of the date line (`Pacific/Kiritimati`, `Pacific/Pago_Pago`), so they fail on the old code on any machine — a Karachi dev machine can't show the bug by default.
- The bookings calendar, the booking form's default check-in, the overview strip and the tenant "days until leave" count still use the device date (follow-up card); they should reuse `todayIn`.
- Node on Windows ignores an IANA `TZ` set at startup; a spec run "as" another device zone needs `process.env.TZ` set at runtime (a `--require` preload).

## Evidence
- `apps/web/src/app/util/zoned-time.ts` — `todayIn`; `zoned-time.spec.ts`.
- `apps/web/src/app/services/host-shell-api.ts` — `hostelTimeZone`; `apps/web/src/app/services/host-property-store.ts` — `timeZoneOf`.
- `apps/web/src/app/features/host/rooms/room-calendar/room-calendar.ts` — `timeZone`, `openedAt`, `today`; `room-calendar.today.spec.ts`.
- `apps/web/src/app/features/host/rooms/room-detail/room-detail.ts`, `.html` — the zone gate.
- `apps/web/src/app/features/host/tenants/tenant-form-drawer/tenant-form-drawer.ts` — the availability check; `tenant-form-drawer.availability.spec.ts`.
- `docs/implement/Bugs/166.md` — decisions D1–D10, the regression proof.
