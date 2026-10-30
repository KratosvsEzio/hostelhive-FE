# Dates, money and time zones

How the app sends and renders calendar days, timestamps, time zones, prices and currencies. The rules here exist because the backend serialises in the hostel's own offset, the viewer can be anywhere, and a price without its unit or currency reads wrong. Booking-specific flows are in [listing-and-booking](./listing-and-booking.md); billing cycles in [host-billing-and-subscription](./host-billing-and-subscription.md).

## Where it lives
- `apps/web/src/app/util/api-date.ts` — `apiDate` pipe (renders an API timestamp in the offset it carries), `offsetOf`, `localDay` (a `Date` → `YYYY-MM-DD` from local parts).
- `apps/web/src/app/util/date-range-filter.ts` — `dayRangeStart` / `dayRangeEnd` for `f[col][gte|lte]` filters.
- `apps/web/src/app/util/time-zones.ts` — IANA list, `browserTimeZone`, `zoneOffsetLabel`, `isKnownTimeZone`.
- `apps/web/src/app/util/plain-day.ts` — `dayPart`, `calendarDaysBetween` (signed whole days by `Date.UTC` on the parts), `addDays`, `dayToLocalDate`: arithmetic on `yyyy-MM-dd` that neither the device zone nor DST can move.
- `apps/web/src/app/util/zoned-time.ts` — `todayIn` (the `yyyy-MM-dd` in an IANA zone, device date when the zone is missing or unknown), `zonedWallTimeToUtc`, `localDateAtWallTime` (Intl-based, no library).
- `apps/web/src/app/core/geo/country-time-zones.ts` — country name/code → IANA zone, fallback `UTC`.
- `apps/web/src/app/shared/timezone/timezone-select.ts` — `<hh-timezone-select>`, two-way bound to an IANA name.
- `apps/web/src/app/util/currencies.ts` — `CURRENCIES`, `currencySymbol`, `currencyName`, `isCurrencyCode`, `DEFAULT_CURRENCY_CODE` (`PKR`).
- `apps/web/src/app/shared/currency/` — `money` pipe, `currencySym` and `currencyName` pipes, `<hh-currency-select>`.
- `apps/web/src/app/shared/money-input/money-input.ts` — `<hh-money-input>`: grouped mask, symbol inside the field, emits a plain `number`.
- `apps/web/src/app/util/pricing-period.ts` — `Price { amount, period }`, `periodSuffix`, `formatAmount`, `formatPriceCompact`; `night`/`month` slugs ↔ `nightly`/`monthly`.
- `apps/web/src/app/util/billing-frequency.ts` — backpacker ⇒ nightly rule (`conflicts`, `gateBillingOptions`).
- `apps/web/src/app/util/billing-day.ts` — 1–31 billing-day options; rejects rather than clamps bad stored days.
- `apps/web/src/app/core/preferences/currency-preference.ts` — `CurrencyPreference` (`hh.currency`, plus `hh.currency.chosen` for an explicit choice).
- `apps/web/src/app/core/geo/` — `GeoPreference` (IP country → language + currency), `country-preferences.ts` (country → locale/currency, fallback `USD`), `country-bounds.ts` (country bounding boxes for map bias).

## How it works
- **Reading API timestamps**: the backend stores UTC but sends its own offset (`2026-09-01T00:00:00.000+05:00`). Render with `| apiDate: 'dd MMM yyyy'`, which formats in that offset, not the viewer's. Some mappers slice the wall-clock string instead of parsing (`apps/web/src/app/services/host-ops-api.ts`, `apps/web/src/app/services/staff-api.ts`). Admin billing is the exception: it renders in UTC through `adminUtcDate`, to match its UTC-day filters.
- **Admin and moderator screens outside billing render in the viewer's zone.** Admin listings and roles, and the moderator queue, review and media screens, format with `date-fns` `format(parseISO(iso), …)`, which converts the instant to the browser's zone. Since backend PRs #20 and #24, admin and moderator endpoints send hostel records in the hostel's offset and hostel-less records (users, roles, attachments) in UTC; both read correctly this way. Leave them on `date-fns` rather than moving them to `apiDate` (Trello #90).
- **Sending a single day**: build it from local parts (`localDay`, or `calendarDay` in `apps/web/src/app/features/public/listing/booking/booking-request.ts`). Never `toISOString()`, which gives the UTC day.
- **Sending a date range filter**: `dayRangeStart(d)` → `d T00:00:00`, `dayRangeEnd(d)` → `d T23:59:59`, naive (no `Z`). Used by invoices, utilities, expenses and the admin payments list. **Booking dates are the exception**: create, edit and the host booking filters send plain `YYYY-MM-DD`, which the server reads in the hostel's `timezone` (`apps/web/src/app/features/host/bookings/host-bookings-api.ts`).
- **Hostel time zone** is a required IANA field on create, pre-filled from `browserTimeZone()`.
- **Prices**: search results are quoted in the visitor's currency using the index's per-currency hashes (`currency_price_hash`, `apps/web/src/app/services/listings-api.ts`), with fallback to the hostel's own currency. Amounts render through `money`, which groups for the active language and shows decimals only when the amount has any.
- **Currency preference**: `GeoPreference.apply()` sets language and currency from the IP country on startup and after every `/api/users/current`, but never overrides a choice the visitor made (`hh.currency.chosen`, `hh.locale.chosen`). It uses raw `fetch` to Cloudflare trace / `api.country.is` so the bearer token never leaves for a third party.

## Reuse, don't rebuild
- `apiDate` for API values; the stock `date` pipe only for locally built dates (picker state, `new Date()`).
- `dayRangeStart/End` for every non-booking date range. Never inline `+ 'T00:00:00'`.
- `money` + `currencySym` for display; `<hh-money-input>` for entry; `<hh-currency-select>` / `<hh-timezone-select>` for pickers.
- Carry a `Price` (amount + period), not a bare number; derive the period from `billing_frequency` first (`periodFromBillingFrequency`), then `periodForAccommodation`.

## Traps
- **Dead code**: since PR #42, `zonedWallTimeToUtc`, `localDateAtWallTime` and `country-time-zones.ts` have no importers outside their specs. Plain-day booking replaced them; don't revive them for bookings. `todayIn` in the same file is live: console screens read it through `services/hostel-today.ts` ([decision](../decisions/host-console/console-today-is-the-hostels-date.md)).
- **"Today" in the host console is the hostel's date.** A screen reads it with `selectedHostelToday()` (or `hostelZone(id)` for a hostel other than the selected one) from `services/hostel-today.ts`, never `new Date()`; a form default seeded before the zone lands moves with `followToday` only while untouched. The shared pickers (`hh-date-picker`, both `hh-date-range-picker`s) know no hostel: pass `[today]`, or they fall back to the device. The stay flow (room calendar, tenant availability, bookings calendar, booking form, overview strip, tenant leave count) follows the same rule (Trello #166, #182). So does the tenant joining date **and time**: a naive wall-time default takes `wallClockIn(zone, now)` from `util/zoned-time.ts`, the hostel's clock to the minute, not `todayIn` plus the device's hours (Trello #190).
- **Never `new Date('yyyy-MM-dd')` for a plain day.** It parses as UTC midnight, a day early anywhere west of UTC. Never divide a millisecond difference by 86 400 000 to count days either, because it miscounts across a DST change. Use `util/plain-day.ts`.
- **Backend caveat**: `search_helper.rb`'s `gte/lte` branch ignores `time_zone`, so plain-day booking *filters* are read as UTC and day-edge bookings in non-UTC hostels can be off by one (noted in PR #42's description).
- **`formatPrice` ignores currency** — it always uses the default symbol (`Rs`) and has no callers today; `formatAmount` and `formatPriceCompact` take one. Both group with `en-PK`, not the active language, unlike `money`.
- **`<hh-money-input>` always groups with `,`** regardless of language.
- **`CurrencyPreference`'s doc comment is stale**: it says the preference never restates existing prices because the app has no exchange rates; search now does exactly that from server-converted hashes.
- **`app.config.ts` says the country is "authoritative and re-asserted on every start"**; `GeoPreference` defers to an explicit choice. The class is right.
- `discounted_price` of `0` means no discount, not free (`listings-api.ts`).
- Without a `LOCALE_ID` provider Angular formatters are always `en-US`; that is why `money` uses `Intl` with `LocaleStore` (`apps/web/src/app/core/i18n/locale-store.ts`).

## Decisions
- [API timestamps render in the offset the backend sent](../decisions/dates-money-and-time-zones/render-api-timestamps-in-their-own-offset.md)
- [Admin billing shows dates in UTC](../decisions/dates-money-and-time-zones/admin-billing-dates-in-utc.md)
- [Date-range filters send naive whole-day bounds](../decisions/dates-money-and-time-zones/date-range-filters-send-naive-day-bounds.md)
- [Booking dates travel as plain days in the hostel's zone](../decisions/dates-money-and-time-zones/booking-dates-sent-as-plain-days.md)
- [Money shows decimals only when the amount has them](../decisions/dates-money-and-time-zones/money-decimals-follow-the-amount.md)

## See also
- [api-and-data](./api-and-data.md), [listing-and-booking](./listing-and-booking.md), [host-billing-and-subscription](./host-billing-and-subscription.md), [i18n](./i18n.md), [search-and-discovery](./search-and-discovery.md), [maps](./maps.md)
- `docs/api/hostelhive-api.md`
