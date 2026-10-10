# Photon for place typeahead, Nominatim for reverse geocoding

**Status:** Accepted
**Area:** [maps](../../area/maps.md)

## Context
After Google Places was dropped, place search ran on OpenStreetMap's Nominatim, which is also used to turn the location picker's pin into an address. Nominatim's public endpoint is fair-use at about one request a second, and it is tuned for accuracy rather than search-as-you-type.

## Decision
`hh-place-search` queries **Photon** (Komoot) with a debounce, a minimum query length of three characters, and an optional proximity bias (`lib/src/maps/lib/photon.ts`, `lib/src/maps/lib/place-search.ts`). **Nominatim** is kept for reverse geocoding in `hh-location-picker` (`nominatimReverse`, `lib/src/maps/lib/nominatim.ts`). Both are called with raw `fetch`, never `HttpClient`, so the app's auth interceptor cannot attach the user's Bearer token to a third-party host.

## Alternatives rejected
- **Nominatim for typeahead.** Slower, fewer candidates per query, and its fair-use rate is shared across every visitor. Replaced in 0cb5057.
- **Google Places autocomplete.** Billed per request, and its stock widget could not be styled to the brand.
- **Restricting results to Pakistan.** The typeahead searches the whole world because listings are not limited to the visitor's country. Ambiguity is handled by `PlaceSearchBias` (the visitor's country centre) instead (`lib/src/maps/lib/place-bias.ts`).
- **Geocoding the visitor's country at page load.** That would put a third-party request on the path to first paint, and Nominatim's limit is shared by all visitors. A bundled bbox table is used instead (`apps/web/src/app/core/geo/country-bounds.ts`).

## Consequences
- Both services are public, shared instances. At scale the plan in the code comments is to self-host (or use a paid host) by changing `BASE` and nothing else.
- Suggestions are cached in memory for the session, keyed by query and type filter (`lib/src/maps/lib/place-cache.ts`).
- Photon is called with `lang: 'en'`, so suggestions stay English in every locale.
- The header of `lib/src/maps/lib/nominatim.ts` still says `nominatimSearch` backs the typeahead. It no longer does.

## Evidence
- 0cb5057 feat: Photon geocoder, location picker z-index fix, mess confirmations room column, and misc fixes (PR #4)
- `lib/src/maps/lib/photon.ts`, `lib/src/maps/lib/nominatim.ts`, `lib/src/maps/lib/location-picker.ts`, `lib/src/maps/lib/photon.spec.ts`
