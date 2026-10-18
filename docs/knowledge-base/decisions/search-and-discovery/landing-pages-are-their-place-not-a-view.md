# A landing page is its place, not a view: its map neither restores nor writes a viewport

**Status:** Accepted
**Area:** [search-and-discovery](../../area/search-and-discovery.md)

## Context

A curated landing page (`/hostels/<place>`, `/hostels/<place>/<gender>`, `/hostels/<place>/<campus>`) embeds the real `SearchMap` with a `seed` (`place-landing.html`; `PlaceLanding.seed` in `place-landing.ts`) and owns the head. `PlaceLanding`'s head `effect` claims the place: an indexable title and description, with the page's own clean path as the canonical. It never reads the query. `SearchMap`'s own head `effect` returns early when there is a seed.

Three facts in `search-map.ts` let a landing link carrying a viewport claim one place over another area's hostels (Trello #201, found while fixing #160):

1. **The viewport was restored.** `mapBounds` was `signal(this.urlBounds())`, a field initialiser, which runs before the `seed` input is set: inputs are set after construction. `urlBounds` knew nothing of a seed anyway, since the `ne_*`/`sw_*` keys pass through `mergeSearchParams` untouched (`search-params.ts`). `query()` prefers `bounds` to `near`, and `setup()` called `fitBounds` on the restored box. So `/en/hostels/lahore?ne_lat=20&ne_lng=100&sw_lat=10&sw_lng=90` listed the far box, on the server and in the browser, under "Hostels in Lahore". Its head stayed `index, follow` with the canonical `/en/hostels/lahore`; the head was seen live on 2026-10-18.
2. **The viewport was written.** `syncBoundsToUrl` had no seed guard. Once a landing page's camera moved (fitting its results, a resize, the visitor), it wrote all four keys into its own URL, so most copies of a landing link carried them.
3. **`areaChosen` and `arrivedWithViewport` had the same initialiser flaw.** Nobody saw it, because neither is read on a landing page.

The e2e harness hid the write. `stubListings` (`apps/web-e2e/src/support/stubs.ts`) answers with no hostels, so `fitTo` never ran, the camera never moved, and no e2e landing page ever wrote keys.

## Decision

The user decided (2026-10-19, Trello #201):

- **A landing page neither restores a viewport from its URL nor writes one into it.** The camera opens on the place and the list searches `near` it, on the server as in the browser. A pan still re-searches the box on screen, in memory, and the URL doesn't change.
- **A landing link that carries a viewport therefore shows exactly the clean page, and keeps the clean page's head**: indexable, with its self-canonical, `og:url` and `hreflang`. It is a duplicate, not a view. `PlaceLanding` is unchanged.

What the code does not explain on its own:

- **The guard is `seeded`, not `seed`.** `seeded = computed(() => this.seed() !== null)`, and `urlBounds` returns `null` when it holds. The three signals derived from the URL viewport take `seeded` as their source. A gender page reused for another type (`/hostels/lahore/girls` to `/boys`, one route config) changes the seed but not `seeded`, so the visitor's in-memory view survives the move. Sourced on `seed`, it would be wiped.
- **`linkedSignal` plus `untracked`.** `mapBounds`, `areaChosen` and `arrivedWithViewport` are `linkedSignal({ source: this.seeded, computation: () => untracked(() => …this.urlBounds()…) })`.
  - A linked signal computes when it is first read, which is after the inputs are set (on the server too), and again whenever `seeded` changes. `.set()` keeps working (`captureMapBounds`, `recenterTo`, `leftHomeCountry`, the arrival handler).
  - Angular runs a linked signal's computation with the signal itself as the active consumer (`@angular/core` 21.2.9). A tracked `urlBounds` read would therefore reset the value on every URL change. On `/search`, the map's own rounded write would replace the box the camera reported, change `query()` by value, and fire the search again. Back onto a reused page would reset it to an entry the camera was never moved to.
- **The write guard sits in `syncBoundsToUrl`, not `captureMapBounds`.** `captureMapBounds` still sets `mapBounds` and resets the page, which is what makes a pan re-search the box. A guard there would freeze the list on the opening view.
- **Arrival keys stay in the URL, inert.** A keyed landing link keeps its `ne_*`/`sw_*` in the address bar. Nothing reads them on a landing page, and every exit nulls them (`startSearch`, `VIEWPORT_KEYS_NULLED` in `search-scope.ts`). Stripping them would be the very same-path write this decision removes.
- **The unknown-slug landing page is excluded.** `/hostels/<unknown>` has a `null` seed (`PlaceLanding.seed`), so its embedded map behaves as a bare `/search`: it restores and writes a viewport. Its head is `noindex` either way (`PlaceLanding`'s unknown-place branch).

## Alternatives rejected

- **`noindex` for a landing link carrying a viewport.** This was the user's first choice: at request time they asked for both `noindex` and no restore or write. They revised it after the analysis. Once the map ignores the box, a keyed landing link is an exact duplicate of the clean page, and a duplicate takes a canonical:
  - it keeps the link value of the many keyed landing copies shared while the map still wrote keys;
  - it follows Google's guidance on duplicates, which is a canonical rather than `noindex`;
  - it keeps the head from depending on the map never writing keys again. `PlaceLanding` would have had to read the live query, and a regressed write guard would then de-index every landing page in crawlers that run JavaScript.
- **`noindex` without the no-restore.** The page would still list the far box under the place's copy; only the index would be told.
- **Stripping the arrival keys.** See above.
- **Guarding in `captureMapBounds`.** See above.
- **Sourcing the linked signals on `seed`.** See above.
- **Copying #160's arrival machinery** (the verdict re-judged on each `NavigationEnd`, `isSamePageRefinement`) into `PlaceLanding`. Only a `noindex` verdict needed it, and it would have been a second copy of code merged hours earlier.

**Why `/search` differs.** A `/search` link carrying a viewport shows a different box from the clean search, so it is a view, not a duplicate: `noindex`, with no canonical ([viewport links are views](./viewport-links-are-views-not-pages.md)). A landing page's path is its place, so a box in its link changes nothing about what the link shows.

## Consequences

- **A refresh, Back from a listing, or "Any type" after a pan reopens the landing page on its place.**
  - Below 950 px, pin cards (`openListing`) and list cards (`ListingCard.newTab`) open the listing in the same tab, so Back builds the landing page afresh.
  - Desktop list cards open a new tab, so the landing tab keeps its pan.
  - "Any type" and backpacker on a gender page go to `/hostels/<place>`, a different route config, so the page is rebuilt.
  - Accepted: the page always shows its place. Keeping a pan in `history.state` is a possible follow-up.
- **A reused page keeps its in-memory view**, and its URL still carries no viewport. That covers a filter change, a move between gender pages, and a language switch: `LocaleStore.switchTo` is a `navigateByUrl` within the same `:locale` and `hostels/:place` route configs, which `AppRouteReuseStrategy` reuses. Checked live on 2026-10-19:
  - the language switch: same component instance, the pan kept, the URL clean (also pinned by an e2e test);
  - girls to boys: same instance, and the next request asks for `boys` inside the panned box.

  A filter change is code-proven only.
- **`everywhere: null` is no longer written on a landing page.** `syncBoundsToUrl` used to carry it. A stale `?everywhere=1` now stays in a landing URL, inert, because `unbounded` is false whenever there is a seed.
- **GA:** `page_title` and `page_view` are unchanged. A landing pan used to be a same-path replace, which GA skips; now it is no navigation at all.
- **Search Console:** unchanged. Keyed landing copies canonicalise to the clean page, as their head always said.
- **The place-key override is still open.** A hand-made `?place&lat&lng` on a landing page overrides the seed, because the query wins key by key in `mergeSearchParams` (`search-params.ts`). Filed as Trello #204.
- **E2E:** on a landing page the URL never changes after a drag, so `dragMapOnce` and `urlHasViewport` (`apps/web-e2e/src/support/map.ts`) can't detect a pan there. Read the request's bounds instead (`ListingsStub.bounds`; `dragMapUntilSearched` in the same file), with results stubbed inside the place (`LAHORE_RESULTS` in `stubs.ts`), or the camera never moves.

## Evidence

- `apps/web/src/app/features/public/search/search-map/search-map.ts` (`seeded`, `urlBounds`, `mapBounds`, `areaChosen`, `arrivedWithViewport`, `syncBoundsToUrl`, `captureMapBounds`, `setup`, `query`, `startSearch`, `openListing`, the SEO `effect` and the arrival handler in the constructor)
- `apps/web/src/app/features/public/landing/place-landing.ts` (`seed`, the head `effect`), `apps/web/src/app/features/public/landing/place-landing.html`
- `apps/web/src/app/features/public/search/search-params.ts` (`mergeSearchParams`), `apps/web/src/app/features/public/search/search-scope.ts` (`VIEWPORT_KEYS_NULLED`)
- `apps/web/src/app/features/public/search/listing-card/listing-card.ts` (`newTab`), `apps/web/src/app/route-reuse-strategy.ts` (`shouldReuseRoute`), `apps/web/src/app/core/i18n/locale-store.ts` (`switchTo`), `apps/web/src/app/app.routes.ts`
- `apps/web-e2e/src/support/stubs.ts` (`stubListings`, `LAHORE_RESULTS`), `apps/web-e2e/src/support/map.ts` (`dragMapOnce`, `urlHasViewport`, `dragMapUntilSearched`)
- Tests:
  - `search-map.spec.ts`, the describes "SearchMap on a landing page link carrying a viewport", "SearchMap on a landing page as its map moves" and "SearchMap search page viewport write". 13 of them fail on the pre-fix `search-map.ts`.
  - `place-landing.spec.ts`: a keyed city, gender or campus link keeps the clean page's indexable head.
  - `apps/web-e2e/src/head-canonical-and-structured-data.spec.ts`: the raw HTML of a far-viewport landing link matches the clean page.
  - `apps/web-e2e/src/landing-viewport.spec.ts`: a pan, a far link and a language switch, with results on the map. All three fail on the pre-fix code.
- Trello #201; follow-up Trello #204; run notes `docs/implement/Bugs/201.md` (decisions D1–D11)
