# API timestamps render in the offset the backend sent

**Status:** Accepted
**Area:** [dates-money-and-time-zones](../../area/dates-money-and-time-zones.md)

## Context
The backend stores UTC but serialises in its own offset: a 1 Sep salary date arrives as `2026-09-01T00:00:00.000+05:00`. Angular's `date` pipe formats in the viewer's zone, so anyone west of +05:00 saw 31 Aug. The bug was invisible on a Pakistan-timezone machine, where both readings agree.

## Decision
Every API-sourced timestamp renders through the `apiDate` pipe, which reads the trailing offset off the string (`Z` → `+0000`) and formats in it. A bare `YYYY-MM-DD` has no offset and is left alone, because Angular already reads it as a local calendar date. Values built in the browser (date-picker state, `new Date()`) keep the stock `date` pipe. Writes build days from local parts (`localDay`), never `toISOString()`.

## Alternatives rejected
- **Stock `date` pipe everywhere**: shifts the day for viewers west of the hostel.
- **Convert to the viewer's zone deliberately**: these values describe events in the hostel's own time, so the hostel's offset is the correct one to show.
- **A timezone library**: not needed. The offset is in the string, and `Intl` covers the rest (`apps/web/src/app/util/zoned-time.ts`).

## Consequences
- New templates showing API dates must use `apiDate`, or the off-by-one-day bug returns for non-Pakistan viewers. A Pakistan-timezone dev machine will not show it, so test by switching the browser zone.
- Some mappers slice the wall-clock string instead (`apps/web/src/app/services/host-ops-api.ts`, `apps/web/src/app/services/staff-api.ts`) for the same reason.

## Evidence
- `apps/web/src/app/util/api-date.ts`
- 93cb479 fix(dates): render backend timestamps in the offset the backend sent
