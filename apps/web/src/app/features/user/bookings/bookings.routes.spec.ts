import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Route, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { appRoutes } from '../../../app.routes';
import { authGuard } from '@core/auth/guards';
import { SessionStore } from '@core/auth';

/** Every route with this path, anywhere in the tree, with the guards of the routes above it. */
function find(routes: Route[], path: string, inherited: unknown[] = []): { route: Route; guards: unknown[] }[] {
  const found: { route: Route; guards: unknown[] }[] = [];
  for (const r of routes) {
    const guards = [...inherited, ...(r.canActivate ?? []), ...(r.canActivateChild ?? [])];
    if (r.path === path) found.push({ route: r, guards });
    if (r.children) found.push(...find(r.children, path, guards));
  }
  return found;
}

/**
 * A booking names who is staying, their phone and email, and what they owe. None of that may
 * render for somebody who is not signed in — so both pages must sit under the account route's
 * `authGuard`, in every copy of the tree (the bare one and the `:locale` one).
 */
describe('the bookings pages require a signed-in user', () => {
  for (const path of ['bookings', 'bookings/:id']) {
    it(`guards /account/${path} in every locale tree`, () => {
      const hits = find(appRoutes, path).filter(({ guards }) => guards.includes(authGuard));
      const all = find(appRoutes, path).filter(({ route }) => !route.redirectTo);

      expect(all.length).toBeGreaterThan(0);
      // Only the account copies may exist, and every one of them is guarded.
      expect(hits.length).toBe(all.length);
    });
  }

  describe('authGuard', () => {
    function run(authenticated: boolean, url: string): boolean | UrlTree {
      TestBed.configureTestingModule({
        providers: [provideRouter([]), { provide: SessionStore, useValue: { isAuthenticated: () => authenticated } }],
      });
      return TestBed.runInInjectionContext(
        () => authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot) as boolean | UrlTree,
      );
    }

    it('sends a signed-out visitor to log in, and back to the booking afterwards', () => {
      const result = run(false, '/en/account/bookings/RbNKwO');

      expect(result).toBeInstanceOf(UrlTree);
      expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
        '/auth?mode=login&returnUrl=%2Fen%2Faccount%2Fbookings%2FRbNKwO',
      );
    });

    it('lets a signed-in guest through', () => {
      expect(run(true, '/en/account/bookings/RbNKwO')).toBe(true);
    });
  });
});
