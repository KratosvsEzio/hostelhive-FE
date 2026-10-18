# The room calendar's "today" is the hostel's date, read once, from a cached hostel lookup

**Status:** Accepted
**Area:** [host-console](../../area/host-console.md)

## Context
The room calendar's "today" used to be the device's date. Since #83 (D17) that date also decides when a checked-out stay stops holding beds, so a host whose device is in another zone saw wrong free beds around hostel midnight, and near a month end the calendar opened on the wrong month. The tenant form's availability check runs the same room-month calculation.

The hostel has an IANA `timezone` (required on create since #81), but the console's hostel cache is built from the index-backed `GET /api/host/hostels`, and the backend's hostel index (`hostel_index.rb` `search_data`) has no `timezone`. Only the record read, `GET /api/host/hostels/:id`, carries it.

## Decision
- `todayIn(zone, now)` (`apps/web/src/app/util/zoned-time.ts`) gives the `yyyy-MM-dd` on the zone's wall calendar. A missing or unknown zone (`isKnownTimeZone`) falls back to the device date; it never throws.
- The zone comes from `HostShellApi.hostelTimeZone(id)` (the record read, error toast suppressed, any failure → `null`), cached per hostel by `HostPropertyStore.timeZoneOf(id)` for the session, a `null` answer included, so a hostel costs at most one request (a manager refused by the record read costs one, not one per screen). The cache is cleared on sign-out and owner switch.
- `RoomCalendar` takes a `timeZone` input and reads the clock **once**, at construction. One `today` value feeds the today cell, the roster's default day, the checked-out cut-off and the opening month. A page left open past hostel midnight keeps the day it opened on; a reload moves it.
- Room detail renders the calendar only once the zone has settled (skeleton until then), so the first paint doesn't jump from the device date to the hostel's. Monthly hostels have no calendar and make no zone request for it.
- **The same rule covers the rest of the stay flow** (#182):
  - **Bookings calendar:** today cell, opening month and default ledger day, with the fetch and month label held behind its skeleton until the zone settles.
  - **Booking form:** default check-in is the hostel's tonight; check-out is check-in + 1 calendar day. A zone that lands after the form opened moves an untouched default, never a range the host picked. Save is off while the zone is pending.
  - **Overview "upcoming" strip:** one hostel `today` per fetch drives both the requested range and the cells.
  - **Tenant leave confirmation's day count:** counts from the hostel's today. #182 asked for the zone lazily, only once a leave date was entered; since #190 the zone is read when a new check-in opens (for the joining default) and the count shares that one cached request. An edit asks for none.
- Unlike `RoomCalendar` (a `timeZone` input), `BookingCalendar` and `BookingFormDrawer` inject `HostPropertyStore` and read `timeZoneOf(hostelId)` themselves. That keeps the bookings page (`bookings.ts` / `.html`) out of the change.
- Plain-day arithmetic goes through `apps/web/src/app/util/plain-day.ts`: `dayPart`, `calendarDaysBetween` (signed, by `Date.UTC` on the parts), `addDays`, `dayToLocalDate`. Never through `new Date('yyyy-MM-dd')`, which parses as UTC midnight, or a millisecond difference, which miscounts across a DST change.
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
- Trello #190 extended this to the rest of the console through one helper, `services/hostel-today.ts`: `selectedHostelZone` / `hostelZone(id)` (the cached zone read as a signal), `selectedHostelToday(openedAt, zone)` (clock read once) and `followToday` (moves an untouched form default when the zone lands after the form was seeded; an edited value, or a record being edited, is kept). Screens that fetch on a date (the overview detail charts, mess confirmations) hold the fetch until the zone settles, so the default isn't fetched twice. The shared pickers take an optional `today` input (`yyyy-MM-dd`, device date when unset) for the ring, the opening month and the presets; the layout picker's presets take the day as a parameter (`presetRange(label, today)`).
- The tenant joining date **and time** default to the hostel's wall clock, `wallClockIn(zone, openedAt)` in `util/zoned-time.ts` (`yyyy-MM-ddTHH:mm`): the API files `joining_date` as a naive wall time, so the value must be what the hostel's clock reads. The drawer reads the zone only for a new check-in, seeds from the device's clock while it is pending, and moves an untouched default with `followToday` when it lands; an edited value, or a tenant being edited, is kept (`tenant-form-drawer.joining.spec.ts`).
- On the backend, `Booking#checkin_not_in_past` (`be-hostelhive` `app/models/booking.rb`) refuses a check-in before the start of the hostel's day. Before #182, a device behind the hostel defaulted the booking form to a day the server would refuse.
- Node on Windows ignores an IANA `TZ` set at startup; a spec run "as" another device zone needs `process.env.TZ` set at runtime (a `--require` preload).

## Evidence
- `apps/web/src/app/util/zoned-time.ts` — `todayIn`; `zoned-time.spec.ts`.
- `apps/web/src/app/services/host-shell-api.ts` — `hostelTimeZone`; `apps/web/src/app/services/host-property-store.ts` — `timeZoneOf`.
- `apps/web/src/app/util/plain-day.ts`; `apps/web/src/app/features/host/bookings/booking-calendar.ts`, `booking-form-drawer/booking-form-drawer.ts`, `apps/web/src/app/features/host/overview/overview.ts`, `apps/web/src/app/features/host/tenants/tenant-form-drawer/tenant-form.model.ts` (`leaveCountdown`) — the #182 consumers, with `*.today.spec.ts`, `overview.strip.spec.ts` and `tenant-form-drawer.leave.spec.ts`.
- `apps/web/src/app/features/host/rooms/room-calendar/room-calendar.ts` — `timeZone`, `openedAt`, `today`; `room-calendar.today.spec.ts`.
- `apps/web/src/app/features/host/rooms/room-detail/room-detail.ts`, `.html` — the zone gate.
- `apps/web/src/app/features/host/tenants/tenant-form-drawer/tenant-form-drawer.ts` — the availability check; `tenant-form-drawer.availability.spec.ts`.
- `docs/implement/Bugs/166.md` — decisions D1–D10, the regression proof.
- `apps/web/src/app/services/hostel-today.ts`; `hostel-today.spec.ts`, `features/host/host-today-defaults.spec.ts` (every #190 default, east and west), the pickers' `*.today.spec.ts`.
