# A search link carrying a viewport is a view, not a page; the heading follows the map

**Status:** Accepted
**Area:** [search-and-discovery](../../area/search-and-discovery.md)

## Context

The map writes its viewport into the search URL once its camera moves after load. Each `moveend` or `resize` it hears runs `captureMapBounds`, which calls `syncBoundsToUrl` to merge `ne_lat`, `ne_lng`, `sw_lat` and `sw_lng` into the URL with a same-path `replaceUrl` (`search-map.ts`). It does not hear the map being built: Leaflet fires that `moveend` inside `SharedMap.acquire` (`lib/src/maps/lib/shared-map.ts`), before `setup()` registers the listener. The next move is what writes the keys: fitting non-empty results (`fitTo`; in Leaflet 1.9.4 even a `setView` onto the view already showing raises `moveend`), a resize, or the visitor. So a pristine `/en/search/lahore` with results carries all four keys a moment after it opens (seen live, 2026-10-18), in a visitor's browser and in a crawler that runs JavaScript alike, while a place search with no results and a camera nobody moves carries none. Most links copied from the address bar carry them. Nothing is written during SSR.

The head and the heading described the request's place keys (`canonicalPlace`, `locationName`), while the request stops using them as soon as a box exists (`query()` drops `near` and `city`). Panned to longitude ~97, `/en/search/lahore` still read "Lahore", `index, follow`, with the canonical `/en/hostels/lahore`, over hostels nowhere near Lahore; `?place=Lahore&lat=…&lng=…` did the same (Trello #160, reproduced 2026-10-11). PR #172 (Trello #157, #161) had made the heading follow the view only for a search that names no place.

A place's geometry is only a centre and a zoom. A curated slug resolves to `{name, lat, lng, zoom}`, zoom 11 for a city and 13 for a campus (`landing/search-slug.ts`); a picked place carries `lat`/`lng`/`zoom` in the URL; an uncurated slug has no coordinates. There is no bounding box to compare a view with.

## Decision

The user chose both (2026-10-18, Trello #160):

- **A search link that arrives carrying a viewport (all four `ne_*`/`sw_*` keys valid) is a view: `noindex`, no canonical.** No `hreflang` and no `og:url` either, on the server as in the browser.
- **Once the map no longer frames the place, the heading and title read "This map area"** (`searchUi.mapArea`, `seo.mapAreaTitle`, `seo.mapAreaDescription`, the keys PR #172 added; none new), and the head is `noindex`.

A pristine place search is unchanged: with no viewport in the link and the map on the place, it stays indexable with its canonical at `/hostels/<slug>`, raw and rendered, after the map's own writes.

What the code does not explain on its own:

- **The arrival URL, not the live one.** `arrivedWithViewport` (`search-map.ts`) holds `urlBounds() !== null`. It is read on the first pass and re-read on every `NavigationEnd` except the page's own same-path refinements. The live URL can't be the test: the map writes all four keys once its camera moves, and fitting its results is enough, in a crawler that renders JavaScript too (Leaflet is DOM and CSS tiles with no WebGL, and `whenSized` in `lib/src/maps/lib/leaflet.ts` gives up waiting for a size after 2 s). Every rendered search page whose camera settled would say `noindex, nofollow` while its raw HTML said `index`, and every pristine place search with results would be de-indexed. On the server the request URL is the arrival URL, so a crawler that runs no JavaScript gets the same verdict.
- **"Carrying" means a valid box, not any key.** The test is `urlBounds()`: all four keys present, finite, with an area. A partial or garbage box reads as absent: the map opens on the place, so canonicalising to the landing page is truthful. The bad keys stay in the URL until the camera moves and the map writes a real box over them, which is harmless, since they read as none.
- **Back/Forward and a language switch are arrivals.** Back onto an entry the map rewrote with `replaceUrl` counts as arriving with a viewport. That gives one URL one verdict, the same rule GA's page views use, with no `history.state` tag to keep in sync; no crawler presses Back. A language switch is a push under the new prefix to a reused `SearchMap`, so it is re-read too. Pushes that carry the keys (a filter Apply, a sort, an amenity) land `noindex`, which is harmless.
- **One definition of the page refining itself.** `isSamePageRefinement` moved unchanged from the GA service to `core/navigation/same-page-refinement.ts`. GA and `SearchMap` both call it on `router.lastSuccessfulNavigation()`, with the same id check against the `NavigationEnd`, so a page view and a head verdict change on the same navigations. Search does not import the GA service. On the search route the only same-path replaces are `SearchMap`'s own: `syncBoundsToUrl`, `recenterTo`, `stripCorrections`, and "Search everywhere" on a bare `/search`.
- **The framing rule** (`framesPlace(view, centre, zoom)` in `features/public/search/search-framing.ts`, read through `placeFramed` in `search-map.ts`) is measured in tiles at the place's zoom, where a 256 px tile spans `360 / 2^zoom` degrees of longitude:
  - Longitudes are unwrapped to the copy of the place nearest the view. Leaflet's `getBounds` doesn't wrap, and the map sets no `maxBounds` or `worldCopyJump`.
  - **Out** of frame when the view is wider than `CAP_TILES` (32) tiles: about 5.6° (some 530 km) for a city at zoom 11, and 1.4° for a campus at zoom 13. A pristine city search's opening view stays framed on panes up to 3844 px wide (15 tiles, 2.6°).
  - Otherwise **in** frame when the place's centre is inside the view, or the view's centre is within `NEAR_TILES` (2) tiles of it on each axis (latitude tiles scaled by the cosine of the place's latitude): about 0.35° (33 km) for a city, 0.088° (8 km) for a campus. So zooming into DHA with Lahore's centre off-screen still names Lahore.
  - Only the longitude span counts. Tall phone viewports, and possibly tall crawler viewports (unverified), would trip a latitude cap on the opening view.
  - **Null bounds count as framed:** until the map reports a view of its own (a place search with no results and a camera nobody moves never does), after `recenterTo`, and just after a place is picked.
  - **No known centre counts as framed** (uncurated typed text, `?place=` with no coordinates): the heading keeps the name. Those pages are `noindex` already, so this is heading text only.
  - **No known zoom** (a picked place whose URL carries none): only the centre-in-view test applies.
  - Judged on settle. `mapBounds` is set only when the camera settles (`moveend`/`resize`, through `captureMapBounds`) and nulled when a new place or "Search everywhere" drops the old view (`recenterTo`, `searchEverywhere`), so nothing flips mid-drag, and no hysteresis or debounce is needed. On the server `mapBounds` is seeded from `urlBounds()`, so a far link server-renders "This map area".
- **The share card keeps the place's photo for a framed viewport link** to an unfiltered curated place (`placeSocialImage(slug)`, with the place's title), the same branch that would otherwise canonicalise; a filtered or uncurated one keeps the default image it already had. `noindex` is about the index, not chat previews, and most links a visitor copies carry a viewport, once the map has fitted its results or been moved. A link that no longer frames the place gets the map-area title and the default image.
- **No `noindex` branch passes a `path`**, so none writes `og:url`, which Facebook reads as the canonical. `Seo.apply` drops the canonical for `noindex` but would still write `og:url` from a path (`SeoConfig.path`, `core/seo.ts`).

## Alternatives rejected

- **The live URL.** It de-indexes every pristine place search in a crawler that runs JavaScript (above). The user's wording, "a search URL carrying viewport keys", is read as the arrival URL for that reason.
- **The arrival alone, with no framing.** After a far pan the title would say "This map area" while an indexable canonical still claimed the place.
- **The place's centre in view, and nothing else.** It keeps "Lahore" over a view of the whole country, and drops it when zoomed into a neighbourhood with the city centre just off-screen.
- **A latitude cap** (the PM's "shorter side more than 4 times the place's frame" included). Tall phone and crawler viewports would read "This map area" on a pristine search's opening view.
- **PR #172's `areaChosen` as the fallback when no centre is known.** It is set from `urlBounds() !== null` on the first pass and by `leftHomeCountry()`, and never resets, so a reused page would inherit a previous pan. These searches never framed their place anyway.
- **Stripping the viewport keys.** On `/search` they are what lets a refresh or a shared link reproduce the view ([the slug is cosmetic](./location-slug-is-cosmetic.md)), and the URL rule strips only what can come back to life. Not mirroring the viewport until the visitor moves the map is a possible follow-up, not done here. A landing page restores and writes none ([landing pages are their place](./landing-pages-are-their-place-not-a-view.md)).
- **Tagging `history.state` so Back onto a rewritten entry stays indexable.** A second record of the same fact to keep in sync, for a case no crawler reaches.

## Consequences

- **Most address-bar copies are `noindex`.** The map writes the viewport once its camera moves, and fitting the results is enough, so a link copied from a search page with results, or one the visitor has moved, carries one. Backlinks to such URLs no longer pass their signal to the landing page; expect Search Console's "Excluded by noindex" count to rise.
- **GA `page_title`** is the map-area title for arrivals on far or wide viewport links, a refresh after a far pan, and Back/Forward onto such entries. No event parameter changes, and a pan is still not a page view. GA is live in production: annotate the deploy date.
- **The Where inputs keep the search made.** The mobile field (`placeText`) and the header bar (`SearchBar`'s `placeName`) are inputs, and `SearchBar.search()` would submit "This map area" as a place (`search-bar.ts`). Phones hide the h1 below 950 px, so there the change shows only in the tab title.
- After a 360° pan the place is framed again on the next copy of the world: longitudes are unwrapped, and the map does show it there.
- **`/hostels/<slug>` had the same shape; fixed by Trello #201.** `syncBoundsToUrl` had no seed guard, so a landing page gained viewport keys too, and a shared far link server-rendered the landing copy with an indexable self-canonical over a far list. A landing page now neither restores nor writes a viewport, so a keyed landing link shows exactly the clean page and keeps its self-canonical: a duplicate, not a view ([landing pages are their place](./landing-pages-are-their-place-not-a-view.md)).

## Evidence

- `apps/web/src/app/features/public/search/search-map/search-map.ts` (`arrivedWithViewport`, `placeFramed`, `locationName`, `urlBounds`, `captureMapBounds`, `syncBoundsToUrl`, the SEO `effect` in the constructor)
- `apps/web/src/app/features/public/search/search-framing.ts` (`framesPlace`, `CAP_TILES` = 32, `NEAR_TILES` = 2)
- `apps/web/src/app/core/navigation/same-page-refinement.ts` (`isSamePageRefinement`), `apps/web/src/app/core/google-analytics/google-analytics.service.ts` (`bindRouter`)
- `apps/web/src/app/core/seo.ts` (`SeoConfig.path`, `apply`), `apps/web/src/app/features/public/landing/search-slug.ts`, `apps/web/src/app/layout/components/search-bar/search-bar.ts` (`search()`), `lib/src/maps/lib/leaflet.ts` (`whenSized`)
- Specs:
  - `apps/web/src/app/features/public/search/search-framing.spec.ts` (the framing table)
  - `apps/web/src/app/core/navigation/same-page-refinement.spec.ts`
  - `apps/web/src/app/features/public/search/search-map/search-map.spec.ts` (the describes "SearchMap head and heading on a place search link carrying a viewport" and "SearchMap place search head as the map moves")
  - `apps/web-e2e/src/search-viewport-head.spec.ts` (the live head after a short pan, a zoom out and back, a far link)
  - `apps/web-e2e/src/head-canonical-and-structured-data.spec.ts` (the framing viewport link in `NOINDEX_PAGES`, and the far link's raw HTML)
  - `apps/web-e2e/src/search-trigger-and-map-area-heading.spec.ts`
- Trello #160; PR #184 (KratosvsEzio/hostelhive-FE), run notes `docs/implement/Bugs/160.md` (decisions D1–D12); PR #172 (Trello #157, #161) for the map-area heading and `areaChosen`
