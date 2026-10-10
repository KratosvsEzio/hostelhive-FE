# Maps

Everything geographic on the client: the `@hostelhive/maps` library (Leaflet loader, basemap tiles, place search and geocoding, the location picker, the static map, geolocation), the boundary and country-frame data shipped under `apps/web/public/geo/`, and the scripts that build them. How search uses the map lives in [search-and-discovery](./search-and-discovery.md). How the visitor's country is resolved lives in `apps/web/src/app/core/geo/` (shared with [i18n](./i18n.md)).

## Where it lives
- `lib/src/maps/index.ts` — the `@hostelhive/maps` barrel.
- `lib/src/maps/lib/leaflet.ts` — `LeafletLoader` (browser-only dynamic `import('leaflet')`), `LEAFLET_MAPS_CONFIG`, `provideLeafletMaps`, `withCartoKey`, `brandPinIcon`, `whenSized`.
- `lib/src/maps/lib/shared-map.ts` — `SharedMap`, one Leaflet map kept alive across routes (single borrower: `acquire`/`listen`/`release`).
- `lib/src/maps/lib/place-search.ts` — `hh-place-search` (`PlaceSearchField`) typeahead on Photon. Supporting files: `lib/src/maps/lib/photon.ts`, the root-level `PlaceSuggestionCache` in `lib/src/maps/lib/place-cache.ts`, and the visitor-proximity tiebreak in `lib/src/maps/lib/place-bias.ts`.
- `lib/src/maps/lib/location-picker.ts` — `hh-location-picker`: search, draggable pin, "use my location", and Nominatim reverse geocoding (`lib/src/maps/lib/nominatim.ts`). Emits `PickedLocation`.
- `lib/src/maps/lib/static-map.ts` — `hh-static-map`, a read-only single pin.
- `lib/src/maps/lib/geolocation.ts` — `GeolocationService` (Capacitor plugin on device, browser API on web).
- `apps/web/public/geo/` — pak-adm0.json … pak-adm3.json (TopoJSON, geoBoundaries gbOpen) and country-bounds.json (ISO-2 → `[w,s,e,n]`).
- `tools/build-pak-geo.mjs` — fetches the pinned geoBoundaries release, simplifies with mapshaper, writes the `pak-adm*.json` files.
- `tools/build-country-bounds.mjs` — Natural Earth 1:50m → largest-landmass bbox per country.
- `tools/generate-maps-env.mjs` — `.env` `CARTO_BASEMAP_KEY` → the git-ignored, generated apps/web/src/app/maps.env.ts (Nx target `sync-maps-env`; it is absent until the target has run).
- `apps/web/src/app/core/geo/country-bounds.ts` — `CountryBounds.forVisitor()` and `centreOf`.

## How it works
- **Tiles.** CARTO Voyager raster (roadmap), plus Esri World Imagery for the picker's satellite toggle. `apps/web/src/app/app.config.ts` calls `provideLeafletMaps(withCartoKey(mapsEnv.cartoApiKey))`. With an empty key the map still draws, with every tile watermarked (`lib/src/maps/lib/leaflet.ts`).
- **SSR.** Leaflet touches `window`, so every caller awaits `LeafletLoader.load()` from `afterNextRender`, and `load()` throws on the server. `whenSized` waits for a non-zero box (or 2 s) before construction; on mobile the map pane is `display:none` until opened.
- **Where maps appear:**
  - Search split view: `apps/web/src/app/features/public/search/search-map/search-map.ts`, borrowing `SharedMap`.
  - Explore-{country} map (deferred `on viewport`): `apps/web/src/app/features/public/home/country-map/country-map.ts`. Pakistan drills province → district → tehsil from bundled TopoJSON; other countries get one level of ADM1 regions fetched from geoBoundaries (`country-map/country-boundaries.ts`, which rewrites the GitHub raw link to `media.githubusercontent.com` because the redirect fails CORS).
  - Listing location: `hh-static-map` in `apps/web/src/app/features/public/listing/listing-detail/listing-detail.ts`.
  - Location picker: `apps/web/src/app/features/host/hostel-form/hostel-form.ts` and `apps/web/src/app/features/public/onboarding/onboarding-wizard/onboarding-wizard.ts`.
  - Header and hero typeahead: `apps/web/src/app/layout/components/search-bar/search-bar.ts` and `apps/web/src/app/features/public/home/home.ts`.
- **Price markers.** Raw-DOM `L.divIcon`s with class `hh-marker` (Leaflet's white box cleared) wrapping `.hh-marker__anchor` (bottom-centred) and the `.hh-pin` pill, with modifiers `--featured`, `--active` and `--selected`. The search map's popup is `.hh-mapcard`. All of these are styled globally in `apps/web/src/global.css`, because markers live outside Angular view encapsulation. `.leaflet-container { isolation: isolate }` keeps Leaflet's z-indexes under app chrome.
- **Place bias.** At startup `apps/web/src/app/app.config.ts` sets `PlaceSearchBias` to the centre of the visitor's country box, so "central" ranks local results first.

## Reuse, don't rebuild
- New map surface: `LeafletLoader` + `whenSized`. If it sits on the search → listing → back path, borrow `SharedMap` rather than building a second map.
- Address input: `hh-place-search`. Picking a point: `hh-location-picker`. Showing one: `hh-static-map`.
- Pin: `brandPinIcon`. Price pill: the `.hh-pin` classes.
- Country frame: `CountryBounds` (never geocode at page load).
- "Near me": `GeolocationService`.

## Traps
- **Leaflet has no build-time error for a wrong or missing key.** CARTO answers HTTP 200 with "API KEY REQUIRED" stamped into the PNG, so `lib/src/maps/lib/carto-key.spec.ts` asserts the URL instead.
- **Popup and pin markup bypass templates.** The search-map card is assembled with `innerHTML` and `esc()` (`apps/web/src/app/features/public/search/search-map/search-map.ts`). Escape any new field, and expect hard-coded English ("Verified", "Shared rooms", nav aria-labels). The country map's hints and errors are also hard-coded English (`apps/web/src/app/features/public/home/country-map/country-map.ts`).
- Photon is called with `lang: 'en'` regardless of the active locale (`lib/src/maps/lib/photon.ts`).
- `afterNextRender` is used by the map components. If one is created inside an `@if` after the app is idle, see the warning in `lib/src/ui/lib/dialog-focus/dialog-focus.ts`.
- **Dead leftovers:**
  - `hh-maps` (`lib/src/maps/lib/maps/maps.ts`) is the Nx scaffold stub ("Maps works!"), still exported.
  - `map-style.airbnb.json` is a Google Maps style with no references.
  - `apps/web/public/geo/pak-adm0.json` is not loaded (the drill-down starts at adm1).
  - `.hh-region` in `apps/web/src/global.css` is unused since the drill-down moved to Leaflet layers.
- **Stale comments and docs:**
  - `lib/src/maps/lib/place-cache.ts` says autocomplete is "billed per request". That was Google; Photon is free.
  - `lib/src/maps/lib/location-picker.ts` calls the picker "keyless". The basemap now needs a CARTO key.
  - `MOBILE.md` still has a "Google Maps on device — action required" section, but the Google stack was removed in 59d3692.
- jsdom has no `ResizeObserver`; `apps/web/src/test-setup.ts` stubs it so `whenSized` does not raise an unhandled rejection.

## Decisions
- [Leaflet with CARTO tiles, not Google Maps](../decisions/maps/leaflet-carto-over-google-maps.md)
- [Photon for typeahead, Nominatim for reverse geocoding](../decisions/maps/photon-search-nominatim-reverse.md)
- [Only non-share-alike geodata ships in the bundle](../decisions/maps/non-share-alike-geodata.md)

## See also
- [search-and-discovery](./search-and-discovery.md), [listing-and-booking](./listing-and-booking.md), [host-console](./host-console.md), [landing-page](./landing-page.md), [mobile-app](./mobile-app.md), [ui-library](./ui-library.md), [tooling](./tooling.md)
- `MOBILE.md` (geolocation permissions; its Google Maps section is stale)
