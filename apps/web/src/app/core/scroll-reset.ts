/**
 * Puts a new page at the top, and leaves everything else where it was.
 *
 * `provideRouter` carried no scrolling feature at all, which is Angular's `'disabled'`
 * default: the window keeps whatever scroll offset the previous page left behind. Follow a
 * footer link from the bottom of a long listing and the next page opens halfway down.
 *
 * Angular's own `withInMemoryScrolling` is not usable here. It scrolls to the top on every
 * navigation with no stored position — and the search page publishes its filters and map
 * bounds as query parameters, so ticking a checkbox or panning the map *is* a navigation
 * (seven `router.navigate([], { queryParams })` calls in `search-map.ts` alone). With the
 * built-in scroller, adjusting a filter would throw the reader back to the top of the
 * results they were reading. So the trigger here is a change of **path**, not of URL.
 *
 * Back and forward are left alone. `history.scrollRestoration` stays `'auto'` — Angular
 * only takes it over when a scrolling feature is provided — so the browser keeps handling
 * those, exactly as it does today. This adds the missing forward reset and changes nothing
 * else.
 *
 * The console is unaffected by design: its scroll lives on an inner `overflow-y-auto` div
 * in `dashboard-layout`, which is rebuilt per route, so it already opens at the top.
 * `scrollToPosition` on the unscrollable console window is a harmless no-op.
 */
import { ViewportScroller } from '@angular/common';
import { inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

/** The part of a URL that decides whether this counts as a different page. */
export function pagePath(url: string): string {
  return url.split(/[?#]/)[0];
}

/**
 * True when this navigation should land at the top: a move to a different path that the
 * visitor asked for, rather than a query-string edit or a Back button.
 */
export function shouldResetScroll(
  from: string,
  to: string,
  trigger: NavigationStart['navigationTrigger'],
): boolean {
  if (trigger === 'popstate') return false;
  return pagePath(from) !== pagePath(to);
}

/** Wire the reset. Call from an app initializer; browser only. */
export function startScrollReset(): void {
  const router = inject(Router);
  const viewport = inject(ViewportScroller);

  let previous = router.url;
  // Captured on NavigationStart because NavigationEnd does not carry it.
  let trigger: NavigationStart['navigationTrigger'] = 'imperative';

  router.events
    .pipe(
      filter(
        (e): e is NavigationStart | NavigationEnd =>
          e instanceof NavigationStart || e instanceof NavigationEnd,
      ),
    )
    .subscribe((e) => {
      if (e instanceof NavigationStart) {
        trigger = e.navigationTrigger;
        return;
      }
      const next = e.urlAfterRedirects;
      if (shouldResetScroll(previous, next, trigger)) {
        viewport.scrollToPosition([0, 0]);
      }
      previous = next;
    });
}
