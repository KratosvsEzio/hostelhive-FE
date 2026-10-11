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
  `clearJsonLd`, `preloadImage`).
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

**Head tags.** A page calls `Seo.apply({ title, description, path, image, noindex, type })`.
- **`path`** is written without a locale. `Seo` adds the active locale for the canonical and `og:url`. Every tag is overwritten, because components are reused across navigations.
- **Canonical:** only an indexable page that has a path gets one. A `noindex` page never has a canonical, even when it has a path, and it gets no `hreflang`.
- **`og:url`:** written whenever there is a path. With no path, `Seo` writes no canonical, `og:url` or `hreflang` at all; there is no `'/'` default.
- **Removal:** a tag `Seo` does not write is **removed**, not just skipped. `index.html` ships a static canonical and `og:url` for the home page, so skipping would leave them pointing at home.
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
- `Seo.clearOnDestroy` for any new page that calls `setJsonLd` or `preloadImage`, instead of its own `DestroyRef` block.
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
- **A click before the app boots strands the server page's JSON-LD.** The router replaces the first
  navigation before the page component exists in the browser, so `clearOnDestroy` never runs (Trello
  #138). In e2e, wait for `waitForClient` (`apps/web-e2e/src/support/seo.ts`) before clicking. Without
  that wait, a head check after the click can pass using only the server HTML.
- **`Blog` calls `apply` once, in its constructor.** A client language switch keeps the old canonical
  (Trello #132). `og:locale` is fixed at `en_PK` (#133).
- The sitemap leaves out `/search` and `/hostel/:id` on purpose (see the comment in `apps/web/src/app/features/public/landing/sitemap-urls.ts`).

## Decisions

- [Authenticated areas render client-only, in every locale shape](../decisions/ssr-seo-and-prerender/authenticated-areas-render-client-only.md)
- [The sitemap is generated by the SSR server from route data](../decisions/ssr-seo-and-prerender/sitemap-served-by-the-ssr-server.md)

## See also

- `docs/DEPLOY.md` (env vars, `NG_ALLOWED_HOSTS`, rendering modes)
- [app-shell-and-routing](./app-shell-and-routing.md), [i18n](./i18n.md),
  [search-and-discovery](./search-and-discovery.md), [listing-and-booking](./listing-and-booking.md),
  [auth-and-session](./auth-and-session.md), [api-and-data](./api-and-data.md),
  [public-content](./public-content.md)
