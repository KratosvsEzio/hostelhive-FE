# SSR, SEO and prerender

How the public site is rendered on the server (Angular SSR on Express), which routes render where,
and what goes into `<head>` for crawlers and link previews: titles, canonicals, `hreflang`, Open Graph,
JSON-LD, and the sitemap. Also the patterns the whole app uses to stay safe on the server. The landing
pages' UI belongs to [search-and-discovery](./search-and-discovery.md); deployment is in
`docs/DEPLOY.md`.

## Where it lives

- `apps/web/src/server.ts`: the Express server. Builds the `NG_ALLOWED_HOSTS` allowlist (fatal if unset in
  production), serves `/sitemap.xml`, serves static files, and hands everything else to
  `AngularNodeAppEngine`.
- `apps/web/src/main.server.ts`: the server bootstrap. `apps/web/src/main.ts`: the browser bootstrap.
- `apps/web/src/app/app.config.server.ts`: merges `appConfig` with `provideServerRendering(withRoutes(serverRoutes))`
  and swaps in `FsTranslationLoader`.
- `apps/web/src/app/app.routes.server.ts`: render mode per path (`serverRoutes`, `clientOnly`).
- `apps/web/src/app/core/seo.ts`: `SITE_ORIGIN` and the `Seo` service (`apply`, `setJsonLd`,
  `clearJsonLd`, `clearAllJsonLd`, `clearOnDestroy`, `clearUnclaimed`, `preloadImage`).
- `apps/web/src/app/core/ssr-response.ts`: `SsrResponse.serviceUnavailable()` (503 + `Retry-After` on the
  server render's response, via `RESPONSE_INIT`) and `isApiOutage(e)`.
- `apps/web/src/app/core/route-head.ts`: `RouteHeadStrategy` (the app's `TitleStrategy`, provided in
  `app.config.ts`) and `routeHeadFor`. Owns the head of every route whose page does not.
- `apps/web/src/app/core/social-image.ts`: `placeSocialImage(slug)` and `DEFAULT_SOCIAL_IMAGE` (1200x630
  cards under `apps/web/public/cities/social/` and `apps/web/public/hero/social/`).
- `apps/web/src/app/features/public/landing/sitemap-urls.ts`: `sitemapPaths()` and `renderSitemap()`.
- `apps/web/src/app/core/i18n/locales.ts`: `localeAlternates` and `INDEXED_LOCALE_CODES`, shared by the
  page head and the sitemap.
- `apps/web/src/app/core/i18n/fs-translation-loader.ts`: reads translations from disk during SSR.
- `apps/web/src/app/core/interceptors/ssr-timeout-interceptor.ts`: 5s cap on each API call during SSR.
- `apps/web/src/app/core/robots.ts`: `DISALLOWED_PATHS`, `disallowPatterns()` and `renderRobotsTxt()`,
  served as `/robots.txt` by `server.ts`. There is no static `robots.txt` any more.

## How it works

**Render modes** (`app.routes.server.ts`): `''` is `Prerender`; the authenticated areas (`host`,
`admin`, `moderator`, `forbidden`, `notifications`, `account`) are `Client`, each listed bare and as
`*/path` so any locale prefix matches; everything else (`**`) is `Server`, rendered per request.
`appConfig` turns on `provideClientHydration(withEventReplay())`, so the browser reuses the server DOM
and replays early clicks.

**Who owns the head.** Every route declares it as route data `head` in `app.routes.ts`, read
deepest-wins down the matched tree (`routeHeadFor`):
- **`'page'`:** the component calls `Seo.apply` itself, from an effect gated on `LocaleStore.ready()`.
  Home, search, both landing routes, hostel (listing), pricing and blog (with its articles).
- **`'index'`:** a static page with no head of its own. `RouteHeadStrategy` applies its own canonical,
  `og:url` and `hreflang`, plus a translated description from `data.descriptionKey` (or the site
  default). About, FAQs, careers, contact, the three legal pages and credits.
- **No flag:** `noindex`, with no canonical and no `og:url`. Auth, account, the consoles,
  notifications, forbidden and the payment return pages.

**The title is part of the head.** Only `Seo.apply` writes `<title>`.
- **`RouteHeadStrategy.updateTitle` writes nothing itself.**
- **On a `'page'` route** the component owns the title, and the route declares no `title:`.
- **On every other route** `title:` holds a translation **key** for the page's label, e.g.
  `publicAbout.aboutUs` or `routeTitle.payInvoice`. A root effect gated on `ready()` (and tracking the
  active locale) composes it into `seo.pageTitle` ("{{page}} — HostelHive"), or `seo.adminPageTitle`
  under `/<locale>/admin`, and applies it with the rest of the default head. A language switch therefore
  re-translates it.
- **A route with no title** gets the translated `seo.defaultTitle`.
- **A default route also clears** every JSON-LD block and the preload image.
- **Its canonical** is built from the matched route segments, never the URL string, so a matrix
  parameter (`/en/about;utm=x`) cannot create a duplicate.

**Provisional heads and `Seo.settled`.**
- A page whose head waits on data applies an interim head with `provisional: true`. The listing does:
  "Hostel details — HostelHive", noindex, while loading.
- `Seo.settled` is true once the active language's strings are loaded and the last `apply` was not
  provisional.
- An API error or outage gives the listing the same neutral head as **final**. "Listing not found" is
  only for a genuine 404 (`listing-detail-api.ts` maps only a 404 to "missing").

**An API outage answers 503 on the server** (Trello #154). When the listing's fetch fails with status
0, a 5xx, or no status at all (the `ssrTimeoutInterceptor` timeout), `isApiOutage` is true and the page
calls `SsrResponse.serviceUnavailable()`: HTTP 503, `Retry-After: 120`, `Cache-Control: no-store`. The
body is still the neutral noindex page; the status tells a crawler to retry instead of dropping the
listing. A 404 keeps its 200 not-found page, and any other 4xx stays a 200. In the browser it is a no-op
(`RESPONSE_INIT` is null). Only the listing does this so far; search and the landing pages also fetch
`/public/hostels` on the server and still answer 200 in an outage.

**Google Analytics page views** (`core/google-analytics/google-analytics.service.ts`):
- **When a view is sent:** after `NavigationEnd` the service waits one macrotask, then for
  `Seo.settled`, then one more macrotask, and only then reads `document.title`.
  - **The wait is capped at 5 s.**
  - **A pending view is flushed** at the next `NavigationEnd` and on `pagehide`, with the location
    captured when it was queued.
  - **Each navigation to a new page sends exactly one view.**
- **Which navigations are a new page** (`isSamePageRefinement`, checked in `bindRouter` *before*
  `queuePageView`, so a skip never flushes, replaces or re-locates the pending view). A navigation is
  **skipped** when:
  - **A:** the app replaced the URL on the same page: `trigger === 'imperative'`, `extras.replaceUrl`,
    and the same `pagePath` (from `core/scroll-reset.ts`, locale kept) as the previous successful
    navigation. This covers map pans, zooms and recenters, "Search everywhere" on a bare `/search`, and
    the listing's `?review` clean-up. "Search everywhere" from `/search/<place>` or a landing page is a
    push to a new path, so it counts one view of `/search`. That started for `/search/<place>` with
    PR #133 (GA is live; annotate the deploy).
  - **B:** only the `#fragment` changed (blog contents links), whatever the trigger.

  Pushes (filter Apply, a place pick, the language switch), Back/Forward and the first load all count.
  `page_path` never carries a `#fragment`. **GA counts changed from the PR #126 deploy** (2026-10-11
  merge): fewer search views, lower views per session and engagement on search landings. GA is live in
  production.
- **Why the timing holds:** within a tick, root effects re-run after page effects, so a provisional
  head written in the settling tick cancels the send.
- **Console and token URLs** are judged on their locale-free path (`isMarketplacePath(routePath(url))`)
  and send nothing.
- **`stop()`** (consent withdrawn) drops a pending view, and nothing is sent until `start()` runs again.

**Head tags.** A page calls `Seo.apply({ title, description, path, image, noindex, type })`.
- **`path`** is written without a locale. `Seo` adds the active locale for the canonical and `og:url`. Every tag is overwritten, because components are reused across navigations.
- **Canonical:** only an indexable page that has a path gets one. A `noindex` page never has a canonical, even when it has a path, and it gets no `hreflang`.
- **`og:url`:** written whenever there is a path. With no path, `Seo` writes no canonical, `og:url` or `hreflang` at all; there is no `'/'` default.
- **Removal:** a tag `Seo` does not write is **removed**, not just skipped, so nothing from the previous page survives a navigation.
- **`og:locale`:** exactly one, from the active locale's `ogLocale` (`core/i18n/locales.ts`; `en_PK`, `ur_PK`, `ar_AR` …). No `og:locale:alternate`: Facebook re-scrapes the same URL with `fb_locale`, and this site localises by path.
- **`index.html`** ships no canonical, `og:url` or `og:locale`. It keeps only neutral fallbacks (description, robots `index`, og/twitter title, description and image, the app links) for the client-only shells and for scrapers that read the HTML before boot.
- **Indexable pages** also get the full `hreflang` set (`localeAlternates`, `x-default` = English).
- **`setJsonLd(id, data)`** replaces structured data by id.
- **`preloadImage(url)`** puts the LCP hero in the server-rendered head.
- **`clearOnDestroy(destroyRef, ids, { preloadImage })`** removes a page's JSON-LD ids, and optionally its preload, when the page is destroyed. Every page that writes JSON-LD calls it: home, blog, blog article, listing and PlaceLanding. It is SSR-safe, because `@angular/ssr` serialises the document before it destroys the platform.
- **Absolute URLs** always use `SITE_ORIGIN`, never `location.origin`.

**Sitemap.** `server.ts` answers `/sitemap.xml` before `express.static`. URLs come from the static page
list, `PLACES` x `GENDER_SEGMENTS`, `UNIVERSITIES` and `BLOG_POSTS`. Each is prefixed with every
`INDEXED_LOCALE_CODES` language and carries its own `hreflang` block.

**robots.txt.** `server.ts` answers `/robots.txt` before `express.static`, from `renderRobotsTxt`. Each
of `DISALLOWED_PATHS` is disallowed bare and under every `LOCALE_CODES` prefix (all routable languages,
not only the indexed ones). `host` is anchored (`$`, `/`, `?`) so `/xx/hostel/…` and `/xx/hostels/…`
stay crawlable. Search is deliberately not blocked; its pages carry their own canonical or `noindex`.

**Translations on the server.** `FsTranslationLoader` reads `public/i18n/<lang>.json` from disk, trying
`../browser/i18n` and then `apps/web/public/i18n` for `ng serve`. It registers the read with
`PendingTasks`, so SSR waits for the strings.

## SSR-safety patterns

- Browser-only work is guarded with `typeof window === 'undefined'` (the initializers in `app.config.ts`,
  `MobileApp`, `ConsoleDrawer`) or `isPlatformBrowser(inject(PLATFORM_ID))` in components (for example
  `features/user/bookings/bookings.ts`).
- **Pages that need a token skip the fetch on the server and render their skeleton.** The server has no
  session (`authGuard`/`roleGuard` return `true` there), so the request would 401 and the error state
  would be baked into the HTML. See `apps/web/src/app/features/user/bookings/bookings.ts`,
  `apps/web/src/app/features/user/bookings/booking-detail.ts` and
  `apps/web/src/app/features/user/bookings/booking-edit.ts`.
- **Public pages fetch on the server on purpose,** so crawlers see content.
  `apps/web/src/app/features/public/listing/listing-detail/listing-detail.ts` calls the token-free `/public/hostel_detail/:id` during
  SSR.
- Elements that exist only in the browser carry `ngSkipHydration` (`core/google-analytics/consent-banner.ts`).
- When markup depends on viewport width, mirror it in CSS so the server render matches the browser.
  The footer is `hidden md:block` in `app.html`.
- Do not use `afterNextRender` to wait for DOM after an `@if`; in this zoneless app it can silently
  never fire. Use `ngAfterViewInit` (see `lib/src/ui/lib/dialog-focus/`).

## Reuse, don't rebuild

- `Seo` for every head tag. Do not call `Meta` or `Title` directly.
- `Seo.clearOnDestroy` for any new page that calls `setJsonLd` or `preloadImage`, instead of its own `DestroyRef` block. It is also the page's claim on those ids: without it `clearUnclaimed` removes them.
- `SsrResponse.serviceUnavailable()` with `isApiOutage` for a public page whose server-side fetch fails, so an outage answers 503 rather than a 200 noindex page.
- A new route declares its head: `data: { head: 'page' }` if its component calls `Seo.apply` (from a
  `ready()`-gated effect, like `home.ts`), `data: { head: 'index', descriptionKey }` for a static page
  worth indexing (also add it to `STATIC_PATHS` in `sitemap-urls.ts`), or nothing if it is private, in
  which case its path prefix goes in `DISALLOWED_PATHS`. `app.routes.spec.ts` walks every route and
  fails on a page that does none of these, on a flagged page under a private area, and when the
  `'index'` routes and the sitemap disagree.
- A route title is a **label key**, never English text.
  - **Prefer a label the page already uses** and that is translated in all 18 locale files. Otherwise
    add a `routeTitle.*` key to all 18.
  - **`app.routes.spec.ts` rejects** a literal title, or a title on a `'page'` route.
  - **`core/i18n/route-title-locale-parity.spec.ts` fails** on a title key that is missing or empty in
    any locale.
  - **The English titles are pinned** in `app.routes.spec.ts`, so a new titled route needs an entry
    there.
- `Seo.settled` / `provisional` for a page whose head waits on data, so analytics records the real
  title rather than the interim one.
- `placeSocialImage` / `DEFAULT_SOCIAL_IMAGE` for `image`.
- `localeAlternates` for anything that states `hreflang`.
- `sitemapPaths()`: add a new indexable page here, or derive it from the list its route reads.
- `clientOnly([...])` in `app.routes.server.ts` for a new authenticated area. It must also go in
  `DISALLOWED_PATHS` (`core/robots.ts`); `robots.spec.ts` fails if a `CLIENT_ONLY` path is missing.
- `robotsAllows()` (`core/robots-testing.ts`) to assert in a spec whether robots.txt blocks a URL.

## Traps

- **Only the bare root is prerendered.** `''` matches `/` alone, and `keepLocale` redirects that to
  `/en`. `/en` and every other real page fall to `**` and render per request. In practice the home page
  is server-rendered, not prerendered. (Inferred from the route tables; not checked against a build.)
- **A robots.txt `*` is not a route `*`.** In `app.routes.server.ts`, `*` is one path segment. In
  robots.txt it matches any run of characters, slashes included, so a rule like `/*/auth` would also
  block `/en/blog/authentic-…`. That is why `core/robots.ts` names every language instead (PR #49; the
  static file before it listed bare paths only and matched no real URL).
- **robots.txt exists only where the Express server runs**, like the sitemap. A static-only host serves
  none.
- **Domain mismatch.** `SITE_ORIGIN`, `/robots.txt` and the sitemap use `hostelhive.com`. The
  `NG_ALLOWED_HOSTS` examples in `server.ts` and `docs/DEPLOY.md` use `hostelhive.pk`. If production is
  `.pk`, every canonical points at another host.
- A render-mode entry written bare (`account/**`) matches no real URL. Use `clientOnly`, which also adds
  the `*/` forms.
- `ssrTimeoutInterceptor` must stay last in the interceptor list in `app.config.ts`. A timed-out request
  is not cached for transfer, so the browser fetches it again.
- **A click before the app boots used to strand the server page's JSON-LD.** The router replaces the
  first navigation before the page component exists in the browser, so `clearOnDestroy` never runs
  (Trello #138). Now `clearOnDestroy` also *claims* its ids, and `RouteHeadStrategy` calls
  `Seo.clearUnclaimed()` whenever a navigation lands on a `'page'` route: in the browser it removes
  every JSON-LD block, and the preload, that no live page claimed. So a page that writes JSON-LD **must**
  call `clearOnDestroy` from its constructor, or its blocks are removed on its first navigation. The e2e
  "left before the app boots" test reproduces the race by holding the article's lazy chunk. Elsewhere in
  e2e, wait for `waitForClient` (`apps/web-e2e/src/support/seo.ts`) before clicking; without that wait, a
  head check after the click can pass using only the server HTML.
- **Call `apply` from a `ready()`-gated effect, never once in a constructor.** A language switch reuses
  the component, so a constructor `apply` keeps the old language's canonical (how Blog broke, Trello
  #132).
- **Never give a `'page'` route a `title:`, and never set `<title>` outside `Seo.apply`.**
  - **What went wrong:** until PR #113 the strategy wrote the route title on every navigation. A
    query-only navigation on the listing, pricing or blog then left the generic route title, because
    no page effect re-ran (Trello #143).
  - **The premise was false:** writing it early was meant to serve GA, but GA reads after the first
    change-detection tick.
- **A page whose head depends on async data must mark its interim head `provisional`.** Otherwise GA
  records the interim title, as the listing did with "Listing not found" while loading.
- **Translated text read once in TypeScript waits for `ready()`.** A label translated before the
  language file loads comes back as the key itself.
- **`window.ng` exists only in dev builds.** The e2e helpers `titleAtNavigationEnd` and `gaTitles`
  hook the router through it, so the specs using them can't run against a production build.
- **Never skip a page view on `replaceUrl` alone.** In `@angular/router` 21, Back/Forward
  (`popstate`) and the first navigation are `replaceUrl` too (`_router-chunk.mjs:4237-4243`,
  `:4466-4470`). The trigger and the previous navigation decide whether it is a refinement.
- **A `[routerLink]="[]" [fragment]` link drops the query** unless it sets
  `queryParamsHandling="preserve"` (as the blog contents links now do). Without it, a jump on a
  `?utm_source=` link becomes a new page and loses the campaign tag.
- **`search_performed` still fires on every map pan, but says so.** Its `trigger` parameter
  (`arrival | place | everywhere | filter | map | retry`, `search-trigger.ts`) tells pans from
  searches; filter on `trigger != map` for searches. Added 2026-10-18 (Trello #157); earlier events
  carry none, and GA reports it only once it is registered as an event-scoped custom dimension.
- **The legal pages are English text at 18 language URLs**, each self-canonical with `hreflang` to
  match the sitemap, which claims translations that do not exist (Trello #139).
- **The e2e `waitForClient` also waits for the startup veil and the boot splash.** Both are full-screen
  and swallow clicks; the veil can legitimately stay up to six seconds (`StartupGate`).
- The sitemap leaves out `/search` and `/hostel/:id` on purpose (see the comment in `apps/web/src/app/features/public/landing/sitemap-urls.ts`).

## Decisions

- [Authenticated areas render client-only, in every locale shape](../decisions/ssr-seo-and-prerender/authenticated-areas-render-client-only.md)
- [The sitemap is generated by the SSR server from route data](../decisions/ssr-seo-and-prerender/sitemap-served-by-the-ssr-server.md)
- [Every route declares who owns its head; undeclared means noindex](../decisions/ssr-seo-and-prerender/route-level-head-ownership.md)
- [The title is part of the head; analytics waits for it to settle](../decisions/ssr-seo-and-prerender/title-is-part-of-the-head.md)

## See also

- `docs/DEPLOY.md` (env vars, `NG_ALLOWED_HOSTS`, rendering modes)
- [app-shell-and-routing](./app-shell-and-routing.md), [i18n](./i18n.md),
  [search-and-discovery](./search-and-discovery.md), [listing-and-booking](./listing-and-booking.md),
  [auth-and-session](./auth-and-session.md), [api-and-data](./api-and-data.md),
  [public-content](./public-content.md)
