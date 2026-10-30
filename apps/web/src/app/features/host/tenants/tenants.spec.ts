import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';
import { vi } from 'vitest';
import { API_CONFIG } from '@core/api-config';
import { SessionStore, SessionUser } from '@core/auth/session-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostOpsApi, HostPropertyStore } from '@services';
import { RefusalKind, refusalError } from '@app/testing/backend-refusals';
import { HOSTEL_ID, sessionUser } from '@app/testing/host-builders';
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
