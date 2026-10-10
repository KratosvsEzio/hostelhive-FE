# Date-range filters send naive whole-day bounds

**Status:** Accepted
**Area:** [dates-money-and-time-zones](../../area/dates-money-and-time-zones.md)

## Context
Date-range pickers produce date-only values, but the backend's `f[col][gte|lte]` filters run against datetime columns. A bare `YYYY-MM-DD` upper bound dropped same-day rows recorded after midnight. Earlier code also mixed formats (an admin filter sent `T23:59:59.999Z`), and the expenses list filtered client-side over a capped page, so it silently missed older rows.

## Decision
Every date-range filter goes through `dayRangeStart(d)` → `YYYY-MM-DDT00:00:00` and `dayRangeEnd(d)` → `YYYY-MM-DDT23:59:59`: naive local datetimes with no `Z`, offset or milliseconds, matching the backend's own example (`2026-08-02T00:00:00`), which it reads as server-local. Callers today: host invoices and utilities (`issue_date`), expenses (`expense_date`, now filtered server-side), and admin contracts (`end_date`) and payments (`created_at`).

**Exception:** booking dates (`checkin_date`, `checkout_date`), both writes and host booking-list filters, send plain `YYYY-MM-DD`. See [booking dates](./booking-dates-sent-as-plain-days.md).

## Alternatives rejected
- **Bare dates**: lose same-day rows on the upper bound.
- **UTC instants (`…Z`, `.999Z`)**: the backend treats the value as server-local; the `Z` form was normalised away.
- **Inline `+ 'T00:00:00'` per screen**: the convention drifted when it was done that way, so the helper is mandatory.

## Consequences
- Numeric ranges (price, capacity in `apps/web/src/app/services/listings-api.ts`) are not dates and must not use these helpers.
- "Fixing" booking filters to use the helpers would break them; they are the documented exception.

## Evidence
- `apps/web/src/app/util/date-range-filter.ts`
- `apps/web/src/app/features/host/invoices/invoices.ts`, `apps/web/src/app/features/host/utilities/utilities.ts`, `apps/web/src/app/features/host/expenses/expenses-list.ts`, `apps/web/src/app/services/admin-api.ts`
- eb9fde1 feat: instant login modal close, listing detail, expenses, and UI fixes (introduced the helper)
