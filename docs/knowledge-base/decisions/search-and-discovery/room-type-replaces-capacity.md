# Search filters by private/shared room type, with no "Any", and drops price sort over mixed pricing cycles

**Status:** Accepted
**Area:** [search-and-discovery](../../area/search-and-discovery.md)

## Context

Search used to filter by bed capacity (1–5+ sharing) from the header bar and the modal, and offered a Frequency filter so price sort compared like with like. Seekers do not shop by headcount; they choose a room to themselves or a bed among others, and the two are priced in different units (per room vs per bed).

## Decision

- The capacity filter became `roomType` = `shared` | `private`, sent as `f[room_types.occupancy_type]`. There is no "Any": an absent param means `shared` (`DEFAULT_OCCUPANCY_TYPE`), and the default does not count as an active filter.
- The header bar's third segment became Accommodation (boys / girls / co-living / backpacker); retired params `capacity`, `sharing`, `frequency` are cleared on every search.
- Price sort is only offered once an accommodation type is chosen, because only backpacker hostels are nightly (`periodForAccommodation`); "All" mixes nightly and monthly figures. `SearchBar.search()` strips a `price-*` sort when returning to All.

## Alternatives rejected

- **Keep capacity tiers.** "Capacity was never the axis anybody shopped on" (`search-filter-modal.ts`, `search-bar.ts`).
- **An "Any" room type.** Mixed per-bed and per-room prices into one sorted list of numbers that did not mean the same thing (`search-filter-modal.ts` `ROOM_TYPES`).
- **A separate Frequency filter.** Asked the seeker something their accommodation choice already decides; removed (`search-filters.ts` `sortOptions`).
- **Flat `f[room_type]`.** Named a field the document does not have, so it matched nothing (`listings-api.ts`).

## Consequences

- **An unknown `roomType` reads as the default, shared.** `mergeSearchParams` discards a value outside `OCCUPANCY_TYPES`, rather than sending it as a filter that matches nothing. The backend's own `private_room` is read as `private`. The index stores `private_room`, so `ListingsApi.list` translates `private` at the boundary (`OCCUPANCY_WIRE_VALUE`). Before that, the Private room filter matched nothing live (Trello #176, #183).
- **The rule now has one home and holds on every way in.** `sortsFor`/`isSortOffered` (`search-sort.ts`) decide what is offered. The Filters modal follows them (PR #141). A link that carries a sort the type doesn't offer is read as absent by `mergeSearchParams` and taken out of the URL (Trello #171). See the area file.
- `SearchCapacity` survives but nothing sets its `active` signal, so per-capacity card pricing is dormant.

## Evidence

- `apps/web/src/app/features/public/search/search-filters/search-filters.ts`, `apps/web/src/app/features/public/search/search-filter-modal/search-filter-modal.ts`, `apps/web/src/app/layout/components/search-bar/search-bar.ts`
- `apps/web/src/app/util/occupancy-type.ts`, `apps/web/src/app/services/listings-api.ts`
- Commit `98d10cb` feat(booking): room picker, basket, and the screens around a booking (search section of its body); PR #31
