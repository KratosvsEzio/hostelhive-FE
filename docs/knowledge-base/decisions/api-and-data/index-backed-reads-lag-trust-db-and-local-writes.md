# Index-backed reads lag: trust the database read and our own writes, never a re-fetched list

**Status:** Accepted
**Area:** [api-and-data](../../area/api-and-data.md)

## Context
The host bookings list, which the bookings calendar and the room calendar also read, and `GET …/bookings/:id/occupancies` answer from the backend's search index (the occupancies controller uses `safe_search`). `GET …/bookings/:id` reads the database. The index lags the database:
- occupancies by about a second after a release. The panel re-read them straight after a successful release and redrew the room as active (run notes, defect D-1);
- a booking's disposition by minutes. The database said `checked-in` while the list still said `confirmed`, so a panel opened from the row offered Check in to a guest already in their room (D18);
- a newly created booking appears on the calendar only after a reload.

## Decision
- **Our own successful write is the truth for what it changed.** The booking panel records the rooms it released (`releasedIds`). A room it released, or one the booking's copy marks inactive, shows as released whatever the occupancies endpoint says. Rooms only ever go from active to released, so the panel also keeps rooms the booking carries that the endpoint has not listed yet.
- **After a move, the server's reply replaces the row and the panel** (`replaceBooking`). After a release, the page re-reads that one booking with `get()`, which reads the database, and re-fetches the list only if that read fails.
- **Opening a booking re-reads it from the database.** `openDetails` and the `bookings/:bookingId` URL show the list's copy at once, then `reread` makes one quiet `get()`. The answer replaces the panel, the row and the calendar entry. A failure keeps the list copy without a message.
- **A move's reply beats an overlapping re-read.** An `epoch` counter is bumped on open, when a move starts, and when it lands or is refused. A re-read answering under a later epoch, or for a booking no longer open, is dropped.
- **A known invoice is never replaced by "none"** from a later lookup (`lookupInvoices`, `keepSettled`).

## Alternatives rejected
- **Re-fetch the list after a write.** The list is the lagging copy. It redraws the state from before the write, which is what D-1 was.
- **A longer fixed delay before every re-read.** The lag ran to minutes. No delay covers that, and every screen would feel slow.
- **A short wait before the next read (`RefetchDelay`).** It held the next matching GET until 1 s after a write: rooms after a stay move, the staff list, the notifications list, invoices. The user rejected timed re-fetches on 2026-10-18 in favour of the backend refreshing the index on write. Invoices dropped it in FE PR #180, and the rest was removed in Trello #198.
- **Leave it to the backend.** Prompt reindexing on lifecycle moves is filed as a backend follow-up (run notes, Summary). The UI could not wait for it.

## Consequences
- Opening a booking costs one extra `GET bookings/:id`.
- Reopening a panel within about a second of a release made elsewhere (a check-out) can still show the index's rooms, and a plain list refresh is as stale as the index.
- New code that writes and then reads must not overwrite local state that came from a successful write with an index read.
- **Exception: an index the backend refreshes on write.** These indexes `prepend RefreshOnReindex`, so a list read sent after a write already includes it:
  - utility bills and renter bills (be `1c53f15`, BE PR #65). The Utilities page re-reads the list after a delete for its totals and bill count (`reloadTotals`, Trello #188, verified live 2026-10-18);
  - rooms, staff and user invites, the notifications list (be `b68a19d`, BE PR #75). Rooms (after a bulk add on a filtered view), Team (after a remove) and the notifications page and bell (after accept, reject or delete) re-read their lists straight away (Trello #198). Verified live 2026-10-31 against the deployed (staging) API: a list read sent 1–72 ms after each write already had it. The writes were a room edit, a check-in, a release, a cancel, a tenant move, add and set-inactive, a staff create, edit, status change and delete, a notification mark-read and two deletes; the rooms' `current_occupancy` and `renters` and the bell's `aggs.unread` all matched.

  For lagging data, ask the backend to add `RefreshOnReindex` to that index; don't add a timed FE re-fetch.

## Evidence
- `apps/web/src/app/features/host/bookings/booking-details-panel.ts` — `releasedIds`, `occupancies`.
- `apps/web/src/app/features/host/bookings/bookings.ts` — `reread`, `epoch`, `onReleased`, `replaceBooking`, `lookupInvoices`.
- `apps/web/src/app/features/host/bookings/host-bookings-api.ts` — `get`, `occupancies`.
- `docs/implement/TRELLO-83.md` — 5e rounds 1 and 3 (D-1, D18), the D-1 fix report, and "Search-index lag is the root of three of the five live defects".
- Trello #83; PR #128 (KratosvsEzio/hostelhive-FE), run notes `docs/implement/TRELLO-83.md`
