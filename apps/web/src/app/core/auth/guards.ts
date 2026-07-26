import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { Permission, Role } from './roles';
import { SessionStore } from './session-store';

/** Requires an authenticated session; otherwise routes to the Lead Wall. */
export const authGuard: CanActivateFn = (_route, state: RouterStateSnapshot) => {
  // SSR: cookies/localStorage are unavailable server-side so the session is never
  // populated during server rendering. Return true and let the client guard handle
  // auth after provideAppInitializer restores the session from the cookie.
  if (typeof window === 'undefined') return true;
  const session = inject(SessionStore);
  const router = inject(Router);
  return session.isAuthenticated()
    ? true
    : router.createUrlTree(['/auth'], {
        queryParams: { mode: 'login', returnUrl: state.url },
      });
};

/** Requires one of the given roles. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return (_route, state: RouterStateSnapshot) => {
    if (typeof window === 'undefined') return true;
    const session = inject(SessionStore);
    const router = inject(Router);
    if (!session.isAuthenticated())
      return router.createUrlTree(['/auth'], {
        queryParams: { mode: 'login', returnUrl: state.url },
      });
    return session.hasRole(...roles)
      ? true
      : router.createUrlTree(['/forbidden']);
  };
}

/** Requires a granular permission flag (e.g. `payments.refund`). */
export function permissionGuard(flag: Permission): CanActivateFn {
  return (_route, state: RouterStateSnapshot) => {
    if (typeof window === 'undefined') return true;
    const session = inject(SessionStore);
    const router = inject(Router);
    if (!session.isAuthenticated())
      return router.createUrlTree(['/auth'], {
        queryParams: { mode: 'login', returnUrl: state.url },
      });
    return session.hasPermission(flag)
      ? true
      : router.createUrlTree(['/forbidden']);
  };
}

/**
 * Manager/Warden are scoped to a single property. If the route carries a
 * `:propertyId`, it must match their scope. (Authoritative enforcement is
 * server-side; this guard only mirrors it — F8.)
 */
export const propertyScopeGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (!session.hasRole('manager', 'warden')) return true;
  const routeProp = route.paramMap.get('propertyId');
  return routeProp === null || routeProp === session.propertyId()
    ? true
    : router.createUrlTree(['/forbidden']);
};
