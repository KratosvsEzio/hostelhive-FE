import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

/**
 * Pages whose drawers are route-driven (so the hardware back button closes them). Their list
 * route and drawer routes are separate `routeConfig`s pointing at the same component, which
 * the default identity check would treat as a different route — tearing the page down and
 * refetching its list every time a drawer opens. Opted in per route with `data: { drawerHost: true }`
 * rather than matching on `future.component === curr.component`, because components shared by
 * genuinely unrelated routes (AddGrocery serves both /mess/add and /expenses/new) must keep
 * re-initialising. Keyed on route data, not component classes, so this file pulls no page into
 * the initial bundle.
 */

export class AppRouteReuseStrategy implements RouteReuseStrategy {
  shouldDetach(_route: ActivatedRouteSnapshot): boolean { return false; }
  store(_route: ActivatedRouteSnapshot, _handle: DetachedRouteHandle | null): void {
    // Nothing is ever detached (shouldDetach is always false), so there is no handle to keep.
  }
  shouldAttach(_route: ActivatedRouteSnapshot): boolean { return false; }
  retrieve(_route: ActivatedRouteSnapshot): DetachedRouteHandle | null { return null; }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    if (
      future.component &&
      future.component === curr.component &&
      future.routeConfig?.data?.['drawerHost'] &&
      curr.routeConfig?.data?.['drawerHost']
    ) {
      return true;
    }
    return future.routeConfig === curr.routeConfig;
  }
}
