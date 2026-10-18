# A gender landing page changes page, not query, when the type changes

**Status:** Accepted
**Area:** [search-and-discovery](../../area/search-and-discovery.md)

## Context

`/hostels/<place>/<girls|boys|co-living>` holds its accommodation type in the path: `PlaceLanding` passes it into the search as a `seed`, and the page's H1, breadcrumb, FAQ and canonical all name it. A query merge can override a seeded key but never remove it, because `null` falls back to the seed. So on `/hostels/lahore/girls` the filter row showed "Any type" above a girls-only list, and choosing "Any type" changed nothing (Trello #106, PR #58).

## Decision

- **One reader.** `SearchMap.params()` (`mergeSearchParams`, `apps/web/src/app/features/public/search/search-params.ts`) is the only place filter state is read. `SearchFilters` gets it as a required input and does not read the route itself.
- **A gender page moves to the page for the new type.** `genderRoutesFor` (`apps/web/src/app/features/public/landing/gender-routes.ts`) maps every type to its URL. Only a gender page gets routes; city, campus and `/search` pages keep the query merge, because their path says nothing about the type.

  | Type | URL |
  |---|---|
  | Any type | `/hostels/<place>` |
  | girls / boys / co-living | `/hostels/<place>/<segment>` |
  | backpacker (no page of its own) | `/hostels/<place>?gender=backpacker` |

- **One localised navigation per apply.** It is built with `localiseCommands` and `queryParamsHandling: 'merge'`, so the other filters and the language prefix carry over (`SearchFilters.onApply`). A price sort is dropped when the result is "Any type". The map's viewport is not in a landing page's URL; it stays in memory ([landing pages are their place](./landing-pages-are-their-place-not-a-view.md)). A move to a sibling gender page reuses the page (same route config) and keeps the visitor's view; "Any type" and backpacker go to `/hostels/<place>`, a different route config, which rebuilds the page and reopens it on the place.
- **An unknown or empty `?gender=` is treated as absent** (`isAccommodationType`), so a malformed link falls back to the page's own type rather than contradicting it. As a result, `?gender=all` on a gender page now means that page's type.
- **The rule behind all of it:** the H1 may be broader than the list ("Hostels in Lahore" over girls-only results is true), but must never contradict it.

## Alternatives rejected

- **Write `gender=all` into the query to override the seed.** It works end to end, but it puts every type under the "Girls hostels in Lahore" H1, FAQ and canonical: a page that contradicts itself.
- **Send Backpacker to `/search/<place>`** (the ticket's other suggestion). The same choice made on the plain city page already lands on `/hostels/<place>?gender=backpacker`. Two URLs for one state, and the visitor loses the landing context.
- **Relative `'..'` navigation off the gender route.** `hostels/:place/:gender` also serves campus slugs (`place-landing.ts` `segment`), so "up one level" is not reliably the city page. Absolute paths are used instead.
- **Give `SearchFilters` the seed and merge it there too.** That is two readers kept in sync by hand, which is how the bug arose.
- **Jump to a sibling page from the plain city page too** (`/hostels/lahore` + Girls → `/hostels/lahore/girls`). Consistent, but it changes a page the ticket said to leave alone. Not done; a possible follow-up.

## Consequences

- Changing between gender pages reuses `PlaceLanding` (same route config), so the seed updates live. Moving to the city page rebuilds it and the map loads again, as the existing sibling links already do.
- Each type change pushes a history entry; Back returns to the previous page (`apps/web-e2e/src/landing-gender-filter.spec.ts`).
- **Extended to geography (Trello #110, #109, PR #73).** The same flaw hit every action that changes place on a landing page: the mobile place field showed Karachi under "Girls hostels in Lahore", "Near me" did the same, and "Search everywhere" never widened. The rule is now general: **on a landing page, any change of geography leaves for `/search`** (`SearchMap.leaveLanding`), carrying the page's own filters as explicit params (`seededFilters`) and dropping the old viewport. Rejected there:
  - **curated landing pages as the destination** (`/hostels/karachi/girls`): geocoder labels don't map reliably onto curated places;
  - **staying on the landing page with the geography dropped**: the heading would contradict the list.
- **"Everywhere" became a URL key (`everywhere=1`)**, because a bare `/search` frames the visitor's own country. Rejected:
  - navigation `state`: not shareable, not seen by SSR;
  - a world `ne/sw` box: Leaflet clamps it, and the heading is wrong;
  - navigating to bare `/search`: country framing.
- Back within `/search` doesn't re-apply `everywhere=1`, because the key is read once at construction, as the viewport keys are. Accepted by the user.

## Evidence

- `apps/web/src/app/features/public/search/search-params.ts`, `apps/web/src/app/features/public/landing/gender-routes.ts`, `apps/web/src/app/features/public/search/search-filters/search-filters.ts` (`params`, `genderRoutes`, `onApply`), `apps/web/src/app/features/public/search/search-map/search-map.ts` (`params`), `apps/web/src/app/features/public/landing/place-landing.ts` (`genderRoutes`)
- Tests: `search-params.spec.ts`, `gender-routes.spec.ts`, `search-filters.spec.ts`, `apps/web-e2e/src/landing-gender-filter.spec.ts`
- PR #58 (KratosvsEzio/hostelhive-FE); run notes `docs/implement/Bugs/106.md` (decisions D2–D11)
- Geography extension: `apps/web/src/app/features/public/search/search-scope.ts`, `search-map.ts` (`leaveLanding`, `everywhereInUrl`, `query()`, `syncBoundsToUrl`), `apps/web/src/app/layout/components/search-bar/search-bar.ts`; tests `search-scope.spec.ts`, `search-map.spec.ts`, `apps/web-e2e/src/landing-place-and-everywhere.spec.ts`; PR #73; run notes `docs/implement/Bugs/110.md` (decisions D1–D10)
