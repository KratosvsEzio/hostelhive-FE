# Scroll to top on a path change, not with `withInMemoryScrolling`

**Status:** Accepted
**Area:** [app-shell-and-routing](../../area/app-shell-and-routing.md)

## Context

`provideRouter` had no scrolling feature, which is Angular's `'disabled'` default, so a new page opened
at the scroll offset the last page left behind. Following a footer link from the bottom of a long
listing opened the next page halfway down.

## Decision

`startScrollReset` (`core/scroll-reset.ts`), started from an app initializer in the browser only,
scrolls to `[0, 0]` on `NavigationEnd` when the **path** changed (query and fragment ignored) and the
navigation was not a `popstate`. Back and Forward stay with the browser
(`history.scrollRestoration` is left at `'auto'`).

## Alternatives rejected

- **`withInMemoryScrolling({ scrollPositionRestoration: 'top' })`**, the obvious "fix". The search
  page publishes its filters and map bounds as query parameters (`router.navigate([], { queryParams })`
  in `apps/web/src/app/features/public/search/search-map/search-map.ts`), so every checkbox or map pan is a navigation. The built-in scroller would throw
  the reader to the top of the results each time.
- **`'enabled'` restoration.** Angular then takes over `history.scrollRestoration`, which changes
  Back/Forward behaviour the app was happy with.

## Consequences

- A page that changes its own path for in-page state would be scrolled to the top. Use query params
  for that.
- The consoles are not affected: their scroll is on an inner element in `DashboardLayout`, which is
  rebuilt for each route.

## Evidence

- `apps/web/src/app/core/scroll-reset.ts`, `apps/web/src/app/core/scroll-reset.spec.ts`
- `apps/web/src/app/app.config.ts` (initializer comment: "Deliberately not `withInMemoryScrolling`")
- Commit `e60bcf1` feat(i18n): translate the chrome, and give the blog its photographs
