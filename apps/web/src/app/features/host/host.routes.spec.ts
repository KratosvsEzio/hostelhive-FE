import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Route,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, Subject, defer, isObservable, of } from 'rxjs';
import { HostListing, HostListingsData } from '@hostelhive/data-access';
import { HostPropertyStore } from '@services';
import { HostShellApi } from '@services/host-shell-api';
import { SessionStore, SessionUser } from '@core/auth';
import { NotificationService } from '@core/notification.service';
import { HostBookings } from './bookings/bookings';
import { Invoices } from './invoices/invoices';
import { HOST_ROUTES, bookingsGate, knownHostelGate, monthlyOnlyGate } from './host.routes';
import { SUBSCRIPTION_ROUTES } from './subscription/subscription.routes';

function listing(over: Partial<HostListing> = {}): HostListing {
  return {
    id: 'nightly-1',
    name: 'Ever Care Hostel',
    area: 'Lahore City',
    city: 'Tibba Bur Singh',
    accommodationType: 'backpacker',
    billingFrequency: 'night',
    currency: 'PKR',
    propertyType: 'house',
    roomTypes: [],
    offers: [],
    review: { score: null, count: 0 },
    status: 'published',
    image: '',
    ...over,
  } as HostListing;
}

class ShellApiStub {
  data: HostListingsData = { listings: [], draft: null, stats: {} as never };
  listings(): Observable<HostListingsData> {
    return of(this.data);
  }
}

/** Only `parent.paramMap.get('hostelId')` is read — `bookings` is a child of `:hostelId`. */
function snapshotFor(hostelId: string): ActivatedRouteSnapshot {
  return {
    parent: { paramMap: new Map([['hostelId', hostelId]]) },
  } as unknown as ActivatedRouteSnapshot;
}

/** The guard answers synchronously once the store has loaded; unwrap either shape. */
async function run(hostelId: string): Promise<boolean | UrlTree> {
  const result = TestBed.runInInjectionContext(() =>
    bookingsGate(snapshotFor(hostelId), {} as RouterStateSnapshot),
  );
  return isObservable(result) ? await new Promise((r) => result.subscribe(r)) : (result as boolean | UrlTree);
}

function setUp(listings: HostListing[]): void {
  localStorage.clear();
  TestBed.resetTestingModule();
  const api = new ShellApiStub();
  api.data = { listings, draft: null, stats: {} as never };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: HostShellApi, useValue: api }],
  });
  TestBed.inject(HostPropertyStore).load();
}

/**
 * Who may open the bookings list.
 *
 * A month-billed hostel lets beds to tenants and never sells a night, so the page has nothing
 * to list and its create form has nothing it could legally write. The sidebar and the phone's
 * More list leave the entry out, which handles everyone who navigates by clicking — this is
 * for the typed URL, the bookmark, and the link pasted from a hostel billed the other way.
 */
describe('bookingsGate', () => {
  afterEach(() => localStorage.clear());

  it('lets a nightly hostel through', async () => {
    setUp([listing({ id: 'nightly-1', billingFrequency: 'night' })]);
    expect(await run('nightly-1')).toBe(true);
  });

  it('sends a monthly hostel to its overview', async () => {
    setUp([listing({ id: 'monthly-1', billingFrequency: 'month' })]);
    const result = await run('monthly-1');
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/host/monthly-1/overview');
  });

  /**
   * The trap this guard is written around.
   *
   * It runs before the shell copies the URL's hostel into the store, so the *selected* hostel
   * is still the one the host was looking at a moment ago. Judging by the selection would let
   * a link to a monthly hostel through whenever the previous one was nightly — and block a
   * nightly one whenever the previous was monthly.
   */
  it('judges the hostel in the URL, not the one still selected', async () => {
    setUp([
      listing({ id: 'nightly-1', billingFrequency: 'night' }),
      listing({ id: 'monthly-1', billingFrequency: 'month' }),
    ]);
    const store = TestBed.inject(HostPropertyStore);

    store.setProperty('nightly-1');
    expect(await run('monthly-1')).toBeInstanceOf(UrlTree);

    store.setProperty('monthly-1');
    expect(await run('nightly-1')).toBe(true);
  });

  // Hiding the page because a field did not arrive is the worse of the two failures: an
  // empty list costs a host nothing, and a missing Bookings page costs a nightly hostel
  // its daily work.
  it('lets an unstated billing cycle through', async () => {
    setUp([
      listing({ id: 'blank-1', billingFrequency: '' }),
      listing({ id: 'odd-1', billingFrequency: 'fortnight' }),
    ]);
    expect(await run('blank-1')).toBe(true);
    expect(await run('odd-1')).toBe(true);
  });

  it('lets an unknown hostel through rather than guessing', async () => {
    setUp([listing({ id: 'monthly-1', billingFrequency: 'month' })]);
    expect(await run('not-in-the-list')).toBe(true);
  });
});

/** `knownHostelGate` sits on `:hostelId` itself, so the param is on the route, not its parent. */
function ownSnapshotFor(hostelId: string): ActivatedRouteSnapshot {
  return { paramMap: new Map([['hostelId', hostelId]]) } as unknown as ActivatedRouteSnapshot;
}

async function runKnown(hostelId: string): Promise<boolean | UrlTree> {
  const result = TestBed.runInInjectionContext(() =>
    knownHostelGate(ownSnapshotFor(hostelId), {} as RouterStateSnapshot),
  );
  return isObservable(result) ? await new Promise((r) => result.subscribe(r)) : (result as boolean | UrlTree);
}

/**
 * Which hostels `/host/:hostelId` will open.
 *
 * The shell copies this segment into the property store, which persists it. So letting an
 * unknown one through does not fail once — it replaces the host's saved hostel and keeps
 * failing on every later visit, across reloads. `/host/hostels` is the easy way in, and what
 * it leaves behind is requests like `/api/hostels/hostels/edit` from every screen that reads
 * the stored id.
 */
describe('knownHostelGate', () => {
  afterEach(() => localStorage.clear());

  it('opens a hostel the host has', async () => {
    setUp([listing({ id: 'nHelLt' })]);
    expect(await runKnown('nHelLt')).toBe(true);
  });

  it('sends an unknown hostel to /host instead of opening it', async () => {
    setUp([listing({ id: 'nHelLt' })]);
    const result = await runKnown('hostels');
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/host');
  });

  // Refusing every hostel because the list did not arrive would turn one failed request into
  // a host locked out of their own console. `loaded` is set on the error path too, so an empty
  // list is not evidence the hostel is fake — the page's own error state says so better.
  it('lets a hostel through when the list is empty or failed to load', async () => {
    setUp([]);
    expect(await runKnown('nHelLt')).toBe(true);
  });

  // The bad id outlives the bad URL: this is what stops the shell re-adopting it after the
  // store has already healed the saved selection.
  it('refuses the unknown hostel even when one is already selected', async () => {
    setUp([listing({ id: 'nHelLt' })]);
    TestBed.inject(HostPropertyStore).setProperty('nHelLt');
    expect(await runKnown('hostels')).toBeInstanceOf(UrlTree);
  });
});

/** The guard answers synchronously once the store has loaded; unwrap either shape. */
async function runMonthlyOnly(hostelId: string): Promise<boolean | UrlTree> {
  const result = TestBed.runInInjectionContext(() =>
    monthlyOnlyGate(snapshotFor(hostelId), {} as RouterStateSnapshot),
  );
  return isObservable(result) ? await new Promise((r) => result.subscribe(r)) : (result as boolean | UrlTree);
}

/**
 * Who may open Utilities and Mess.
 *
 * The mirror of `bookingsGate`. Those pages belong to a hostel that houses people by the
 * month: a nightly hostel has guests for two days, so there are no meters to split between
 * them and no weekly menu to plan.
 *
 * The important asymmetry is what each guard does with silence. Both are strict on the value
 * they name, so a hostel whose billing cycle never arrived is neither monthly nor nightly and
 * keeps **both** halves of the console. Written as `!isMonthlyBilled()` this guard would have
 * hidden Utilities from every hostel with a missing field — which is the failure
 * `isMonthlyBilled` documents itself as avoiding, pointed the other way.
 */
/**
 * Which sections the gate is actually wired to.
 *
 * The tests below prove the gate decides correctly; this proves it is asked. A guard is easy
 * to reason about and easy to forget — the whole failure is a route that quietly never calls
 * it, and nothing else in the suite would notice.
 */
describe('the sections behind monthlyOnlyGate', () => {
  const hostel = HOST_ROUTES.find((r) => r.path === ':hostelId');
  const guardsOn = (path: string) =>
    (hostel?.children ?? []).find((c) => c.path === path)?.canActivate ?? [];

  it('gates the pages a nightly hostel has no use for', () => {
    for (const path of ['tenants', 'utilities', 'mess']) {
      expect({ path, gated: guardsOn(path).includes(monthlyOnlyGate) }).toEqual({
        path,
        gated: true,
      });
    }
  });

  it('leaves Bookings to its own gate, which points the other way', () => {
    // Bookings is the counterpart, not another monthly-only page: it belongs to the nightly
    // hostel. Wiring `monthlyOnlyGate` here would turn away the one hostel that needs it.
    expect(guardsOn('bookings')).toContain(bookingsGate);
    expect(guardsOn('bookings')).not.toContain(monthlyOnlyGate);
  });

  it('leaves the sections both kinds of hostel use alone', () => {
    for (const path of ['rooms', 'expenses', 'invoices', 'team']) {
      expect({ path, gated: guardsOn(path).includes(monthlyOnlyGate) }).toEqual({
        path,
        gated: false,
      });
    }
  });
});

describe('monthlyOnlyGate', () => {
  afterEach(() => localStorage.clear());

  it('lets a monthly hostel through', async () => {
    setUp([listing({ id: 'monthly-1', billingFrequency: 'month' })]);
    expect(await runMonthlyOnly('monthly-1')).toBe(true);
  });

  it('sends a nightly hostel to its overview', async () => {
    setUp([listing({ id: 'nightly-1', billingFrequency: 'night' })]);
    const result = await runMonthlyOnly('nightly-1');
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/host/nightly-1/overview');
  });

  it('judges the hostel in the URL, not the one still selected', async () => {
    setUp([
      listing({ id: 'nightly-1', billingFrequency: 'night' }),
      listing({ id: 'monthly-1', billingFrequency: 'month' }),
    ]);
    const store = TestBed.inject(HostPropertyStore);

    store.setProperty('monthly-1');
    expect(await runMonthlyOnly('nightly-1')).toBeInstanceOf(UrlTree);

    store.setProperty('nightly-1');
    expect(await runMonthlyOnly('monthly-1')).toBe(true);
  });

  // The half that `!isMonthlyBilled()` would have got wrong.
  it('lets an unstated billing cycle through', async () => {
    setUp([
      listing({ id: 'blank-1', billingFrequency: '' }),
      listing({ id: 'odd-1', billingFrequency: 'fortnight' }),
    ]);
    expect(await runMonthlyOnly('blank-1')).toBe(true);
    expect(await runMonthlyOnly('odd-1')).toBe(true);
  });

  it('lets an unknown hostel through rather than guessing', async () => {
    setUp([listing({ id: 'nightly-1', billingFrequency: 'night' })]);
    expect(await runMonthlyOnly('not-in-the-list')).toBe(true);
  });

  // Neither guard may turn the same hostel away: a host would have nowhere left to work.
  it('never blocks the same hostel as bookingsGate', async () => {
    setUp([
      listing({ id: 'monthly-1', billingFrequency: 'month' }),
      listing({ id: 'nightly-1', billingFrequency: 'night' }),
      listing({ id: 'blank-1', billingFrequency: '' }),
    ]);
    for (const id of ['monthly-1', 'nightly-1', 'blank-1']) {
      const blockedByBoth =
        (await run(id)) instanceof UrlTree && (await runMonthlyOnly(id)) instanceof UrlTree;
      expect({ id, blockedByBoth }).toEqual({ id, blockedByBoth: false });
    }
  });
});

describe('the billing page under :hostelId', () => {
  const hostel = HOST_ROUTES.find((r) => r.path === ':hostelId');
  const billing = (hostel?.children ?? []).find((c) => c.path === 'subscription');

  it('serves the billing routes as its children', () => {
    expect(billing?.children).toBe(SUBSCRIPTION_ROUTES);
    expect(billing?.loadChildren).toBeUndefined();
  });

  // The paywall links every host here; the hostel gate on the parent is the only check.
  it('adds no guard of its own', () => {
    expect(billing?.canActivate).toBeUndefined();
    expect(billing?.canMatch).toBeUndefined();
    expect(hostel?.canActivate).toEqual([knownHostelGate]);
  });
});

describe('the gate on hostels/new', () => {
  const route = HOST_ROUTES.find((r) => r.path === 'hostels/new');

  function runGate(permitted: boolean) {
    const load = vi.fn();
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionStore,
          useValue: { hasPermission: (flag: string) => permitted && flag === 'core:Hostel:create' },
        },
        // Only `load` exists, so a gate that consults the list throws instead of passing quietly.
        { provide: HostPropertyStore, useValue: { load } },
      ],
    });
    const gate = route?.canActivate?.[0] as CanActivateFn;
    const result = TestBed.runInInjectionContext(() =>
      gate({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    return { result, load, http: TestBed.inject(HttpTestingController) };
  }

  it('is the only guard on the route', () => {
    expect(route?.canActivate).toHaveLength(1);
  });

  it('opens synchronously for an account that may create a hostel, without loading anything', () => {
    const { result, load, http } = runGate(true);

    expect(result).toBe(true);
    expect(load).not.toHaveBeenCalled();
    http.verify();
  });

  it('sends an account that may not create a hostel to /host', () => {
    const { result, load, http } = runGate(false);

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/host');
    expect(load).not.toHaveBeenCalled();
    http.verify();
  });
});

const hostRootRedirect = HOST_ROUTES.find((r) => r.path === '')?.canActivate?.[0] as CanActivateFn;

function sessionUser(id: string, permissions: string[] = []): SessionUser {
  return {
    id,
    name: `User ${id}`,
    email: `${id.toLowerCase()}@example.test`,
    role: 'host',
    allRoles: ['host'],
    permissions,
  };
}

/**
 * Answers with the hostels of whoever is signed in when the request is subscribed, and logs who
 * asked. In manual mode each request stays pending until {@link respond} answers it.
 */
class PerUserListingsStub {
  readonly calls: (string | null)[] = [];
  manual = false;
  private readonly pending: { user: string | null; response: Subject<HostListingsData> }[] = [];

  constructor(private readonly byUser: Record<string, HostListing[]>) {}

  listings(): Observable<HostListingsData> {
    return defer(() => {
      const user = TestBed.inject(SessionStore).user()?.id ?? null;
      this.calls.push(user);
      if (!this.manual) return of(this.dataFor(user));
      const response = new Subject<HostListingsData>();
      this.pending.push({ user, response });
      return response;
    });
  }

  /** Answers the latest pending request made for `user`; does nothing when there is none. */
  respond(user: string): void {
    const index = this.pending.map((p) => p.user).lastIndexOf(user);
    if (index < 0) return;
    const [{ response }] = this.pending.splice(index, 1);
    response.next(this.dataFor(user));
    response.complete();
  }

  private dataFor(user: string | null): HostListingsData {
    return { listings: (user && this.byUser[user]) || [], draft: null, stats: {} as never };
  }
}

interface GuardRun {
  async: boolean;
  resolved: boolean;
  value?: boolean | UrlTree;
}

/** Starts a guard and records its answer whenever it arrives, so a guard that never answers cannot hang the test. */
function startGuard(guard: CanActivateFn, route: ActivatedRouteSnapshot): GuardRun {
  const result = TestBed.runInInjectionContext(() => guard(route, {} as RouterStateSnapshot));
  if (!isObservable(result)) return { async: false, resolved: true, value: result as boolean | UrlTree };
  const run: GuardRun = { async: true, resolved: false };
  result.subscribe((value) => {
    run.resolved = true;
    run.value = value as boolean | UrlTree;
  });
  return run;
}

/** Flushes the effects a waiting guard listens through, then hands the run back to read. */
function settle(run: GuardRun): GuardRun {
  TestBed.tick();
  TestBed.tick();
  return run;
}

function answerOf(run: GuardRun): boolean | string | undefined {
  return run.value instanceof UrlTree ? TestBed.inject(Router).serializeUrl(run.value) : run.value;
}

/**
 * The guards when one account replaces another without signing out in between.
 *
 * Accepting an invitation while someone else is signed in sets the new session in place, so
 * nothing ever passes through "signed out". A guard that trusts the list already loaded would
 * then route the new account into the previous one's hostel, or judge a page by its billing.
 */
describe('the host guards after the account changes without a sign-out', () => {
  const aHostels = [
    listing({ id: 'a-1', billingFrequency: 'night' }),
    listing({ id: 'a-2', billingFrequency: 'night' }),
  ];

  function signInFirstAccount(bHostels: HostListing[], options: { manual?: boolean } = {}) {
    localStorage.clear();
    TestBed.resetTestingModule();
    const api = new PerUserListingsStub({ A: aHostels, B: bHostels });
    api.manual = options.manual ?? false;
    const notifications = { info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: HostShellApi, useValue: api },
        { provide: NotificationService, useValue: notifications },
      ],
    });
    const session = TestBed.inject(SessionStore);
    session.setSession(sessionUser('A'), 'token-a');
    return { api, session, notifications };
  }

  /** A has loaded both hostels and is working in the second one. */
  function firstAccountWorkingInSecondHostel(bHostels: HostListing[]) {
    const context = signInFirstAccount(bHostels);
    const store = TestBed.inject(HostPropertyStore);
    store.load();
    TestBed.tick();
    store.setProperty('a-2');
    expect(store.properties().map((p) => p.id)).toEqual(['a-1', 'a-2']);
    return { ...context, store };
  }

  afterEach(() => {
    TestBed.inject(SessionStore).clear();
    localStorage.clear();
  });

  it("sends the new account at /host to its own hostel after fetching its list, not to the previous account's", () => {
    const { api, session } = firstAccountWorkingInSecondHostel([listing({ id: 'b-1' })]);

    session.setSession(sessionUser('B'), 'token-b');
    const run = settle(startGuard(hostRootRedirect, {} as ActivatedRouteSnapshot));

    expect(run.async).toBe(true);
    expect(run.resolved).toBe(true);
    expect(answerOf(run)).toBe('/host/b-1');
    expect(api.calls).toEqual(['A', 'B']);
  });

  it("refuses the previous account's hostel to the new account", () => {
    const { session } = firstAccountWorkingInSecondHostel([listing({ id: 'b-1' })]);

    session.setSession(sessionUser('B'), 'token-b');
    const run = settle(startGuard(knownHostelGate, ownSnapshotFor('a-2')));

    expect(run.resolved).toBe(true);
    expect(answerOf(run)).toBe('/host');
  });

  it("opens the new account's own hostel", () => {
    const { session } = firstAccountWorkingInSecondHostel([listing({ id: 'b-1' })]);

    session.setSession(sessionUser('B'), 'token-b');
    const run = settle(startGuard(knownHostelGate, ownSnapshotFor('b-1')));

    expect(run.resolved).toBe(true);
    expect(run.value).toBe(true);
  });

  it("judges Bookings by the new account's hostel, sending a monthly one to its overview", () => {
    const { session } = firstAccountWorkingInSecondHostel([
      listing({ id: 'b-1', billingFrequency: 'month' }),
    ]);

    session.setSession(sessionUser('B'), 'token-b');
    const run = settle(startGuard(bookingsGate, snapshotFor('b-1')));

    expect(run.resolved).toBe(true);
    expect(answerOf(run)).toBe('/host/b-1/overview');
  });

  it("judges the monthly-only pages by the new account's hostel, sending a nightly one to its overview", () => {
    const { session } = firstAccountWorkingInSecondHostel([
      listing({ id: 'b-1', billingFrequency: 'night' }),
    ]);

    session.setSession(sessionUser('B'), 'token-b');
    const run = settle(startGuard(monthlyOnlyGate, snapshotFor('b-1')));

    expect(run.resolved).toBe(true);
    expect(answerOf(run)).toBe('/host/b-1/overview');
  });

  it('tells a new account with no hostel and no right to create one that none is assigned', () => {
    const { session, notifications } = firstAccountWorkingInSecondHostel([]);

    // A non-empty list is what makes the permission check real: an empty one is not gated.
    session.setSession(sessionUser('B', ['host:Room:index']), 'token-b');
    const run = settle(startGuard(hostRootRedirect, {} as ActivatedRouteSnapshot));

    expect(run.resolved).toBe(true);
    expect(answerOf(run)).toBe('/');
    expect(notifications.info).toHaveBeenCalledWith('No hostel assigned', expect.any(String));
  });

  it("answers a guard that was waiting on the previous account's request once the new account's list arrives", () => {
    const { api, session } = signInFirstAccount([listing({ id: 'b-1' })], { manual: true });

    const run = settle(startGuard(knownHostelGate, ownSnapshotFor('b-1')));
    expect(run.resolved).toBe(false);

    session.setSession(sessionUser('B'), 'token-b');
    TestBed.tick();
    api.respond('B');
    settle(run);

    expect(run.resolved).toBe(true);
    expect(run.value).toBe(true);
  });

  it('keeps the same account on its selected hostel without fetching again when its session is re-set', () => {
    const { api, session } = firstAccountWorkingInSecondHostel([listing({ id: 'b-1' })]);

    session.setSession(sessionUser('A'), 'token-a-refreshed');
    TestBed.tick();
    const run = startGuard(hostRootRedirect, {} as ActivatedRouteSnapshot);

    expect(run.async).toBe(false);
    expect(answerOf(run)).toBe('/host/a-2');
    expect(api.calls).toEqual(['A']);
  });
});

/** Flattens the route tree into `full/path -> Route`, an index route is keyed with a trailing slash so it cannot overwrite its parent. */
function flatten(routes: Route[], prefix = ''): Map<string, Route> {
  const out = new Map<string, Route>();
  for (const r of routes) {
    const path = r.path ? [prefix, r.path].filter(Boolean).join('/') : `${prefix}/`;
    out.set(path, r);
    for (const [p, child] of flatten(r.children ?? [], path)) out.set(p, child);
  }
  return out;
}

const ROUTE_TABLE = flatten(HOST_ROUTES);
const routeAt = (path: string): Route | undefined => ROUTE_TABLE.get(path);

/**
 * The booking detail is its own URL so the back button closes it.
 *
 * It is a sibling of `bookings`, not a child: `bookingsGate` and the page read `hostelId` from
 * `route.parent`, which a child route would push down a level.
 */
describe('the bookings/:bookingId route', () => {
  afterEach(() => localStorage.clear());

  it('sits beside bookings under :hostelId, hosting HostBookings behind the same gate', () => {
    const hostel = routeAt(':hostelId');
    const detail = hostel?.children?.find((c) => c.path === 'bookings/:bookingId');
    const list = hostel?.children?.find((c) => c.path === 'bookings');

    expect(detail).toBeDefined();
    expect(detail?.component).toBe(HostBookings);
    expect(detail?.component).toBe(list?.component);
    expect(detail?.canActivate).toEqual([bookingsGate]);
    expect(detail?.data?.['drawerHost']).toBe(true);
    expect(list?.children).toBeUndefined();
  });

  it('sends a monthly hostel to its overview', async () => {
    setUp([listing({ id: 'monthly-1', billingFrequency: 'month' })]);
    const gate = routeAt(':hostelId/bookings/:bookingId')?.canActivate?.[0] as CanActivateFn;

    const result = TestBed.runInInjectionContext(() =>
      gate(snapshotFor('monthly-1'), {} as RouterStateSnapshot),
    );
    const settled = isObservable(result)
      ? await new Promise((r) => (result as Observable<unknown>).subscribe(r))
      : result;

    expect(settled).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(settled as UrlTree)).toBe('/host/monthly-1/overview');
  });

  it('lets a nightly hostel through', async () => {
    setUp([listing({ id: 'nightly-1', billingFrequency: 'night' })]);
    const gate = routeAt(':hostelId/bookings/:bookingId')?.canActivate?.[0] as CanActivateFn;

    const result = TestBed.runInInjectionContext(() =>
      gate(snapshotFor('nightly-1'), {} as RouterStateSnapshot),
    );
    const settled = isObservable(result)
      ? await new Promise((r) => (result as Observable<unknown>).subscribe(r))
      : result;

    expect(settled).toBe(true);
  });
});

/** Runs the permission guard on a route against a session stub; returns what was asked. */
function askPermissionGuard(route: Route | undefined, granted: boolean) {
  const asked: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: SessionStore,
        useValue: {
          isAuthenticated: () => true,
          hasPermission: (flag: string) => {
            asked.push(flag);
            return granted;
          },
        },
      },
    ],
  });
  const guard = route?.canActivate?.[0] as CanActivateFn;
  const result = TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url: '/x' } as RouterStateSnapshot));
  return { asked, result };
}

describe('the invoices/view/:billId route', () => {
  it('is a child of invoices hosting Invoices as a drawer', () => {
    const invoices = routeAt(':hostelId/invoices');
    const view = invoices?.children?.find((c) => c.path === 'view/:billId');

    expect(view).toBeDefined();
    expect(view?.component).toBe(Invoices);
    expect(view?.data?.['drawerHost']).toBe(true);
    expect(routeAt(':hostelId/invoices/view/:billId')).toBe(view);
  });

  it('inherits the invoices permission guard rather than declaring its own', () => {
    const invoices = routeAt(':hostelId/invoices');
    const view = routeAt(':hostelId/invoices/view/:billId');

    expect(view?.canActivate).toBeUndefined();
    expect(invoices?.canActivate).toHaveLength(1);
  });

  it('guards invoices behind host:RenterBill:index', () => {
    const denied = askPermissionGuard(routeAt(':hostelId/invoices'), false);
    expect(denied.asked).toEqual(['host:RenterBill:index']);
    expect(denied.result).toBeInstanceOf(UrlTree);

    const allowed = askPermissionGuard(routeAt(':hostelId/invoices'), true);
    expect(allowed.result).toBe(true);
  });
});

/**
 * Which routes opt in to being reused across their own drawers.
 *
 * `AppRouteReuseStrategy` reads this flag, so a route that lacks it reloads its whole page each
 * time a drawer opens, and a route that wrongly has it never re-initialises. The detail pages
 * (`rooms/:roomId`, `tenants/profile/:id`) are separate screens and must stay unflagged.
 */
describe('drawerHost route data', () => {
  const expected = [
    ':hostelId/bookings',
    ':hostelId/bookings/:bookingId',
    ':hostelId/rooms/',
    ':hostelId/rooms/create',
    ':hostelId/rooms/bulk',
    ':hostelId/rooms/edit/:roomId',
    ':hostelId/tenants/',
    ':hostelId/tenants/create',
    ':hostelId/tenants/edit/:tenantId',
    ':hostelId/invoices/',
    ':hostelId/invoices/create',
    ':hostelId/invoices/edit/:billId',
    ':hostelId/invoices/view/:billId',
  ];

  it('is set on exactly the drawer routes', () => {
    const flagged = [...ROUTE_TABLE.entries()]
      .filter(([, r]) => r.data?.['drawerHost'])
      .map(([path]) => path);

    expect(flagged.sort()).toEqual([...expected].sort());
  });

  it('is absent on the detail pages that are separate screens', () => {
    for (const path of [
      ':hostelId/rooms/:roomId',
      ':hostelId/tenants/profile/:tenantId',
      ':hostelId/profile',
      ':hostelId/team/',
      ':hostelId/team/edit/:staffId',
      ':hostelId/utilities/',
      ':hostelId/expenses/new',
    ]) {
      expect({ path, flagged: routeAt(path)?.data?.['drawerHost'] ?? false }).toEqual({
        path,
        flagged: false,
      });
    }
  });

  it('shares one component across the rooms drawer routes but not the detail page', () => {
    const rooms = ['/', '/create', '/bulk', '/edit/:roomId'].map((s) => routeAt(`:hostelId/rooms${s}`)?.component);
    expect(new Set(rooms).size).toBe(1);
    expect(routeAt(':hostelId/rooms/:roomId')?.component).not.toBe(rooms[0]);
  });
});
