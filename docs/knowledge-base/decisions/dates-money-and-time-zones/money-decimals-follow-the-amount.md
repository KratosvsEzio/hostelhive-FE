# Money shows decimals only when the amount has them

**Status:** Accepted
**Area:** [dates-money-and-time-zones](../../area/dates-money-and-time-zones.md)

## Context
Two price formats sat side by side in one viewport: `toLocaleString()` gave "Rs 1,200" and `number: '1.2-2'` gave "Rs 10,000.00". Nobody quotes PKR in paisa, and the extra characters wrapped the room card's price at 375 px. Separately, nothing provides `LOCALE_ID` or calls `registerLocaleData`, so Angular's number formatting was always `en-US`, and German pages showed "10,000", which a German reader parses as ten.

## Decision
The `money` pipe rounds to 2 places, then shows 0 decimals for a whole amount and 2 otherwise. It formats with `Intl.NumberFormat` in `LocaleStore.active()`, not Angular's `formatNumber`. It is pure; a language switch navigates and rebuilds the component, so prices reformat.

## Alternatives rejected
- **Fixed `'1.0-0'`**: the app carries 76 currencies and `currencies.ts` has no minor-unit data, so $12.50 would render as $13.
- **A minor-units table per currency**: unnecessary; keying on the amount gets both cases right.
- **Angular `formatNumber` with a real `LOCALE_ID`**: needs every locale's data bundled; `Intl` already has them.
- **No rounding before the integer check**: floating sums (`8300.000000000002`) would render "8,300.00" under line items reading "8,300".

## Consequences
- Use `money` for every displayed amount. `formatAmount`/`formatPriceCompact` in `apps/web/src/app/util/pricing-period.ts` and `<hh-money-input>` still group the old way (`en-PK` / a hard-coded comma), an inconsistency on non-English pages.
- The pipe renders the number only; the symbol comes from `currencySym`.

## Evidence
- `apps/web/src/app/shared/currency/money.pipe.ts` and `apps/web/src/app/shared/currency/money.pipe.spec.ts`
- `apps/web/src/app/core/i18n/locale-store.ts`
- 117318c feat(booking): book a room against the real endpoint, on the hostel's clock (introduced the pipe)
