import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { HostOpsApi, HostPropertyStore } from '@services';
import { UtilityBill } from '@hostelhive/data-access';
import { CANCAN_MESSAGE, RefusalKind, refusalError } from '@app/testing/backend-refusals';
import { HOSTEL_ID, sessionUser } from '@app/testing/host-builders';
import { hostPageDeps, hostPageProviders } from '@app/testing/host-page';
import { NotificationSpy, seedHostPropertyStore } from '@app/testing/host-stubs';
import { LIST_LOAD_REFUSALS, PLAN_REFUSALS, kindsShowing, loadSurface } from '@app/testing/load-refusal-surface';
import { API_CONFIG } from '@core/api-config';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import type { Role } from '@core/auth/roles';
import { SessionStore } from '@core/auth/session-store';
import { Utilities } from './utilities';

type Aggs = { billToPay: number; received: number; balance: number };
type Status = { name: string; slug: string; count: number };

interface UtilitiesShape {
  aggs: () => Aggs | null;
  statuses: () => Status[];
  bills: () => UtilityBill[];
  state: () => { loading: boolean };
  paginationConf: () => { total: number; totalPages: number | null };
  goToPage(p: number): void;
  promptDelete(b: UtilityBill, event: MouseEvent): void;
  confirmDelete(): void;
}

const BILL_A = { id: 'GPfbpD', totalAmount: 990 } as unknown as UtilityBill;
const BILL_B = { id: 'bCGPAU', totalAmount: 65 } as unknown as UtilityBill;

function listResponse(balance: number, dueCount: number) {
  return {
    bills: [BILL_A, BILL_B],
    total: 2,
    statuses: [{ name: 'Due', slug: 'due', count: dueCount }],
    aggs: { billToPay: 0, received: 0, balance },
  };
}

const click = { stopPropagation: () => undefined } as unknown as MouseEvent;

/** The options a quiet request carries, so the interceptor raises no toast of its own. */
const QUIET = { suppressErrorToast: true };

function setup(deleteResult: () => ReturnType<HostOpsApi['deleteUtilityBill']>, role?: Role) {
  const utilityBills = vi.fn().mockReturnValueOnce(of(listResponse(1055, 2)));
  const deleteUtilityBill = vi.fn(deleteResult);
  const notifications = new NotificationSpy();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      notifications.provider(),
      { provide: HostOpsApi, useValue: { utilityBills, deleteUtilityBill } },
      { provide: HostPropertyStore, useValue: { selected: signal('zppsla'), timeZoneOf: () => of(null) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
      { provide: API_CONFIG, useValue: { baseUrl: 'http://api.test' } },
    ],
  });
  TestBed.overrideComponent(Utilities, { set: { template: '', imports: [] } });
  if (role) TestBed.inject(SessionStore).setSession(sessionUser(role), 'tok');
  const fixture = TestBed.createComponent(Utilities);
  fixture.detectChanges();
  return { cmp: fixture.componentInstance as unknown as UtilitiesShape, fixture, utilityBills, deleteUtilityBill, notifications };
}

describe('Utilities — delete refreshes the summary cards', () => {
  it('re-reads the totals and status counts after a successful delete, without reloading the table', () => {
    const { cmp, fixture, utilityBills, deleteUtilityBill } = setup(() => of(undefined));
    expect(cmp.aggs()?.balance).toBe(1055);

    utilityBills.mockReturnValueOnce(of({ ...listResponse(65, 1), bills: [BILL_B], total: 1 }));
    cmp.promptDelete(BILL_A, click);
    cmp.confirmDelete();
    fixture.detectChanges();

    expect(deleteUtilityBill).toHaveBeenCalledWith('zppsla', 'GPfbpD', QUIET);
    expect(utilityBills).toHaveBeenCalledTimes(2);
    // The follow-up totals read repeats the table request without the quiet options.
    expect(utilityBills.mock.calls[1]).toEqual(utilityBills.mock.calls[0].slice(0, 4));
    expect(cmp.aggs()?.balance).toBe(65);
    expect(cmp.statuses()).toEqual([{ name: 'Due', slug: 'due', count: 1 }]);
    expect(cmp.bills().map((b) => b.id)).toEqual(['bCGPAU']);
    expect(cmp.state().loading).toBe(false);
  });

  it('updates the footer bill count after a successful delete', () => {
    const { cmp, fixture, utilityBills } = setup(() => of(undefined));
    expect(cmp.paginationConf().total).toBe(2);

    utilityBills.mockReturnValueOnce(of({ ...listResponse(65, 1), bills: [BILL_B], total: 1 }));
    cmp.promptDelete(BILL_A, click);
    cmp.confirmDelete();
    fixture.detectChanges();

    expect(cmp.paginationConf().total).toBe(1);
    expect(cmp.paginationConf().totalPages).toBe(1);
  });

  it('keeps the footer bill count when the delete or the follow-up read fails', () => {
    const failedDelete = setup(() => throwError(() => new Error('500')));
    failedDelete.cmp.promptDelete(BILL_A, click);
    failedDelete.cmp.confirmDelete();
    expect(failedDelete.cmp.paginationConf().total).toBe(2);

    TestBed.resetTestingModule();
    const failedRead = setup(() => of(undefined));
    failedRead.utilityBills.mockReturnValueOnce(throwError(() => new Error('network')));
    failedRead.cmp.promptDelete(BILL_A, click);
    failedRead.cmp.confirmDelete();
    expect(failedRead.cmp.paginationConf().total).toBe(2);
  });

  it('takes the footer bill count from the next list read after a delete corrected it', () => {
    const { cmp, fixture, utilityBills } = setup(() => of(undefined));
    utilityBills.mockReturnValueOnce(of({ ...listResponse(65, 1), bills: [BILL_B], total: 1 }));
    cmp.promptDelete(BILL_A, click);
    cmp.confirmDelete();
    fixture.detectChanges();
    expect(cmp.paginationConf().total).toBe(1);

    utilityBills.mockReturnValueOnce(of({ ...listResponse(500, 30), total: 30 }));
    cmp.goToPage(2);
    fixture.detectChanges();

    expect(cmp.paginationConf().total).toBe(30);
  });

  it('does not re-read the totals while the delete is still in flight', () => {
    const pending = new Subject<void>();
    const { cmp, utilityBills } = setup(() => pending.asObservable() as never);

    cmp.promptDelete(BILL_A, click);
    cmp.confirmDelete();

    expect(utilityBills).toHaveBeenCalledTimes(1);
    expect(cmp.bills().map((b) => b.id)).toEqual(['bCGPAU']);
  });

  it('keeps the old totals and restores the row when the delete fails', () => {
    const { cmp, utilityBills } = setup(() => throwError(() => new Error('500')));

    cmp.promptDelete(BILL_A, click);
    cmp.confirmDelete();

    expect(utilityBills).toHaveBeenCalledTimes(1);
    expect(cmp.aggs()?.balance).toBe(1055);
    expect(cmp.bills().map((b) => b.id)).toEqual(['GPfbpD', 'bCGPAU']);
  });

  it('keeps the old totals when the follow-up read fails', () => {
    const { cmp, utilityBills } = setup(() => of(undefined));
    utilityBills.mockReturnValueOnce(throwError(() => new Error('network')));

    cmp.promptDelete(BILL_A, click);
    cmp.confirmDelete();

    expect(utilityBills).toHaveBeenCalledTimes(2);
    expect(cmp.aggs()?.balance).toBe(1055);
    expect(cmp.bills().map((b) => b.id)).toEqual(['bCGPAU']);
  });
});

const UTILITY_BILLS_URL = `https://api.test/api/host/hostels/${HOSTEL_ID}/utility_bills`;

const ROLE_SENTENCES = [
  { role: 'host', sentence: 'hostAccess.pageNotAllowedOwner' },
  { role: 'manager', sentence: 'hostAccess.pageNotAllowed' },
] as const satisfies readonly { role: Role; sentence: string }[];

/** Mounts the real page, signed in as `role`, its list read answering with `read`. */
async function openRead(read: () => Observable<unknown>, role: Role = 'host') {
  const deps = hostPageDeps();
  Object.assign(deps.ops, { utilityBills: vi.fn(read) });
  TestBed.configureTestingModule({ providers: hostPageProviders({}, deps) });
  // The host store keeps its hostel list per user, so the session has to exist before it is seeded.
  TestBed.inject(SessionStore).setSession(sessionUser(role), 'tok');
  seedHostPropertyStore('month');
  const fixture = TestBed.createComponent(Utilities);
  for (let round = 0; round < 2; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { el, shown: loadSurface(el) };
}

/** The page's list read refused the way the backend refuses `kind`. */
const openRefused = (kind: RefusalKind, role: Role = 'host') =>
  openRead(() => throwError(() => refusalError(kind, { url: UTILITY_BILLS_URL })), role);

describe('Utilities — a refused list load', () => {
  // A signed-in host persists its hostel choice and the session persists itself; neither may reach the next test.
  afterEach(() => {
    TestBed.inject(HostPropertyStore).clear();
    TestBed.inject(SessionStore).clear();
  });

  it('renders the empty state, and no error surface, when the load succeeds with no bills', async () => {
    const { shown } = await openRead(() => of({ bills: [], total: 0, statuses: [], aggs: { billToPay: 0, received: 0, balance: 0 } }));

    expect(shown.surfaces).toEqual([]);
    expect(shown.text).toContain('hostUtilities.noUtilityBillsYet');
  });

  describe('for a permission the role lacks', () => {
    const cases = kindsShowing('permission').flatMap((kind) => ROLE_SENTENCES.map((r) => ({ kind, ...r })));

    it.each(cases)('says a $role account may not see this, and offers no retry, after a $kind refusal', async ({ kind, role, sentence }) => {
      const { el, shown } = await openRefused(kind, role);

      expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(shown.heading).toBe('coreForbidden.accessBlocked');
      expect(shown.body).toBe(sentence);
      expect(shown.retry).toBe(false);
      expect(shown.text).not.toContain('common.retry');
      expect(shown.text).not.toContain(CANCAN_MESSAGE);
      expect(shown.text).not.toContain('hostUtilities.noUtilityBillsYet');
      expect(el.querySelector('hh-data-table')).toBeNull();
    });
  });

  describe('for a plan refusal, which the console lock owns', () => {
    it.each(PLAN_REFUSALS)('shows the generic error with Retry, not the panel, after a %s refusal', async (kind) => {
      const { shown } = await openRefused(kind);

      expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(shown.heading).toBe('states.somethingWentWrong');
      expect(shown.retry).toBe(true);
      expect(shown.text).not.toContain('hostAccess.pageNotAllowed');
    });
  });

  describe('for a failure that is not a permission or plan refusal', () => {
    it.each<RefusalKind>(['rateLimited', 'notFound', 'unprocessable', 'serverError'])(
      'shows the generic error with Retry after a %s refusal',
      async (kind) => {
        const { shown } = await openRefused(kind);

        expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
        expect(shown.heading).toBe('states.somethingWentWrong');
        expect(shown.retry).toBe(true);
        expect(shown.text).not.toContain('hostAccess.pageNotAllowed');
      },
    );
  });

  describe('when the server never answers', () => {
    it.each(kindsShowing('network'))('shows the connection error with Retry after a %s failure', async (kind) => {
      const { shown } = await openRefused(kind);

      expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(shown.heading).toBe('states.cantConnect');
      expect(shown.retry).toBe(true);
      expect(shown.text).not.toContain('hostAccess.pageNotAllowed');
    });
  });
});

const DELETE_URL = `${UTILITY_BILLS_URL}/GPfbpD`;

/** What the page toasts for each role after a permission refusal. */
const TOAST_BY_ROLE = [
  { role: 'host', title: 'hostBookings.notAllowedOwner' },
  { role: 'manager', title: 'hostBookings.notAllowed' },
] as const satisfies readonly { role: Role; title: string }[];

describe('Utilities — a refused delete', () => {
  afterEach(() => TestBed.inject(SessionStore).clear());

  const refusedDelete = (kind: RefusalKind, role?: Role) =>
    setup(() => throwError(() => refusalError(kind, { method: 'DELETE', url: DELETE_URL })), role);
  const permissionCases = kindsShowing('permission').flatMap((kind) => TOAST_BY_ROLE.map((r) => ({ kind, ...r })));

  it('sends the list read and the delete without the global toast', () => {
    const { cmp, utilityBills, deleteUtilityBill } = setup(() => of(undefined));
    utilityBills.mockReturnValueOnce(of(listResponse(65, 1)));

    cmp.promptDelete(BILL_A, click);
    cmp.confirmDelete();

    expect(utilityBills.mock.calls[0][4]).toEqual(QUIET);
    expect(deleteUtilityBill).toHaveBeenCalledWith('zppsla', 'GPfbpD', QUIET);
  });

  it.each(permissionCases)(
    'raises one pinned $role-worded toast, restores the row and leaves the totals after a $kind refusal',
    ({ kind, role, title }) => {
      const { cmp, utilityBills, notifications } = refusedDelete(kind, role);

      cmp.promptDelete(BILL_A, click);
      cmp.confirmDelete();

      expect(notifications.raised).toEqual([{ kind: 'error', title, ttlMs: 0 }]);
      expect(notifications.apiErrors).toEqual([]);
      expect(JSON.stringify(notifications.raised)).not.toContain(CANCAN_MESSAGE);
      expect(cmp.bills().map((b) => b.id)).toEqual(['GPfbpD', 'bCGPAU']);
      expect(utilityBills).toHaveBeenCalledTimes(1);
      expect(cmp.aggs()?.balance).toBe(1055);
    },
  );

  it.each<Role>(['host', 'manager'])('raises one pinned plan toast for a %s account when the plan has no CRM', (role) => {
    const { cmp, utilityBills, notifications } = refusedDelete('crmRequired', role);

    cmp.promptDelete(BILL_A, click);
    cmp.confirmDelete();

    expect(notifications.raised).toEqual([{ kind: 'error', title: 'hostBookings.planHasNoCrm', ttlMs: 0 }]);
    expect(notifications.apiErrors).toEqual([]);
    expect(cmp.bills().map((b) => b.id)).toEqual(['GPfbpD', 'bCGPAU']);
    expect(utilityBills).toHaveBeenCalledTimes(1);
  });

  it('hands a server error to the app-wide notifier once and raises no toast of its own', () => {
    const { cmp, notifications } = refusedDelete('serverError', 'host');

    cmp.promptDelete(BILL_A, click);
    cmp.confirmDelete();

    expect(notifications.raised).toEqual([]);
    expect(notifications.apiErrors).toHaveLength(1);
    expect(notifications.apiErrors[0].status).toBe(500);
    expect(cmp.bills().map((b) => b.id)).toEqual(['GPfbpD', 'bCGPAU']);
  });
});
