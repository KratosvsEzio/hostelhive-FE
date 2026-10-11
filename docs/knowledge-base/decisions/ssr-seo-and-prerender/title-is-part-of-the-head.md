# The title is part of the head; analytics waits for it to settle

**Status:** Accepted
**Area:** [ssr-seo-and-prerender](../../area/ssr-seo-and-prerender.md)
**Supersedes:** the "title is set synchronously" point of [route-level head ownership](./route-level-head-ownership.md)

## Context

`RouteHeadStrategy.updateTitle` used to write each route's English `title:` the moment a navigation
ended, on every route. That was meant for Google Analytics, on the belief that it reads `document.title`
straight after `NavigationEnd`. Three problems followed:

- **Stale titles.** A page that owns its head had to overwrite the route title, and it didn't on a
  query-only navigation. So listing, pricing and the blog fell back to "Hostel details — HostelHive"
  and the like (Trello #143).
- **English only.** The early title could only be English, because the new language's strings may not
  have loaded yet (Trello #140).
- **Wrong titles in GA.** A listing was recorded as "Listing not found" while loading. After a switch to
  an unloaded language, GA recorded the previous language's title.

**Measured, not assumed:** in this zoneless app the change-detection tick is registered at route
activation (`_router-chunk.mjs:3883`), before GA's `setTimeout` at `NavigationEnd` (`:3893`). So GA
already read *after* the page effects. The early write never served it.

## Decision

- **Only `Seo.apply` writes `<title>`.**
  - **On a `'page'` route:** the component owns the title and the route declares none.
  - **On every other route:** `title:` holds a translation key for the page's label. `RouteHeadStrategy`
    composes it into `seo.pageTitle` (or `seo.adminPageTitle` under `/<locale>/admin`) inside the
    `ready()`-gated effect that applies the rest of the default head.
- **`Seo.settled`:** true once strings are loaded and the last `apply` was not `provisional`. A page
  whose head waits on data marks the interim head `provisional`; only the listing does.
- **Google Analytics waits for the settled head:**
  - after `NavigationEnd` it waits one macrotask, then for `settled`, then one more macrotask, then
    reads the title;
  - the wait is capped at 5 s;
  - a pending view is flushed at the next navigation and on `pagehide`, with the location it was
    queued at;
  - exactly one view per navigation.
- **Labels are reused.** A route title reuses a label already translated in all 18 files where one
  exists (52 of 67). Otherwise it gets a new `routeTitle.*` key.

## Alternatives rejected

- **Re-applying page heads on query-only navigations.** It keeps two owners of the title and needs
  every page to listen to the router. This is the "claim flag" shape #132 already rejected.
- **A per-navigation "head applied" handshake.** Reused pages never re-apply on a query-only
  navigation, so GA would hit the cap on every map pan. `settled` needs no bookkeeping per navigation.
- **One title `ResolveFn` per route (67 of them).** They block navigation on a JSON fetch, and the
  active language isn't set yet on deep links and Back across languages.
- **Translating synchronously with an English fallback, then fixing it up.** GA and the tab show English
  on every switch to an unloaded language, which is what #132 rejected.
- **Dedicated full-title keys per page.** About 3.5 times the translation volume, for no gain over
  composing from labels.
- **`data.titleKey` instead of a key in `title:`.** Workable, but a key in `title:` keeps Angular's
  deepest-wins `buildTitle` and makes a one-token diff per route.

## Consequences

- **English wording:**
  - three English titles changed: "Service policy", "Access blocked — HostelHive", and
    "Overview — HostelHive" (was "Host · Overview");
  - all other English titles are byte-identical, pinned in `app.routes.spec.ts`.
- **GA page views:**
  - a view can be up to 5 s late, flushed early on navigation or `pagehide`;
  - its `page_title` is now the translated title the visitor saw.
- **Renaming a reused label renames the tab title.** That is intended: the tab says what the page says.
- **`stop()` (consent withdrawn) drops a pending view.**
- **Not fixed here, both since fixed by PR #126** (run notes `docs/implement/Bugs/152.md`):
  - duplicate page views from `replaceUrl` navigations, such as map pans (Trello #144). GA now skips
    same-page refinements; see the area file's "Google Analytics page views";
  - the English "Post not found" title on blog articles (Trello #152). It is now
    `seo.postNotFoundTitle` in all 18 languages, behind a `ready()`-gated head effect.

## Evidence

- `apps/web/src/app/core/route-head.ts`, `apps/web/src/app/core/seo.ts` (`provisional`, `settled`),
  `apps/web/src/app/core/google-analytics/google-analytics.service.ts`,
  `apps/web/src/app/features/public/listing/listing-detail/listing-detail.ts` (`applySeo`)
- Specs:
  - `core/route-head.spec.ts`
  - `app.routes.spec.ts` (route walk and pinned English)
  - `core/i18n/route-title-locale-parity.spec.ts`
  - `core/google-analytics/google-analytics.page-views.spec.ts` (including the mutation-checked
    ordering test)
  - `listing-detail.spec.ts`
  - `apps/web-e2e/src/head-titles.spec.ts`
- PR #113; run notes `docs/implement/Bugs/143.md` (decisions D1–D17, the PE's scheduler probe)
