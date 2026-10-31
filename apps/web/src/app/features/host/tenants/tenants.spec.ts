import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { API_CONFIG } from '@core/api-config';
import { SessionStore, SessionUser } from '@core/auth/session-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostOpsApi, HostPropertyStore } from '@services';
import { RefusalKind, refusalError } from '@app/testing/backend-refusals';
import { HOSTEL_ID, sessionUser } from '@app/testing/host-builders';
import { NotificationSpy } from '@app/testing/host-stubs';
import { Tenant } from '@hostelhive/data-access';
import { LIST_LOAD_REFUSALS, PLAN_REFUSALS, kindsShowing, loadSurface } from '@app/testing/load-refusal-surface';
import { Tenants } from './tenants';

const ROLE_BODY = {
  host: 'hostAccess.pageNotAllowedOwner',
  manager: 'hostAccess.pageNotAllowed',
} as const;

type PageRole = keyof typeof ROLE_BODY;

const ROLES = Object.keys(ROLE_BODY) as PageRole[];

/**
 * Renders the real template with the tenants read answered by `kind`, as the real interceptor
 * shapes it. The session is signed in before the page exists, because the panel reads the role
 * when it is created.
 */
async function openTenants(
  kind: RefusalKind,
  role: PageRole = 'host',
  session: Partial<SessionUser> = {},
): Promise<HTMLElement> {
  const renters = vi.fn(() =>
    throwError(() => refusalError(kind, { url: `https://api.test/api/host/hostels/${HOSTEL_ID}/renters` })),
  );
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { baseUrl: 'https://api.test' } },
      provideI18nTesting(),
      { provide: HostPropertyStore, useValue: { selected: signal(HOSTEL_ID) } },
      { provide: HostOpsApi, useValue: { renters } },
    ],
  });
  TestBed.inject(SessionStore).setSession(sessionUser(role, session), 'tok');

  const fixture = TestBed.createComponent(Tenants);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

afterEach(() => TestBed.inject(SessionStore).clear());

describe('Tenants when the list load is refused', () => {
  describe('for a missing permission', () => {
    const cases = kindsShowing('permission').flatMap((kind) => ROLES.map((role) => [kind, role] as const));

    it.each(cases)('a %s refusal for the %s shows the permission panel and nothing else', async (kind, role) => {
      const el = await openTenants(kind, role);

      const reading = loadSurface(el);
      expect(reading.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(reading.heading).toBe('coreForbidden.accessBlocked');
      expect(reading.body).toBe(ROLE_BODY[role]);
      expect(reading.retry).toBe(false);
      expect(el.querySelector('hh-data-table')).toBeNull();
      expect(reading.text).not.toMatch(/not authorized|subscribe/i);
    });
  });

  describe('for a plan refusal, which the console lock owns', () => {
    it.each(PLAN_REFUSALS)(
      'a %s refusal shows the generic error with Retry, not the panel',
      async (kind) => {
        const el = await openTenants(kind);

        const reading = loadSurface(el);
        expect(reading.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
        expect(reading.heading).toBe('states.somethingWentWrong');
        expect(reading.retry).toBe(true);
      },
    );
  });

  describe('for any other reason the server answered', () => {
    const kinds = kindsShowing('error').filter((kind) => !PLAN_REFUSALS.includes(kind));

    it.each(kinds)('a %s refusal shows the generic error with Retry', async (kind) => {
      const el = await openTenants(kind);

      const reading = loadSurface(el);
      expect(reading.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(reading.heading).toBe('states.somethingWentWrong');
      expect(reading.retry).toBe(true);
    });
  });

  describe('when the server cannot be reached', () => {
    it.each(kindsShowing('network'))('a %s failure shows the connection error with Retry', async (kind) => {
      const el = await openTenants(kind);

      const reading = loadSurface(el);
      expect(reading.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(reading.heading).toBe('states.cantConnect');
      expect(reading.retry).toBe(true);
    });
  });

  describe('header action', () => {
    /** The empty state offers the same label, so the header's is the only one to find when the list failed. */
    const registerButtons = (el: HTMLElement) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button')).filter(
        (b) => b.textContent?.trim() === 'hostTenants.registerTenant',
      );

    /** A manager's flags go stale, and a session with none is not gated: either way the button shows. */
    it.each([
      ['no permission flags', []],
      ['a flag for creating tenants', ['host:Renter:create']],
    ])('stays enabled for a manager holding %s when the list is refused for permission', async (_name, permissions) => {
      const el = await openTenants('permissionCanCan', 'manager', { permissions });

      const buttons = registerButtons(el);
      expect(loadSurface(el).surfaces).toEqual(['permission']);
      expect(buttons).toHaveLength(1);
      expect(buttons[0].disabled).toBe(false);
    });

    it('stays enabled after a no-live-plan refusal, which the console lock answers, not the page', async () => {
      const el = await openTenants('inactive', 'manager');

      const buttons = registerButtons(el);
      expect(buttons).toHaveLength(1);
      expect(buttons[0].disabled).toBe(false);
    });
  });
});

const STATUSES = [
  { name: 'Active', slug: 'active', count: 1, dispositionId: 11 },
  { name: 'Inactive', slug: 'inactive', count: 0, dispositionId: 22 },
];

const QUIET_OPTS = { suppressErrorToast: true };

const TOAST_BY_ROLE = {
  host: 'hostBookings.notAllowedOwner',
  manager: 'hostBookings.notAllowed',
} as const;

/** The members the action specs drive; all `protected`. */
interface TenantActions {
  setActive(t: Tenant): void;
  setInactive(t: Tenant): void;
  reinvite(t: Tenant): void;
  state(): { data: Tenant[] | null };
}

/** A row as the list returns it; only what the status actions and the spec read. */
const ROW = { id: 'rn-1', name: 'Ali Khan', status: 'active' } as unknown as Tenant;

/** The page with one tenant, signed in as `role`, whose writes (patch and invite) all fail with `kind`. */
async function openWithFailingActions(kind: RefusalKind, role: PageRole = 'manager') {
  const fail = () => throwError(() => refusalError(kind, { method: 'PATCH' }));
  const ops = {
    renters: vi.fn(() => of({ renters: [ROW], total: 1, statuses: STATUSES })),
    patchRenter: vi.fn(fail),
    inviteTenant: vi.fn(fail),
  };
  const notifications = new NotificationSpy();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { baseUrl: 'https://api.test' } },
      provideI18nTesting(),
      { provide: HostPropertyStore, useValue: { selected: signal(HOSTEL_ID) } },
      { provide: HostOpsApi, useValue: ops },
      notifications.provider(),
    ],
  });
  TestBed.inject(SessionStore).setSession(sessionUser(role), 'tok');

  const fixture = TestBed.createComponent(Tenants);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const page = fixture.componentInstance as unknown as TenantActions;
  return { ops, notifications, page };
}

describe('Tenants status actions and re-invite when refused', () => {
  describe.each(ROLES)('for the %s', (role) => {
    it.each(kindsShowing('permission'))('a %s refusal on set active raises one pinned translated toast and leaves the row', async (kind) => {
      const { ops, notifications, page } = await openWithFailingActions(kind, role);

      page.setActive(ROW);

      expect(ops.patchRenter).toHaveBeenCalledWith(HOSTEL_ID, 'rn-1', { disposition_id: 11 }, QUIET_OPTS);
      expect(notifications.raised).toEqual([{ kind: 'error', title: TOAST_BY_ROLE[role], ttlMs: 0 }]);
      expect(notifications.apiErrors).toEqual([]);
      expect(page.state().data).toEqual([ROW]);
    });

    it.each(kindsShowing('permission'))('a %s refusal on set inactive raises one pinned translated toast and leaves the row', async (kind) => {
      const { ops, notifications, page } = await openWithFailingActions(kind, role);

      page.setInactive(ROW);

      expect(ops.patchRenter).toHaveBeenCalledWith(HOSTEL_ID, 'rn-1', { disposition_id: 22 }, QUIET_OPTS);
      expect(notifications.raised).toEqual([{ kind: 'error', title: TOAST_BY_ROLE[role], ttlMs: 0 }]);
      expect(notifications.apiErrors).toEqual([]);
      expect(page.state().data).toEqual([ROW]);
    });
  });

  it.each(['crmRequired', 'crmMessageOnly'] as const)('a %s refusal on re-invite says the plan has no CRM, quietly', async (kind) => {
    const { ops, notifications, page } = await openWithFailingActions(kind);

    page.reinvite(ROW);

    expect(ops.inviteTenant).toHaveBeenCalledWith(HOSTEL_ID, 'rn-1', QUIET_OPTS);
    expect(notifications.raised).toEqual([{ kind: 'error', title: 'hostBookings.planHasNoCrm', ttlMs: 0 }]);
    expect(notifications.apiErrors).toEqual([]);
  });

  it('hands a failed re-invite that is not a refusal to the app notifier once', async () => {
    const { notifications, page } = await openWithFailingActions('serverError');

    page.reinvite(ROW);

    expect(notifications.apiErrors).toHaveLength(1);
    expect(notifications.apiErrors[0].status).toBe(500);
    expect(notifications.raised).toEqual([]);
  });
});

describe('Tenants list read', () => {
  it('goes out without the global error toast, because the page draws its own error state', async () => {
    const { ops } = await openWithFailingActions('serverError');

    const call = ops.renters.mock.calls[0] as unknown as unknown[];
    expect(call[0]).toBe(HOSTEL_ID);
    expect(call.at(-1)).toEqual(QUIET_OPTS);
  });
});
