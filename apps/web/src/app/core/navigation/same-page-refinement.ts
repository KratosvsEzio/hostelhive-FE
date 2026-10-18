import { Navigation, UrlTree } from '@angular/router';
import { pagePath } from '@core/scroll-reset';

/**
 * True when a landed navigation only refines the page already on screen, rather than
 * arriving at one.
 *
 * One definition for both readers that need to tell the two apart: analytics, which counts
 * an arrival as a page view and skips a refinement (`GoogleAnalyticsService`), and the
 * search page, which judges the link it arrived by and keeps that verdict while the map
 * writes its own viewport into the address (`SearchMap`'s `arrivedWithViewport`).
 *
 * `nav` is the router's record of the navigation that just ended, and `url` its
 * `urlAfterRedirects`. Two cases, both compared with the locale prefix kept, as `page_path`
 * is, so a replace that only changes the language still counts:
 *
 * 1. **A same-path replace issued by the app** — the search map writing its viewport, a pan,
 *    a zoom, the listing clearing `?review`. Trigger, `replaceUrl` and a previous navigation
 *    are all required because the router marks more than these as `replaceUrl`: the initial
 *    navigation is an imperative replace with nothing before it, and Back/Forward arrive as
 *    `popstate` replaces (`_router-chunk.mjs:4237-4243`, `:4466-4470`). A visitor stepping
 *    back between two search entries is moving to a page, not refining one.
 * 2. **A fragment-only move** — a blog contents link — whatever its trigger: same path, same
 *    query, a different `#fragment`. `scroll-reset` treats it as the same page for the same
 *    reason.
 *
 * Pushed query changes (a filter Apply, an amenity toggle, a place pick) are not refinements
 * and stay page views.
 */
export function isSamePageRefinement(
  nav: Pick<Navigation, 'trigger' | 'extras' | 'previousNavigation'>,
  url: string,
  serialize: (tree: UrlTree) => string,
): boolean {
  const previousTree = nav.previousNavigation?.finalUrl;
  // No page counted before this one (the first load), so there is nothing to refine.
  if (!previousTree) return false;
  const previous = serialize(previousTree);

  const withoutFragment = (u: string) => u.split('#')[0];
  if (previous !== url && withoutFragment(previous) === withoutFragment(url)) return true;

  return (
    nav.trigger === 'imperative' && !!nav.extras.replaceUrl && pagePath(previous) === pagePath(url)
  );
}
