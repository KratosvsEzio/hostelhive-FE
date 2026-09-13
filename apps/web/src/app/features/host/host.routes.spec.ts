import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, isObservable, of } from 'rxjs';
import { HostListing, HostListingsData } from '@hostelhive/data-access';
import { HostPropertyStore } from '@services';
import { HostShellApi } from '@services/host-shell-api';
import { HOST_ROUTES, bookingsGate, knownHostelGate, monthlyOnlyGate } from './host.routes';

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
