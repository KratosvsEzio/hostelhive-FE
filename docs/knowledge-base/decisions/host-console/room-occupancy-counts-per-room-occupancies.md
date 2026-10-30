# A room is charged only the guests placed in it, until the day it was released or the party left

**Status:** Accepted
**Area:** [host-console](../../area/host-console.md)

## Context
Check-in places a booking's party in one or more rooms (`occupancies`, each with a room, a guest count and `active`). The room calendar (`rooms/room-calendar/`) charged every booking its whole party, and found a room's bookings by `f[room.id]` alone. The server sets that to the **first** allocated room, so a party of three split as 2 + 1 filled its first room (3 of 3) and never appeared in its second.

After that fix, live testing found two more faults. A party that checked out on the morning of its first night still held its beds for the rest of the booked stay, and the room read "4 of 3 beds · over 1". The departure day read "over -3".

## Decision
- **Fetch both ways.** `HostBookingsApi.bookingsInRoom` asks `f[room.id]` (all a booking that has not checked in has) and `f[stayed_room_ids]` (every room a party was ever placed in, since Trello #165) for the month, and merges them, each booking once, first-room results first. `stayed_room_ids` covers `occupied_room_ids`, which is no longer asked; every indexed booking was checked to carry it on 2026-10-31.
- **Charge only this room's guests** (`toRoomStay` with `occupanciesOf`, `room-stays.ts`):
  - a booking with no occupancies (not checked in yet) holds its whole party, as before;
  - a checked-in booking holds the guests of its **active** occupancies in this room, and of released ones until their release day (`releasedOn`); a released one with no release day is left out;
  - a checked-out or cancelled one holds all of its occupancies in this room, as history;
  - a booking with none in this room is not drawn.

  A room sold whole (capacity 1) counts as one unit.
- **A checked-out stay ends on the day it actually left** (`nightsHeldUntil`, `checkedOutOn`), and a room on the day it was released (`occupancyHeldUntil`), never outside the booked stay. Nights before stay as history. Only a stay the server sent no check-out time for still ends **today**.
- **One predicate (`sleepsOn`) drives both the night count and the pips.** Oversold means booked > capacity, so the departure-day label cannot go negative.
- The tenant form's availability check passes the room id too, so it charges the same way.

## Alternatives rejected
- **One request with the backend's `or[n][…]` group.** Untested live. If the server silently ignored it, every unallotted booking in the hostel would be drawn on every room.
- **Draw the booking's line items (beds booked).** That was the fault.
- **Only fix the negative label.** Checked-out guests would still hold beds they had left.

## Consequences and limits
- "Today" is the hostel's date, the same day the calendar highlights, read once when the calendar opens ([decision](./console-today-is-the-hostels-date.md)). With no usable hostel zone it falls back to the device's date.
- `released_at`, `checked_in_at` and `checked_out_at` come in the hostel's offset (BE azeem-hamza/hostelhive `fe8224f`), so their date part is the hostel's day and is read without a `Date`.
- Two occupancies of one booking in the same room that end on different days are drawn together, to the later day.
- Two requests per room-month.
- The calendar shares the index lag in [index-backed reads](../api-and-data/index-backed-reads-lag-trust-db-and-local-writes.md).

## Evidence
- `apps/web/src/app/features/host/rooms/room-calendar/room-stays.ts` — `occupanciesOf`, `toRoomStay`, `nightsHeldUntil`, `sleepsOn` (`today` is a required option); `room-calendar.ts`.
- `apps/web/src/app/features/host/bookings/host-bookings-api.ts` — `bookingsInRoom` and its doc comment (the known limit and the `or` reasoning).
- `apps/web/src/app/features/host/tenants/tenant-form-drawer/tenant-form-drawer.ts` — the availability check.
- `room-stays.spec.ts`, `room-calendar.pips.spec.ts`, `host-bookings-api.spec.ts`.
- `docs/implement/TRELLO-83.md` — decisions D16 and D17; 5e rounds 3 and 4.
- Trello #83; PR #128 (KratosvsEzio/hostelhive-FE), run notes `docs/implement/TRELLO-83.md`
