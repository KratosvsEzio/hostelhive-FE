# Search and discovery

How a seeker finds hostels: the header search bar, the `/search` list + map page, its filters, the listing card, and the curated SEO landing pages (`/hostels/:place[/:gender]`) that embed the same search. Ends where a card is clicked — the hostel page is [listing-and-booking](./listing-and-booking.md). The home page's own sections are [landing-page](./landing-page.md).

## Where it lives
- `apps/web/src/app/features/public/search/search.routes.ts` — `/search`, `/search/:location`, and the `/search/map` → `/search` redirect.
- `apps/web/src/app/features/public/search/search-map/search-map.ts` — `SearchMap`: the whole results page (card column, Leaflet map, mobile bottom sheet, infinite scroll, SEO head).
- `apps/web/src/app/features/public/search/search-filters/search-filters.ts` — filter bar: room-type dropdown, quick amenity chips, Sort, "Filters" button.
- `apps/web/src/app/features/public/search/search-filter-modal/search-filter-modal.ts` — full filter sheet (draft state, emits `FilterState` on apply).
- `apps/web/src/app/features/public/search/search-params.ts` — `mergeSearchParams` (the seed-under-query merge every filter reader goes through) and `isAccommodationType`.
- `apps/web/src/app/features/public/search/listing-card/listing-card.ts` — `hh-listing-card`, also used by the account Favorites page.
- `apps/web/src/app/layout/components/search-bar/search-bar.ts` — header Where · Budget · Accommodation bar.
- `apps/web/src/app/features/public/landing/` — `place-landing.ts` (page), `places.ts` (`PLACES`, `GENDER_SEGMENTS`), `gender-routes.ts` (`genderRoutesFor`), `universities.ts`, `place-faqs.ts`, `search-slug.ts` (`resolveSearchSlug`), `sitemap-urls.ts` (served by `apps/web/src/server.ts`).
- `apps/web/src/app/services/listings-api.ts` — `ListingsApi.list()` and `toListing()` (the `/public/hostels` → `Listing` mapper).
- `apps/web/src/app/services/search-capacity.ts`, `apps/web/src/app/services/offers-api.ts`.
- `apps/web/src/app/util/location-slug.ts`, `apps/web/src/app/util/budget-range.ts`, `apps/web/src/app/util/accommodation-type.ts`, `apps/web/src/app/util/occupancy-type.ts`.

## How it works
- **URL is the state.** Every control writes query params with `router.navigate([], { queryParamsHandling: 'merge' })`: `place`, `city`, `lat`, `lng`, `zoom`, `gender`, `propertyType`, `roomType`, `minPrice`, `maxPrice`, `amenities` (comma list of slugs), `sort`, `everywhere` (worldwide search, below), and the viewport `ne_lat/ne_lng/sw_lat/sw_lng`. `SearchMap.query()` derives the request from them and compares by `JSON.stringify`, so writing the viewport back into the URL does not refetch.
- **Request pipeline** (`SearchMap.result`): `debounceTime(600)` → `ListingsApi.list` via `switchMap`; page 1 replaces, later pages append (deduped by id) through an `IntersectionObserver` sentinel. A 429 starts a 60 s cooldown that suppresses new queries; a 5xx/network error shows an inline "Try again".
- **Geography priority** in `ListingsApi.list`: map `bounds` → `near` (lat/lng ± radius) → whole world. With no place in the URL, `setup()` frames the visitor's country (`CountryBounds.forVisitor`, `apps/web/src/app/core/geo/country-bounds.ts`); "Search everywhere" (`searchEverywhere()`) drops every geographic constraint.
- **Filter contract sent to `GET /public/hostels`** (as coded in `listings-api.ts`): `f[bounding][north|south|east|west]`, `s[city]` (full-text fallback), `f[gender_type]` (`co-living|boys|girls|backpacker`), `f[property_type]`, `f[room_types.occupancy_type]` (`shared|private`), `f[<shared|private>_occupancy_price_from.currency_price_hash.<CODE>][gte|lte]`, `f[offers.id][]`, `sort[created_at|starting_price]=asc|desc`, `page`, `limit`.
- **Prices on cards**: `toListing` picks the requested occupancy's "from" block, falls back to the other occupancy, then to the hostel's own currency; `discounted_price: 0` means "no discount".
- **Landing pages** render `<hh-search-map [seed] [genderRoutes]>`; `seed` sits *under* the query params in `SearchMap.params()` (`mergeSearchParams`, `search-params.ts`), so a visitor's own filter wins. When seeded, `SearchMap` leaves the `<head>` to `PlaceLanding`.
- **One reader of filter state.** `SearchMap.params()` is the only place the URL and the seed are read; `SearchFilters` gets it through its required `params` input (`search-filters.ts`) and never reads `ActivatedRoute` for filters itself. A query `gender` counts only if `isAccommodationType` accepts it — an unknown or empty value is treated as absent, so a landing page's own type applies.
- **Changing the type on a gender page changes the page.** `PlaceLanding.genderRoutes` (`genderRoutesFor`, gender pages only) maps every type to its URL: Any type → `/hostels/<place>`, girls/boys/co-living → the sibling page, backpacker → `/hostels/<place>?gender=backpacker`. `SearchFilters.onApply` goes there in one localised navigation (`localiseCommands`, `queryParamsHandling: 'merge'`). City, campus and `/search` pages pass no routes and keep the query merge. See decisions.
- **On a landing page, any change of geography leaves for `/search`.** A place pick (`onPlaceSelected`), Near me (`locateMe`) and "Search everywhere" (`searchEverywhere`) go through `SearchMap.startSearch`: one localised push navigation, to `/search/<slug>`, `/search?place=My location` or `/search?everywhere=1`. It merges the visitor's filters plus the page's own filters as explicit params (`seededFilters`), and nulls the viewport, place and retired keys (`search-scope.ts`).
- **A new place is a new search, on every page.** The place pick and Near me always use `startSearch`. On `/search` too, they go to `searchRouteFor(label)` rather than merging on the current path. The header bar's `search()` also nulls the viewport keys. Old `ne_*/sw_*` would otherwise be restored by a newly built `SearchMap` (the viewport is read once, at construction) over the new place. Only "Search everywhere" on `/search` itself still merges, with `replaceUrl`.
- **The canonical follows the query's place.** `canonicalPlace` prefers `toLocationSlug(place || city)` over the path slug, so links shared with a stale slug canonicalise correctly. A pasted `/search/lahore` with no query still maps to `/hostels/lahore`.
- **`/search` has no static route `title`.** The SEO effect owns the tab title; Angular's title strategy would otherwise re-apply the static one after every navigation, including viewport writes (`search.routes.ts`).
- **Landing pages clear their JSON-LD on destroy.** `PlaceLanding` removes `place-breadcrumb` / `place-faq` through `Seo.clearOnDestroy` (the same helper home, blog, blog article and listing use). This is safe for SSR because the server serialises the document before destroying the platform. `apps/web-e2e/src/search-new-place-and-landing-head.spec.ts` checks the raw HTML.
- **Worldwide search is a URL state, `everywhere=1`** (`EVERYWHERE_KEY`). A bare `/search` frames the visitor's own country (`setup()`), so worldwide needs saying.
  - It is read once at construction (`everywhereInUrl`; `unbounded` is a `linkedSignal`, false whenever there is a seed). Explicit `lat`+`lng` beat it, but a slug-only centre doesn't narrow the request (`query()`).
  - `syncBoundsToUrl` mirrors it, and it is the only writer. A pan (`leftHomeCountry`), a new place (`recenterTo`) or a header search (`SearchBar.search()`) clears it.
  - Back within `/search` doesn't re-apply it, like the viewport keys.
- **SEO**: unfiltered search for a curated place → canonical `/hostels/<slug>`; filtered, uncurated or "everywhere" → `noindex` with no canonical, `og:url` only when a path is set (`Seo.apply`; before Trello #131 it canonicalised to home). See decisions.

## Reuse, don't rebuild
- `toListing()` for any `/public/hostels`-shaped payload (`favourites-api.ts` already does).
- `searchRouteFor(place)` to navigate to a search; `resolveSearchSlug` / `findPlace` / `findUniversity` for curated places.
- `BUDGET_MIN/MAX/STEP` — the bar and the modal must share one scale.
- `ACCOMMODATION_LABELS` / `ACCOMMODATION_LABEL_KEYS` instead of a gender ternary; `isAccommodationType` (`search-params.ts`) to validate a `gender` value; `isOccupancyType`, `DEFAULT_OCCUPANCY_TYPE`.
- `mergeSearchParams` for any filter reading — never a second `queryParamMap` subscription; `genderRoutesFor` for where a type lives, seen from a gender page.
- `search-scope.ts` — `VIEWPORT_KEYS_NULLED`, `PLACE_KEYS_NULLED`, `RETIRED_KEYS_NULLED`, `EVERYWHERE_KEY`, `seededFilters` — whenever a navigation changes place or leaves a landing page.
- `apps/web-e2e/src/support/stubs.ts` (`stubListings`, `stubPhoton`) for e2e: the app sends credentials, so a listings stub must echo the origin; a wildcard puts the page in its error state.
- `OffersApi.categories()` is cached app-wide; don't fetch `/api/offer_categories` yourself.
- `hh-listing-card` for any listing tile.

## Traps
- **A seeded key can be overridden by the query but never removed by it** — writing `null` falls back to the seed. Every action that changes the type or the geography on a landing page therefore changes page (above). A new action that writes a seeded key must do the same.
- **The header bar re-reads its place from the URL on every query change**, so the map's settle writes can undo a place picked but not yet submitted (Trello #130).
- **`Seo.apply` always writes a canonical** (`path ?? '/'`), so a `noindex` search currently canonicalises to the home page, contrary to the curated-landing-pages decision (Trello #131).
- **"Search everywhere" then a pan on `/search/<slug>`** brings the slug back as the heading and canonical (Trello #128).
- **`SearchCapacity.active` is never set** anywhere — capacity pricing in `listing-card.ts` and the map pins always falls back to `priceFrom` (`apps/web/src/app/services/search-capacity.ts`). `SearchBar` still injects it unused.
- **Price sort is withdrawn for "All"** in `search-filters.ts` (`sortOptions`), stripped by `SearchBar.search()` and dropped by `SearchFilters.onApply`, but `search-filter-modal.ts` always offers both price sorts, so one chosen there with "Any type" is silently dropped (Trello #112).
- **`sort[starting_price]`** is still what price sort sends, while `listings-api.ts` documents `starting_price` as dropped from the search document. Verify before trusting price order.
- **Stale comment**: `search-filters.ts` says room type is "inert server-side until the backend indexes `room_type`"; `listings-api.ts` now sends `f[room_types.occupancy_type]`.
- **Amenity filter depends on an authed endpoint.** Slugs map to ids via `/api/offer_categories` (`offers-api.ts` notes it is authed); if that fails the map is empty and `offerIds` is silently omitted (`search-map.ts` `_slugToId`).
- **Zero-area boxes** (`hasArea`) must never be queried or written to the URL — Leaflet returns one before layout.
- The header bar reads the `:location` slug only, so it shows no place on `/hostels/:place` pages (`search-bar.ts` `routedLocationSlug`). It reads `?gender=` itself (validated with `isAccommodationType`) because it sits outside `SearchMap`.
- `/hostels/:place/:gender` serves both gender segments and campus slugs; gender wins (`place-landing.ts` `segment`). Backpacker has no segment.

## Decisions
- [Curated landing pages own each place; /search defers to them](../decisions/search-and-discovery/curated-landing-pages-own-place-intent.md)
- [The /search/:location slug is cosmetic; coordinates drive the map](../decisions/search-and-discovery/location-slug-is-cosmetic.md)
- [Budget ranges the occupancy's "from" price in the seeker's currency](../decisions/search-and-discovery/budget-ranges-occupancy-price-in-seeker-currency.md)
- [Search filters by private/shared room type, never "Any"](../decisions/search-and-discovery/room-type-replaces-capacity.md)
- [A gender landing page changes page, not query, when the type changes](../decisions/search-and-discovery/gender-pages-change-page-not-query.md)

## See also
- [maps](./maps.md) — `SharedMap`, `PlaceSearchField`, geolocation
- [ssr-seo-and-prerender](./ssr-seo-and-prerender.md) — `Seo`, sitemap, robots
- [dates-money-and-time-zones](./dates-money-and-time-zones.md) — `CurrencyPreference`, pricing periods
- [i18n](./i18n.md) — locale-prefixed URLs
- [api-and-data](./api-and-data.md) — `ApiClient`, `ApiError`
- `docs/api/hostelhive-api.md` (Core ▸ Hostel), `docs/RISKS.md` (R7)
