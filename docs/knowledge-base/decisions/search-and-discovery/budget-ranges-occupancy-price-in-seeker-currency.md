# The budget filter ranges the selected occupancy's "from" price, in the seeker's currency

**Status:** Accepted
**Area:** [search-and-discovery](../../area/search-and-discovery.md)

## Context

The search document carries two "from" prices per hostel (`shared_occupancy_price_from`, `private_occupancy_price_from`), each with a `currency_price_hash` keyed by ISO-4217. The earlier filter, `f[starting_price][gte|lte]`, was one unit-less number that compared rupees against dollars, and a private-room search was ranged over the dorm price.

## Decision

- `ListingsApi.list` sends `f[<occupancy>_occupancy_price_from.currency_price_hash.<CODE>][gte|lte]`, where `<occupancy>` follows the `roomType` filter (default `shared`) and `<CODE>` is `CurrencyPreference.code()`.
- `OCCUPANCY_PRICE_FIELD` is a `Record<OccupancyType, string>` so a third occupancy type fails the build instead of silently using the shared price.
- The budget slider (`BUDGET_MIN` 0, `BUDGET_MAX` 50,000 meaning "no upper bound", `BUDGET_STEP` 1) is one scale shared by the header bar and the filter modal, labelled in the seeker's currency symbol.
- Switching currency re-runs the search (`currency` is part of the emitted object in `SearchMap.result`).

## Alternatives rejected

- **`f[starting_price]`**: unit-less, and the field was dropped from the document (`listings-api.ts` comments).
- **Range the shared price for every search**: returns hostels whose dorms fit while their private rooms cost several times the ceiling, "a worse answer than no results" (`OCCUPANCY_PRICE_FIELD` doc).
- **Different ceilings per control** (50,000 vs 60,000): the modal could produce a value the bar could not show (`budget-range.ts`).
- **Step 1,000**: made nightly backpacker prices (roughly Rs 400–3,000) indistinguishable (`budget-range.ts`).

## Consequences

- The typed figure is read in the currency the seeker thinks in, but a hostel with no rate for that code in its hash will not match a range in it.
- Price **sort** still sends `sort[starting_price]` — not migrated with the filter (see Traps in the area file).

## Evidence

- `apps/web/src/app/services/listings-api.ts` (`OCCUPANCY_PRICE_FIELD`, `resolvePrice`, budget block in `list()`)
- `apps/web/src/app/util/budget-range.ts`, `apps/web/src/app/core/preferences/currency-preference.ts`
- Commit `a9e254e` feat(i18n): key every static string in the app's screens (carries the currency picker and the search rebuild on currency change)
