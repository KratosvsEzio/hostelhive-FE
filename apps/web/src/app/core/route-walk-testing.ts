import { Route } from '@angular/router';
import type { RouteHead } from './route-head';

/** A route that renders a page, with where it sits and which head owner and title it ends up with. */
export interface PageRoute {
  /** The path under the language prefix, e.g. `account/settings`. */
  path: string;
  /** The deepest `data.head` on the way down, the same rule `routeHeadFor` applies at runtime. */
  head: RouteHead['head'];
  /** The route's own `title:` key, or undefined when it declares none (or a resolver function). */
  title: string | undefined;
  /** The deepest `title:` key on the way down, the one the page would end up with. */
  resolvedTitle: string | undefined;
}

/** Resolves a `loadChildren` result to its routes, whichever shape the loader returned. */
export async function lazyRoutes(route: Route, where: string): Promise<Route[]> {
  const loaded: unknown = await (route.loadChildren as () => unknown)();
  if (Array.isArray(loaded)) return loaded as Route[];
  const fromDefault = (loaded as { default?: unknown } | null)?.default;
  if (Array.isArray(fromDefault)) return fromDefault as Route[];
  throw new Error(`The lazy children of "${where}" are not a route array, so they cannot be read`);
}

/**
 * Every route under the given tree that renders a component, lazy children included — for specs only.
 *
 * `head` is the deepest `data.head` on the way down, the same rule `routeHeadFor` applies at
 * runtime. `title` is the route's own string `title:`, `resolvedTitle` the deepest one on the
 * way down. Redirects render nothing and are skipped.
 */
export async function pageRoutes(
  routes: Route[],
  prefix = '',
  inherited?: RouteHead['head'],
  inheritedTitle?: string,
): Promise<PageRoute[]> {
  const found: PageRoute[] = [];
  for (const route of routes) {
    if (route.redirectTo !== undefined) continue;
    const path = [prefix, route.path].filter(Boolean).join('/');
    const head = (route.data?.['head'] as RouteHead['head']) ?? inherited;
    const title = typeof route.title === 'string' ? route.title : undefined;
    const resolvedTitle = title ?? inheritedTitle;
    if (route.component || route.loadComponent) {
      found.push({ path, head, title, resolvedTitle });
    }
    if (route.children) {
      found.push(...(await pageRoutes(route.children, path, head, resolvedTitle)));
    }
    if (typeof route.loadChildren === 'function') {
      found.push(
        ...(await pageRoutes(await lazyRoutes(route, path), path, head, resolvedTitle)),
      );
    }
  }
  return found;
}
