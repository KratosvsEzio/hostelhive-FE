import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Role, SessionStore } from '@core/auth';
import { ADMIN_ROUTES } from './admin.routes';
import { adminLanding } from './admin-landing';
import { ADMIN_BILLING_ROUTES } from './billing/admin-billing.routes';

describe('feature-admin routes', () => {
  // Every screen hangs off a single StaffLayout shell route that supplies the console
  // chrome, so asserting on the top level would only ever see that wrapper.
  const shell = ADMIN_ROUTES[0];
  const children = shell.children ?? [];
  const child = (path: string) => children.find((r) => r.path === path);

  it('nests every screen under the staff shell', () => {
    expect(ADMIN_ROUTES).toHaveLength(1);
    expect(shell.path).toBe('');
    expect(shell.component).toBeDefined();
  });

  it('exposes the admin screens', () => {
    const screens = children.map((r) => r.path).filter((p) => p !== '');
    expect([...screens].sort()).toEqual([
      'billing',
      'listings',
      'payments',
      'queue',
      'review/:id',
      'roles',
    ]);
  });

  it('lands through the role-aware redirect by default', () => {
    expect(children[0]).toMatchObject({ path: '', pathMatch: 'full', redirectTo: adminLanding });
  });

  it('mounts the billing pages without a component of its own, behind one guard', () => {
    const billing = child('billing');

    expect(billing?.component).toBeUndefined();
    expect(billing?.children).toBe(ADMIN_BILLING_ROUTES);
    expect(billing?.canActivate).toHaveLength(1);
  });

  describe('the billing guard', () => {
    afterEach(() => TestBed.resetTestingModule());

    function admits(roles: Role[]): boolean | UrlTree {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          {
            provide: SessionStore,
            useValue: {
              isAuthenticated: () => true,
              hasRole: (...wanted: Role[]) => roles.some((r) => wanted.includes(r)),
              // A guard on flags would pass everyone here; billing must not read them.
              hasPermission: () => true,
            },
          },
        ],
      });
      const guard = child('billing')?.canActivate?.[0] as CanActivateFn;
      return TestBed.runInInjectionContext(
        () => guard({} as ActivatedRouteSnapshot, { url: '/admin/billing' } as RouterStateSnapshot) as boolean | UrlTree,
      );
    }

    it('lets an admin in', () => {
      expect(admits(['admin'])).toBe(true);
    });

    it.each<Role[]>([['super-admin'], ['moderator'], ['support']])(
      'sends %s without the admin role to the forbidden page',
      (role) => {
        const result = admits([role]);

        expect(result).toBeInstanceOf(UrlTree);
        expect(String(result)).toBe('/forbidden');
      },
    );
  });

  it('sends the old payments page to the billing payments list', () => {
    expect(child('payments')).toEqual({
      path: 'payments',
      pathMatch: 'full',
      redirectTo: 'billing/payments',
    });
  });

  it.each([
    ['roles', 'adminAdminRoles.rolesPermissions'],
    ['listings', 'adminAdminListings.allListings'],
    ['queue', 'moderatorQueue.reviewQueue'],
  ])('keeps %s guarded and titled as before', (path, title) => {
    expect(child(path)?.title).toBe(title);
    expect(child(path)?.canActivate).toHaveLength(1);
  });
});
