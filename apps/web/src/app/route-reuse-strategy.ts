import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';
import { Rooms } from './features/host/rooms/rooms';
import { Tenants } from './features/host/tenants/tenants';
import { Invoices } from './features/host/invoices/invoices';

/**
 * Pages whose drawers are route-driven (so the hardware back button closes them). Their list
 * route and drawer routes are separate `routeConfig`s pointing at the same component, which
 * the default identity check would treat as a different route — tearing the page down and
 * refetching its list every time a drawer opens. Listed explicitly rather than matching on
 * `future.component === curr.component`, because components shared by genuinely unrelated
 * routes (AddGrocery serves both /mess/add and /expenses/new) must keep re-initialising.
 */
const DRAWER_HOST_COMPONENTS: unknown[] = [Tenants, Rooms, Invoices];

export class AppRouteReuseStrategy implements RouteReuseStrategy {
  shouldDetach(_route: ActivatedRouteSnapshot): boolean { return false; }
  store(_route: ActivatedRouteSnapshot, _handle: DetachedRouteHandle | null): void {}
  shouldAttach(_route: ActivatedRouteSnapshot): boolean { return false; }
  retrieve(_route: ActivatedRouteSnapshot): DetachedRouteHandle | null { return null; }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    if (
      future.component &&
      future.component === curr.component &&
      DRAWER_HOST_COMPONENTS.includes(future.component)
    ) {
      return true;
    }
    return future.routeConfig === curr.routeConfig;
  }
}
