import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';
import { Tenants } from './features/host/tenants/tenants';

export class AppRouteReuseStrategy implements RouteReuseStrategy {
  shouldDetach(_route: ActivatedRouteSnapshot): boolean { return false; }
  store(_route: ActivatedRouteSnapshot, _handle: DetachedRouteHandle | null): void {}
  shouldAttach(_route: ActivatedRouteSnapshot): boolean { return false; }
  retrieve(_route: ActivatedRouteSnapshot): DetachedRouteHandle | null { return null; }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    // Reuse the Tenants component when navigating between /tenants, /tenants/create,
    // and /tenants/edit/:id — prevents an unnecessary list API call on form open.
    if (future.component === Tenants && curr.component === Tenants) return true;
    return future.routeConfig === curr.routeConfig;
  }
}
