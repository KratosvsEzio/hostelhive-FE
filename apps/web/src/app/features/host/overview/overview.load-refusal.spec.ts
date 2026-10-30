import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { SessionStore } from '@core/auth/session-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostOpsApi, HostPropertyStore, OverviewApi } from '@services';
import { HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { RefusalKind, refusalError } from '@app/testing/backend-refusals';
import { HOSTEL_ID, invoicesReply, sessionUser } from '@app/testing/host-builders';
import { LIST_LOAD_REFUSALS, PLAN_REFUSALS, kindsShowing, loadSurface } from '@app/testing/load-refusal-surface';
import { HostOverview } from './overview';

const API = `https://api.test/api/host/hostels/${HOSTEL_ID}`;

/** The two cards whose labels prove the page rendered its loaded content. */
const KPIS = [
  { key: 'pending-rent', label: 'Pending rent', value: '', rawValue: 12000, prefix: 'Rs ', tone: 'danger' },
  { key: 'collected', label: 'Collected', value: '', rawValue: 48000, prefix: 'Rs ', tone: 'ok' },
];

const ROLE_BODY = {
  host: 'hostAccess.pageNotAllowedOwner',
  manager: 'hostAccess.pageNotAllowed',
} as const;

type PageRole = keyof typeof ROLE_BODY;

const ROLES = Object.keys(ROLE_BODY) as PageRole[];

/** The refusal `overview_cards` answers with, as the page receives it. */
const cardsRefusal = (kind: RefusalKind) =>
  throwError(() => refusalError(kind, { url: `${API}/overview_cards` }));

interface OpenOptions {
  cards: () => Observable<unknown>;
  revenue?: () => Observable<unknown>;
  role?: PageRole;
}

/**
 * Renders the real template. The signed-in role is read when the panel is created, so the
 * session is set before the page; the two chart reads stay pending unless a test answers them.
 */
async function openOverview({ cards, revenue = () => NEVER, role = 'host' }: OpenOptions): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      {
        provide: HostPropertyStore,
        useValue: { selected: signal(HOSTEL_ID), isMonthlyBilled: () => true, timeZoneOf: () => of(null) },
      },
      { provide: HostBookingsApi, useValue: { calendar: () => of({ days: [] }) } },
      { provide: HostOpsApi, useValue: { invoices: () => of(invoicesReply()) } },
      {
        provide: OverviewApi,
        useValue: { overviewCards: cards, monthlyRevenue: revenue, tenantMovement: () => NEVER },
      },
    ],
  });
  TestBed.inject(SessionStore).setSession(sessionUser(role), 'tok');

  const fixture = TestBed.createComponent(HostOverview);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

afterEach(() => TestBed.inject(SessionStore).clear());

describe('Overview when the cards are refused for a missing permission', () => {
  const cases = kindsShowing('permission').flatMap((kind) => ROLES.map((role) => [kind, role] as const));

  it.each(cases)('a %s refusal for the %s shows the permission panel and nothing else', async (kind, role) => {
    const el = await openOverview({ cards: () => cardsRefusal(kind), role });

    const reading = loadSurface(el);
    expect(reading.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
    expect(reading.heading).toBe('coreForbidden.accessBlocked');
    expect(reading.body).toBe(ROLE_BODY[role]);
    expect(reading.retry).toBe(false);
    expect(reading.text).not.toContain('Pending rent');
    expect(reading.text).not.toContain('hostOverview.weCouldnTLoadAnalytics');
    expect(reading.text).not.toMatch(/not authorized|subscribe/i);
  });
});

describe('Overview when the cards are refused for a plan the console lock owns', () => {
  it.each(PLAN_REFUSALS)(
    'a %s refusal shows the generic error with Retry, not the panel',
    async (kind) => {
      const el = await openOverview({ cards: () => cardsRefusal(kind) });

      const reading = loadSurface(el);
      expect(reading.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(reading.heading).toBe('states.somethingWentWrong');
      expect(reading.body).toBe('hostOverview.weCouldnTLoadAnalytics');
      expect(reading.retry).toBe(true);
    },
  );
});

describe('Overview when the cards fail for any other reason the server answered', () => {
  const kinds = kindsShowing('error').filter((kind) => !PLAN_REFUSALS.includes(kind));

  it.each(kinds)('a %s refusal shows the generic error with Retry', async (kind) => {
    const el = await openOverview({ cards: () => cardsRefusal(kind) });

    const reading = loadSurface(el);
    expect(reading.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
    expect(reading.heading).toBe('states.somethingWentWrong');
    expect(reading.body).toBe('hostOverview.weCouldnTLoadAnalytics');
    expect(reading.retry).toBe(true);
  });
});

describe('Overview when the server cannot be reached', () => {
  it.each(kindsShowing('network'))('a %s failure shows the connection error with Retry', async (kind) => {
    const el = await openOverview({ cards: () => cardsRefusal(kind) });

    const reading = loadSurface(el);
    expect(reading.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
    expect(reading.heading).toBe('states.cantConnect');
    expect(reading.retry).toBe(true);
  });
});

describe('Overview when only one chart is refused', () => {
  it('keeps the cards and puts the refusal inside that chart, never the page panel', async () => {
    const el = await openOverview({
      cards: () => of({ kpis: KPIS }),
      revenue: () => throwError(() => refusalError('permissionCanCan', { url: `${API}/monthly_revenue` })),
    });

    expect(el.querySelector('hh-permission-refused')).toBeNull();
    expect(loadSurface(el).surfaces).not.toContain('permission');
    expect(loadSurface(el).text).toContain('Pending rent');
    expect(loadSurface(el).text).toContain('Collected');
    expect(loadSurface(el).text).toContain('common.chartDataIsCurrently');
  });
});
