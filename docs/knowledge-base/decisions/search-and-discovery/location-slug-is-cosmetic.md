# The `/search/:location` slug is cosmetic; coordinates in the query drive the map

**Status:** Accepted
**Area:** [search-and-discovery](../../area/search-and-discovery.md)

## Context

Searches used to produce `/search?place=Karachi&lat=…&lng=…`. A readable `/search/karachi` was wanted, but places come from a geocoder and can be anything ("Gulberg", "DHA Phase 5"), so a slug cannot in general be turned back into a location.

## Decision

- The slug is decoration. `SearchBar.search()` navigates to `searchRouteFor(place)` and still sends `place`, `lat`, `lng`, `zoom` as query params; those drive the query and camera.
- Only when the URL carries a slug and **no** coordinates (a pasted link) does `resolveSearchSlug` look it up in `PLACES` and `UNIVERSITIES` (city zoom 11, campus zoom 13). An uncurated slug searches country-wide.
- `toLocationSlug` folds diacritics (`Multān` → `multan`); a name with no Latin letters yields no slug and falls back to bare `/search`.
- The viewport is mirrored as `ne_lat/ne_lng/sw_lat/sw_lng` with `replaceUrl`, so refresh and shared links reproduce the view without adding history entries.

## Alternatives rejected

- **A slug → coordinates resolver for every slug.** Unnecessary while coordinates travel in the query, and breaks arbitrary places (`location-slug.ts`, `search.routes.ts`).
- **Geocode an unknown pasted slug.** A network round trip before first paint to maybe place a slug; a wide but honest search was judged the better trade (commit `2e6c9c3` body, `search-slug.ts`).
- **Put `zoom` in the viewport keys.** `zoom` already means "zoom implied by the searched place type" and is consumed with `center` (`search-map.ts` comment above `NE_LAT`).

## Consequences

- Never resolve a slug when `lat`/`lng` are present; explicit coordinates win (`slugPlace` in `search-map.ts`).
- `/search/map` must stay declared before `:location`, or "map" is read as a place.
- The heading falls back through `place` → curated name → unslugified slug → framed country → "Pakistan".
- **The canonical follows the query's place too** (`canonicalPlace`: `toLocationSlug(place || city)`, then the slug). The slug used to win there, so a pick that kept an old slug (`/search/lahore?place=Karachi…`) canonicalised to `/hostels/lahore`. Links shared before that fix still carry such slugs, which is why the query takes precedence rather than the slug being trusted (PR #86).
- A new place always gets its own slug (`searchRouteFor` via `SearchMap.startSearch`), so new URLs no longer pair one place's slug with another's query.

## Evidence

- `apps/web/src/app/util/location-slug.ts`, `apps/web/src/app/features/public/landing/search-slug.ts`, `apps/web/src/app/features/public/search/search.routes.ts`
- `apps/web/src/app/layout/components/search-bar/search-bar.ts` (`search()`, `syncPlace()`)
- PR #29; commit `2e6c9c3` fix(search): scope a pasted /search/<slug> to the place it names
