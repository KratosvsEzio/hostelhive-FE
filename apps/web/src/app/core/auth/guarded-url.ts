/**
 * Auth-policy helpers for deciding whether a URL is safe to send a signed-out user to.
 *
 * Both are read by the Lead Wall, which is handed a `returnUrl` by several unrelated
 * openers — some public, some behind a guard — and must not bounce a guest straight
 * back into the guard that sent them there.
 */

import { Route } from '@angular/router';

/** Strips the query and fragment, then splits the path into non-empty segments. */
function segmentsOf(url: string): string[] {
  return url.split(/[?#]/)[0].split('/').filter(Boolean);
}

/** Whether a route's `path` claims the leading segments of `segments`, Angular-style. */
function matchesPrefix(routePath: string, segments: string[]): boolean {
  if (routePath === '**') return true;
  const routeSegments = segmentsOf(routePath);
  // An empty path consumes nothing, so at the top level it only ever matches the root URL.
  if (!routeSegments.length) return !segments.length;
  if (routeSegments.length > segments.length) return false;
  return routeSegments.every(
    (segment, i) => segment.startsWith(':') || segment === segments[i],
  );
}

function isGuarded(route: Route): boolean {
  return !!route.canActivate?.length || !!route.canActivateChild?.length;
}

/**
 * True when `url` sits under a top-level route that carries a `canActivate` guard.
 *
 * Derived from the live router config rather than a hand-maintained prefix list, so a
 * newly guarded route is picked up without touching this file. Routes are tested in
 * declaration order, matching how the router itself resolves a URL.
 */
export function isGuardedUrl(routes: Route[], url: string): boolean {
  const segments = segmentsOf(url);
  const match = routes.find((route) =>
    matchesPrefix(route.path ?? '', segments),
  );
  return !!match && isGuarded(match);
}

/**
 * Narrows `url` to an app-internal absolute path, or `null` if it is anything else.
 *
 * A value like `//evil.com` or `/\evil.com` serialises to a protocol-relative `href`
 * that the browser resolves off-origin, so an attacker-supplied `returnUrl` would be an
 * open redirect. Only a single leading slash is accepted.
 */
export function safeInternalUrl(url: string | null | undefined): string | null {
  return url && /^\/(?![/\\])/.test(url) ? url : null;
}
