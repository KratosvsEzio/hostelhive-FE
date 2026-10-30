# Admin billing shows dates in UTC

**Status:** Accepted
**Area:** [dates-money-and-time-zones](../../area/dates-money-and-time-zones.md), [admin-and-moderation](../../area/admin-and-moderation.md)

## Context
Everywhere else an API timestamp renders in the offset the backend sent (`apiDate`; see [API timestamps render in the offset the backend sent](./render-api-timestamps-in-their-own-offset.md)). The admin billing pages filter by day, and with no `time_zone` on the search side a day there is a UTC day, so every page says "Dates are in UTC." Rendered through `apiDate`, a payment sent as `10:00+05:00` read "10:00" under that note; it is 05:00 UTC. Found in the live check, not by the specs, whose fixtures all used `Z`.

## Decision
Admin billing renders every timestamp through `AdminUtcDate` (`adminUtcDate`), which converts anything carrying an offset to UTC. A bare `YYYY-MM-DD` has no instant and stays the calendar date it names. Host-facing billing keeps `apiDate`.

## Alternatives rejected
- **Keep `apiDate` and change the note** to the hostel's offset: the date filters still select UTC days, so the list would disagree with its own filter.
- **Drop the note**: an admin comparing a Safepay or bank record would still be off by five hours without knowing it.

## Consequences
- A new admin billing template must use `adminUtcDate`, not `apiDate`. Test fixtures should include a `+05:00` timestamp, or the difference cannot show.
- If the backend ever adds a search `time_zone`, revisit both the filter bounds and this pipe together.
- **Reviewed for Trello #90 (2026-10-31), kept.** Backend PR #20 made UTC the zone for admin endpoints, and the card proposed offset-aware bounds (`dayRangeStartLocal`) plus viewer-zone display. Admin billing is the only admin or moderator date filter left (#94 removed the contracts list), and the page already says "Dates are in UTC", which the card accepts as an alternative. Payments are paused, so the change was not made. If a later ticket switches billing to the viewer's day, change the bounds, this pipe and the page note in one change.

## Evidence
- `apps/web/src/app/features/admin/billing/shared/admin-utc-date.ts` and its spec
- `docs/implement/billing-frontend/100.md`, "Live check, read-only"
