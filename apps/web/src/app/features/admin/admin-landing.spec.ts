import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot } from '@angular/router';
import { Permission, Role, SessionStore } from '@core/auth';
import { adminLanding } from './admin-landing';

describe('adminLanding', () => {
  afterEach(() => TestBed.resetTestingModule());

  function landFor(roles: Role[], permissions: Permission[]): unknown {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SessionStore,
          useValue: {
            hasRole: (...wanted: Role[]) => roles.some((r) => wanted.includes(r)),
            hasPermission: (flag: Permission) => permissions.includes(flag),
          },
        },
      ],
    });
    return TestBed.runInInjectionContext(() =>
      adminLanding({} as ActivatedRouteSnapshot),
    );
  }

  it('lands an admin on billing, whatever else they may open', () => {
    expect(landFor(['admin'], ['admin:Role:index'])).toBe('billing');
  });

  it('lands a moderator on the review queue', () => {
    expect(landFor(['moderator'], ['moderator:Hostel:index'])).toBe('queue');
  });

  it('lands support on the first page their flags open, in sidebar order', () => {
    expect(landFor(['support'], ['admin:Hostel:index'])).toBe('listings');
    expect(landFor(['support'], ['admin:Hostel:index', 'admin:Role:index'])).toBe('roles');
  });

  // Billing follows the backend, which admits only the admin role.
  it('keeps a super-admin without the admin role off billing', () => {
    expect(
      landFor(['super-admin'], ['admin:Role:index', 'moderator:Hostel:index', 'admin:Hostel:index']),
    ).toBe('roles');
  });

  // The listings guard then sends them to the forbidden page.
  it('falls back to listings when no page is open', () => {
    expect(landFor(['support'], [])).toBe('listings');
  });

  it('returns relative paths, so the language prefix survives', () => {
    for (const result of [
      landFor(['admin'], []),
      landFor(['moderator'], ['moderator:Hostel:index']),
      landFor([], []),
    ]) {
      expect(typeof result).toBe('string');
      expect(result as string).not.toMatch(/^\//);
    }
  });
});
