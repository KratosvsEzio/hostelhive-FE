import { Injector } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, defer, of } from 'rxjs';
import { Permission } from '@core/auth/roles';
import { SessionStore, SessionUser } from '@core/auth/session-store';
import { HostListing, HostListingsData } from '@hostelhive/data-access';
import { HostPropertyStore } from './host-property-store';
import { HostShellApi } from './host-shell-api';

function listing(over: Partial<HostListing> = {}): HostListing {
  return {
    id: 'nHelLt',
    name: 'Ever Care Hostel',
    area: 'Lahore City',
    city: 'Tibba Bur Singh',
    accommodationType: 'backpacker',
    billingFrequency: 'month',
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
  data: HostListingsData = { listings: [listing()], draft: null, stats: {} as never };
  listings(): Observable<HostListingsData> {
    return of(this.data);
  }
}

function setUp(api = new ShellApiStub()): { store: HostPropertyStore; api: ShellApiStub } {
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: HostShellApi, useValue: api }] });
  return { store: TestBed.inject(HostPropertyStore), api };
}

/**
 * The hostel record the whole host console reads from.
 *
 * The store used to keep six fields per hostel and discard the rest, so every screen that
 * wanted the currency, the room types or the billing cycle fetched a hostel the app had
 * already loaded. These pin the two properties that makes safe: the full record survives the
 * load, and it does not survive a sign-out.
 */
describe('HostPropertyStore.activeHostel', () => {
  afterEach(() => localStorage.clear());

  it('keeps the whole record, not just the picker fields', () => {
    const { store } = setUp();
    store.load();

    expect(store.activeHostel()?.billingFrequency).toBe('month');
    expect(store.activeHostel()?.currency).toBe('PKR');
    expect(store.activeHostel()?.propertyType).toBe('house');
  });

  it('follows the selection', () => {
    const api = new ShellApiStub();
    api.data = {
      ...api.data,
      listings: [
        listing(),
        listing({ id: 'DZNqAc', currency: 'USD', billingFrequency: 'night' }),
      ],
    };
    const { store } = setUp(api);
    store.load();

    store.selected.set('DZNqAc');
    expect(store.activeHostel()?.currency).toBe('USD');
    expect(store.activeHostel()?.billingFrequency).toBe('night');
  });

  // Same guarantee the class already makes about `properties`: a signed-out store must not
  // still be holding the previous host's hostel.
  it('drops the record on sign-out', () => {
    const { store } = setUp();
    store.load();
    expect(store.activeHostel()).toBeDefined();

    store.clear();
    expect(store.activeHostel()).toBeUndefined();
    expect(store.hostels()).toEqual([]);
  });

  it('is undefined before anything has loaded', () => {
    const { store } = setUp();
    expect(store.activeHostel()).toBeUndefined();
  });
});

/**
 * Which half of the console a hostel gets.
 *
 * A month-billed hostel lets beds to tenants; a nightly one sells stays. Bookings, the room
 * calendar and the availability check all belong to the second, and three screens were each
 * working that out from `activeHostel()` themselves before this existed.
 */
describe('HostPropertyStore.isMonthlyBilled', () => {
  afterEach(() => localStorage.clear());

  function withListings(...listings: HostListing[]): HostPropertyStore {
    const api = new ShellApiStub();
    api.data = { listings, draft: null, stats: {} as never };
    const { store } = setUp(api);
    store.load();
    return store;
  }

  it('answers for the active hostel by default', () => {
    expect(withListings(listing({ billingFrequency: 'month' })).isMonthlyBilled()).toBe(true);
    expect(withListings(listing({ billingFrequency: 'night' })).isMonthlyBilled()).toBe(false);
  });

  // What a route guard needs: it runs before the shell syncs the URL's hostel into the
  // selection, so the active one is still the previous page's.
  it('answers for a named hostel, whatever is selected', () => {
    const store = withListings(
      listing({ id: 'a', billingFrequency: 'night' }),
      listing({ id: 'b', billingFrequency: 'month' }),
    );
    store.setProperty('a');

    expect(store.isMonthlyBilled('b')).toBe(true);
    expect(store.isMonthlyBilled('a')).toBe(false);
    expect(store.isMonthlyBilled()).toBe(false);
  });

  // `billingFrequency` is empty when the payload did not say. Nightly is the answer that
  // shows a page that may not apply rather than hiding one that does.
  it('treats an unstated or unknown cycle as nightly', () => {
    expect(withListings(listing({ billingFrequency: '' })).isMonthlyBilled()).toBe(false);
    expect(withListings(listing({ billingFrequency: 'monthly' })).isMonthlyBilled()).toBe(false);
    expect(withListings(listing({ billingFrequency: 'fortnight' })).isMonthlyBilled()).toBe(false);
  });

  it('answers false for a hostel it has never heard of', () => {
    expect(withListings(listing({ id: 'a', billingFrequency: 'month' })).isMonthlyBilled('zz')).toBe(false);
  });
});

/* ---- per-user harness: a real SessionStore and a listings endpoint that answers per user ---- */

/** The key SessionStore caches the signed-in user under; it names user ids, never hostels. */
const SESSION_USER_KEY = 'hh.auth.user';
const STORAGE_KEY = 'hh:host-property';
const LEGACY_STORAGE_KEY = 'hh_property';

function user(id: string, permissions: Permission[] = []): SessionUser {
  return {
    id,
    name: `User ${id}`,
    email: `${id}@h.pk`,
    role: 'host',
    allRoles: ['host'],
    permissions,
  };
}

/**
 * `GET /api/host/hostels` answered for whoever is signed in when the request is made, with a log
 * of the user id each request went out as. In manual mode every request stays pending until the
 * test answers it with `respond` or `fail`.
 */
class PerUserListingsStub {
  byUser: Record<string, HostListing[]> = {
    A: [
      listing({ id: 'a-1', billingFrequency: 'night' }),
      listing({ id: 'a-2', billingFrequency: 'month' }),
    ],
    B: [listing({ id: 'b-1', billingFrequency: 'night' })],
  };
  /** Listings served to a request made with nobody signed in. */
  signedOut: HostListing[] = [];
  readonly calls: (string | null)[] = [];
  private readonly pending: Subject<HostListingsData>[] = [];

  constructor(
    private readonly who: () => string | null,
    private readonly manual = false,
  ) {}

  listings(): Observable<HostListingsData> {
    return defer(() => {
      this.calls.push(this.who());
      if (!this.manual) return of(this.dataFor(this.calls.length - 1));
      const response = new Subject<HostListingsData>();
      this.pending.push(response);
      return response;
    });
  }

  /** Answers the `index`-th request with the listings of the user it was made for. */
  respond(index: number): void {
    const response = this.pending[index];
    response.next(this.dataFor(index));
    response.complete();
  }

  fail(index: number): void {
    this.pending[index].error(new Error('listings failed'));
  }

  private dataFor(index: number): HostListingsData {
    const id = this.calls[index];
    const listings = id === null ? this.signedOut : (this.byUser[id] ?? []);
    return { listings, draft: null, stats: {} as never };
  }
}

let session: SessionStore;
let store: HostPropertyStore;
let api: PerUserListingsStub;

interface BuildOptions {
  /** User seated before the store is created. */
  signedIn?: string;
  /** A token without a user: a session still being restored. */
  tokenOnly?: boolean;
  /** Every listings request stays pending until answered. */
  manual?: boolean;
}

/** A fresh injector over whatever is already in localStorage: a page reload. */
function rebuild(opts: BuildOptions = {}): void {
  TestBed.resetTestingModule();
  api = new PerUserListingsStub(() => TestBed.inject(SessionStore).user()?.id ?? null, opts.manual);
  TestBed.configureTestingModule({ providers: [{ provide: HostShellApi, useValue: api }] });
  session = TestBed.inject(SessionStore);
  if (opts.signedIn) session.setSession(user(opts.signedIn), `tok-${opts.signedIn}`);
  else if (opts.tokenOnly) session.setAccessToken('tok');
  store = TestBed.inject(HostPropertyStore);
}

/** A clean start: empty localStorage plus `seed`, then {@link rebuild}. */
function setUpAs(opts: BuildOptions & { seed?: Record<string, string> } = {}): void {
  localStorage.clear();
  for (const [key, value] of Object.entries(opts.seed ?? {})) localStorage.setItem(key, value);
  rebuild(opts);
}

/** A signed in with both hostels loaded and `a-2` picked, effects settled. */
function hostAWithSecondHostelSelected(): void {
  setUpAs({ signedIn: 'A' });
  store.load();
  store.setProperty('a-2');
  TestBed.tick();
}

/** Whether any localStorage value other than the cached session user mentions `text`. */
function storedNames(text: string): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === null || key === SESSION_USER_KEY) continue;
    if (localStorage.getItem(key)?.includes(text)) return true;
  }
  return false;
}

function ids(): string[] {
  return store.properties().map((p) => p.id);
}

/**
 * The store follows the signed-in user, not the fact that someone is signed in.
 *
 * Accepting an invitation while another account is signed in replaces the session in place, so
 * the store never sees "signed out" between the two users. Everything it holds has to read as
 * the new user's the instant the user changes, and a selection saved by one user must never be
 * handed to another.
 */
describe('HostPropertyStore across users', () => {
  afterEach(() => {
    session.clear();
    localStorage.clear();
  });

  describe('when another user replaces the signed-in one', () => {
    it('reads as nothing loaded in the same tick as the switch', () => {
      hostAWithSecondHostelSelected();
      expect(store.activeHostel()?.id).toBe('a-2');

      session.setSession(user('B'), 'tok-B');

      expect(store.properties()).toEqual([]);
      expect(store.hostels()).toEqual([]);
      expect(store.loaded()).toBe(false);
      expect(store.activeHostel()).toBeUndefined();
      expect(store.isMonthlyBilled('a-2')).toBe(false);
    });

    it('drops the previous selection and its saved copy without requesting as the new user', () => {
      hostAWithSecondHostelSelected();

      session.setSession(user('B'), 'tok-B');
      TestBed.tick();

      expect(store.selected()).toBe('');
      expect(storedNames('a-2')).toBe(false);
      expect(api.calls).toEqual(['A']);
    });

    it('does not refetch a list that had finished loading for the previous user', () => {
      hostAWithSecondHostelSelected();

      session.setSession(user('B'), 'tok-B');
      TestBed.tick();
      TestBed.tick();

      expect(api.calls).toEqual(['A']);
    });

    it('keeps the list a load made for the new user in the same tick as the switch', () => {
      hostAWithSecondHostelSelected();

      session.setSession(user('B'), 'tok-B');
      store.load();
      expect(api.calls).toEqual(['A', 'B']);

      TestBed.tick();
      expect(ids()).toEqual(['b-1']);
      expect(store.loaded()).toBe(true);
      expect(store.selected()).toBe('b-1');
    });
  });

  describe("when the previous user's request is still pending", () => {
    it('ignores a response for the previous user that lands after the switch', () => {
      setUpAs({ signedIn: 'A', manual: true });
      store.load();
      TestBed.tick();

      session.setSession(user('B'), 'tok-B');
      api.respond(0);

      expect(store.properties()).toEqual([]);
      expect(store.loaded()).toBe(false);
    });

    it('ignores a failure for the previous user that lands after the switch', () => {
      setUpAs({ signedIn: 'A', manual: true });
      store.load();
      TestBed.tick();

      session.setSession(user('B'), 'tok-B');
      api.fail(0);

      expect(store.loaded()).toBe(false);
    });

    it('requests again as the new user so anyone waiting on the list is answered', () => {
      setUpAs({ signedIn: 'A', manual: true });
      const seen: boolean[] = [];
      toObservable(store.loaded, { injector: TestBed.inject(Injector) }).subscribe((v) =>
        seen.push(v),
      );
      store.load();
      TestBed.tick();

      session.setSession(user('B'), 'tok-B');
      TestBed.tick();
      expect(api.calls).toEqual(['A', 'B']);

      api.respond(1);
      TestBed.tick();
      expect(seen).toContain(true);
      expect(ids()).toEqual(['b-1']);
    });

    it('stays empty after a sign-out, ignoring the late response and not requesting again', () => {
      setUpAs({ signedIn: 'A', manual: true });
      store.load();
      TestBed.tick();

      session.clear();
      TestBed.tick();
      api.respond(0);

      expect(store.properties()).toEqual([]);
      expect(store.loaded()).toBe(false);
      expect(store.selected()).toBe('');
      expect(api.calls).toEqual(['A']);
    });
  });

  it('clears the list, the selection and its saved copy on sign-out', () => {
    hostAWithSecondHostelSelected();

    session.clear();
    TestBed.tick();

    expect(store.properties()).toEqual([]);
    expect(store.hostels()).toEqual([]);
    expect(store.loaded()).toBe(false);
    expect(store.selected()).toBe('');
    expect(storedNames('a-2')).toBe(false);
  });

  it('changes nothing when the same user is set again with a new token', () => {
    hostAWithSecondHostelSelected();

    session.setSession(user('A'), 'tok-A-refreshed');
    TestBed.tick();

    expect(ids()).toEqual(['a-1', 'a-2']);
    expect(store.loaded()).toBe(true);
    expect(store.selected()).toBe('a-2');
    expect(storedNames('a-2')).toBe(true);
    expect(api.calls).toEqual(['A']);
  });

  // A signed-out start must not wipe a list a guard has just loaded, nor a saved selection.
  it('keeps a list loaded before anyone signed in, and the saved selection, through the first effect run', () => {
    setUpAs({ seed: { [LEGACY_STORAGE_KEY]: 'a-2' } });
    api.signedOut = [listing({ id: 'a-2' })];

    store.load();
    TestBed.tick();

    expect(ids()).toEqual(['a-2']);
    expect(store.loaded()).toBe(true);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe('a-2');
  });

  it('does not save a selection made while signed out', () => {
    setUpAs();

    store.setProperty('a-1');

    expect(store.selected()).toBe('a-1');
    expect(storedNames('a-1')).toBe(false);
  });

  describe('after a reload', () => {
    it('gives the user their saved selection once a token-only restore resolves to them', () => {
      hostAWithSecondHostelSelected();

      rebuild({ tokenOnly: true });
      TestBed.tick();
      session.setSession(user('A'), 'tok-A');
      TestBed.tick();

      expect(store.selected()).toBe('a-2');
      expect(storedNames('a-2')).toBe(true);
    });

    it('gives the user their saved selection when they are already signed in at start', () => {
      hostAWithSecondHostelSelected();

      rebuild({ signedIn: 'A' });

      expect(store.selected()).toBe('a-2');
      TestBed.tick();
      expect(store.selected()).toBe('a-2');
    });

    it("does not hand one user's saved selection to another the restore resolves to", () => {
      hostAWithSecondHostelSelected();

      rebuild({ tokenOnly: true });
      TestBed.tick();
      session.setSession(user('B'), 'tok-B');
      TestBed.tick();

      expect(store.selected()).toBe('');
      expect(storedNames('a-2')).toBe(false);
    });
  });
});

/**
 * The saved selection on disk: `{ owner, id }` under its own key, and the bare id older builds
 * kept under the previous key, which the first signed-in reader adopts once.
 */
describe('HostPropertyStore saved selection', () => {
  afterEach(() => {
    session.clear();
    localStorage.clear();
  });

  function readStored(): unknown {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
  }

  it('adopts a bare id saved by an older build for the user signed in when it is read', () => {
    setUpAs({ signedIn: 'A', seed: { [LEGACY_STORAGE_KEY]: 'a-2' } });

    expect(store.selected()).toBe('a-2');
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(readStored()).toEqual({ owner: 'A', id: 'a-2' });
  });

  it('prefers the owned entry over a bare id from an older build, and removes the bare id', () => {
    setUpAs({
      signedIn: 'A',
      seed: {
        [STORAGE_KEY]: JSON.stringify({ owner: 'A', id: 'a-1' }),
        [LEGACY_STORAGE_KEY]: 'a-2',
      },
    });

    expect(store.selected()).toBe('a-1');
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(readStored()).toEqual({ owner: 'A', id: 'a-1' });
  });

  it('reads and removes nothing while nobody is signed in', () => {
    const owned = JSON.stringify({ owner: 'A', id: 'a-1' });
    setUpAs({ seed: { [STORAGE_KEY]: owned, [LEGACY_STORAGE_KEY]: 'a-2' } });
    TestBed.tick();

    expect(store.selected()).toBe('');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(owned);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe('a-2');
  });

  it.each([
    ['a bare id', 'a-2'],
    ['a JSON string', JSON.stringify('a-2')],
    ['an empty object', '{}'],
    ['an entry without an id', JSON.stringify({ owner: 'A' })],
  ])('ignores %s under the owned key and removes it', (_label, raw) => {
    setUpAs({ signedIn: 'A', seed: { [STORAGE_KEY]: raw } });

    expect(store.selected()).toBe('');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
