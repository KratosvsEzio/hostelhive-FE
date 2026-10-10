import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { PLATFORM_ID, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiError, Listing } from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { SessionStore, SessionUser } from '@core/auth/session-store';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import {
  API_ERROR_NOTIFIER,
  SUPPRESS_ERROR_TOAST,
  UNAUTHORIZED_HANDLER,
} from '@core/tokens';
import { FavoritesStore } from './favorites-store';

const BASE = 'https://api.test';
const LIST = `${BASE}/api/favourites`;
const MARK = `${BASE}/api/favourites/mark_as_favourite`;
const UNMARK = `${BASE}/api/favourites/mark_as_unfavourite`;
const KEY = 'hh:favorites';

function user(id: string): SessionUser {
  return {
    id,
    name: `User ${id}`,
    email: `${id}@h.pk`,
    role: 'seeker',
    allRoles: ['seeker'],
    permissions: [],
  };
}

function listing(id: string): Listing {
  return {
    id,
    slug: id,
    name: `Hostel ${id}`,
    area: '',
    city: '',
    accommodationType: 'coliving',
    verified: false,
    sharing: [],
    amenities: [],
    priceFrom: 0,
    images: [],
    lat: 0,
    lng: 0,
  };
}

/** The raw cache value for `owner` holding the given hostels. */
function cached(owner: string, ...ids: string[]): string {
  return JSON.stringify({ owner, items: ids.map(listing) });
}

function readCache(): { owner: string; ids: string[] } | null {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as { owner: string; items: Listing[] };
  return { owner: parsed.owner, ids: parsed.items.map((l) => l.id) };
}

/**
 * Saved hostels of the signed-in user, driven end to end through the real session, the real
 * API client and the real error interceptor.
 *
 * The server is the source of truth: the list follows the session user (loaded on sign-in,
 * emptied on sign-out or a switch), hearts flip at once and roll back if the write fails,
 * and a load that lands while writes are in flight — or after they settle — never undoes a
 * click. localStorage is only a cache, and only ever for the user it names.
 */
describe('FavoritesStore', () => {
  let store: FavoritesStore;
  let session: SessionStore;
  let httpMock: HttpTestingController;
  const notify = vi.fn();

  function setUp(
    opts: { signedIn?: string; cache?: string; platform?: 'browser' | 'server' } = {},
  ): void {
    notify.mockReset();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: API_ERROR_NOTIFIER, useValue: notify },
        {
          provide: UNAUTHORIZED_HANDLER,
          useFactory: () => {
            const s = inject(SessionStore);
            return () => s.clear();
          },
        },
        { provide: PLATFORM_ID, useValue: opts.platform ?? 'browser' },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
    if (opts.cache !== undefined) localStorage.setItem(KEY, opts.cache);
    if (opts.signedIn) session.setSession(user(opts.signedIn), 'tok');
    store = TestBed.inject(FavoritesStore);
  }

  /** Signs `id` in, lets the store load, and answers the load with `server`. */
  function signedInWith(id: string, server: string[]): void {
    setUp({ signedIn: id });
    TestBed.tick();
    answerLoad(expectLoad(), server);
  }

  const expectLoad = (): TestRequest =>
    httpMock.expectOne((r) => r.method === 'GET' && r.url === LIST);
  const expectSave = (): TestRequest =>
    httpMock.expectOne((r) => r.method === 'POST' && r.url === MARK);
  const expectUnsave = (): TestRequest =>
    httpMock.expectOne((r) => r.method === 'DELETE' && r.url === UNMARK);

  function answerLoad(req: TestRequest, ids: string[]): void {
    req.flush({ success: true, hostels: ids.map((id) => ({ id, name: `Hostel ${id}` })) });
  }

  function fail(req: TestRequest, status: number): void {
    if (status === 0) req.error(new ProgressEvent('error'));
    else req.flush(null, { status, statusText: 'Error' });
  }

  const ids = (): string[] => store.items().map((l) => l.id);

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('following the session', () => {
    it('loads the signed-in user\'s favourites from the server, quietly, once', () => {
      setUp();
      TestBed.tick();
      httpMock.expectNone(LIST);

      session.setSession(user('A'), 'tok');
      TestBed.tick();
      const req = expectLoad();
      expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
      answerLoad(req, ['h1', 'h2']);

      expect(ids()).toEqual(['h1', 'h2']);
      expect(store.isFavorite('h1')).toBe(true);
      expect(store.isFavorite('h3')).toBe(false);
    });

    it('empties the hearts and drops the cache on sign-out', () => {
      signedInWith('A', ['h1']);
      TestBed.tick();
      expect(readCache()).toEqual({ owner: 'A', ids: ['h1'] });

      session.clear();
      TestBed.tick();

      expect(ids()).toEqual([]);
      expect(store.isFavorite('h1')).toBe(false);
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('swaps to the next user\'s list on an account switch, never showing the previous one', () => {
      signedInWith('A', ['h1']);

      session.setSession(user('B'), 'tok');
      TestBed.tick();
      expect(ids()).toEqual([]);

      answerLoad(expectLoad(), ['h2']);
      TestBed.tick();

      expect(ids()).toEqual(['h2']);
      expect(store.isFavorite('h1')).toBe(false);
      expect(readCache()).toEqual({ owner: 'B', ids: ['h2'] });
    });

    it('does not reload or wipe the list when the same user\'s session is restored again', () => {
      setUp({ signedIn: 'A', cache: cached('A', 'h1') });
      TestBed.tick();
      answerLoad(expectLoad(), ['h1']);

      session.setSession(user('A'), 'newTok');
      TestBed.tick();

      httpMock.expectNone(LIST);
      expect(ids()).toEqual(['h1']);
    });

    it('cancels the previous user\'s in-flight load when the account switches', () => {
      setUp({ signedIn: 'A' });
      TestBed.tick();
      const forA = expectLoad();

      session.setSession(user('B'), 'tok');
      TestBed.tick();
      expect(forA.cancelled).toBe(true);

      answerLoad(expectLoad(), ['h2']);
      expect(ids()).toEqual(['h2']);
    });

    it('never loads during server rendering', () => {
      setUp({ signedIn: 'A', platform: 'server' });

      expect(() => TestBed.tick()).not.toThrow();
      httpMock.expectNone(LIST);
    });
  });

  describe('the local cache', () => {
    it('paints the cached hearts of the signed-in user before the load answers', () => {
      setUp({ signedIn: 'A', cache: cached('A', 'h1') });

      expect(store.isFavorite('h1')).toBe(true);
    });

    it.each([
      ['another user\'s list', cached('B', 'h1')],
      ['a legacy un-owned array', JSON.stringify([listing('h1')])],
      ['unreadable JSON', '{not json'],
    ])('ignores %s', (_label, raw) => {
      setUp({ signedIn: 'A', cache: raw });

      expect(ids()).toEqual([]);
      expect(store.isFavorite('h1')).toBe(false);
    });

    it('removes a cache it finds while nobody is signed in', () => {
      setUp({ cache: cached('A', 'h1') });

      expect(localStorage.getItem(KEY)).toBeNull();
      expect(ids()).toEqual([]);
      TestBed.tick();
      httpMock.expectNone(LIST);
    });

    it('mirrors a change into the cache under its owner', () => {
      signedInWith('A', []);

      store.toggle(listing('h1'));
      TestBed.tick();

      expect(readCache()).toEqual({ owner: 'A', ids: ['h1'] });
      expectSave().flush({ success: true });
    });
  });

  describe('a failed background load', () => {
    it.each([500, 0])('keeps the cached hearts, says nothing and stays signed in on %s', (status) => {
      setUp({ signedIn: 'A', cache: cached('A', 'h1') });
      TestBed.tick();

      fail(expectLoad(), status);

      expect(ids()).toEqual(['h1']);
      expect(notify).not.toHaveBeenCalled();
      expect(session.user()?.id).toBe('A');
    });

    it('drops a hostel the server no longer has, even though the cache still does', () => {
      setUp({ signedIn: 'A', cache: cached('A', 'h1', 'h2') });
      TestBed.tick();

      answerLoad(expectLoad(), ['h2']);

      expect(ids()).toEqual(['h2']);
      expect(store.isFavorite('h1')).toBe(false);
    });
  });

  describe('an expired session', () => {
    function expectSignedOutQuietly(): void {
      TestBed.tick();
      expect(session.user()).toBeNull();
      expect(notify).not.toHaveBeenCalled();
      expect(ids()).toEqual([]);
      expect(localStorage.getItem(KEY)).toBeNull();
    }

    it('signs out and empties the hearts when the load answers 401', () => {
      setUp({ signedIn: 'A', cache: cached('A', 'h1') });
      TestBed.tick();

      fail(expectLoad(), 401);

      expectSignedOutQuietly();
    });

    it('signs out and empties the hearts when a save answers 401', () => {
      signedInWith('A', ['h1']);

      store.toggle(listing('h2'));
      fail(expectSave(), 401);

      expectSignedOutQuietly();
    });

    it('signs out without reloading when an unsave answers 401', () => {
      signedInWith('A', ['h1']);

      expect(store.toggle(listing('h1'))).toBe(false);
      fail(expectUnsave(), 401);

      expectSignedOutQuietly();
      httpMock.expectNone(LIST);
    });
  });

  describe('toggle', () => {
    it.each([500, 403, 0])('rolls a failed save back and toasts it once on %s', (status) => {
      signedInWith('A', []);

      expect(store.toggle(listing('h1'))).toBe(true);
      expect(store.isFavorite('h1')).toBe(true);
      fail(expectSave(), status);

      expect(store.isFavorite('h1')).toBe(false);
      expect(ids()).toEqual([]);
      expect(notify).toHaveBeenCalledOnce();

      answerLoad(expectLoad(), []);
      expect(ids()).toEqual([]);
      expect(notify).toHaveBeenCalledOnce();
    });

    it('puts a hostel whose unsave failed back where it was in the list', () => {
      signedInWith('A', ['h2', 'h1', 'h9']);

      expect(store.toggle(listing('h1'))).toBe(false);
      expect(ids()).toEqual(['h2', 'h9']);
      fail(expectUnsave(), 500);

      expect(ids()).toEqual(['h2', 'h1', 'h9']);
      answerLoad(expectLoad(), ['h2', 'h1', 'h9']);
      expect(ids()).toEqual(['h2', 'h1', 'h9']);
    });

    it('keeps a successful save and lets the next click unsave it', () => {
      signedInWith('A', []);

      expect(store.toggle(listing('h1'))).toBe(true);
      const save = expectSave();
      expect(save.request.body).toEqual({ hostel_id: 'h1' });
      save.flush({ success: true });
      expect(store.isFavorite('h1')).toBe(true);

      expect(store.toggle(listing('h1'))).toBe(false);
      const unsave = expectUnsave();
      expect(unsave.request.body).toEqual({ hostel_id: 'h1' });
      unsave.flush({ success: true });
      expect(store.isFavorite('h1')).toBe(false);
    });

    it('ignores further clicks on a hostel whose write is still in flight', () => {
      signedInWith('A', []);
      store.toggle(listing('h1'));

      expect(store.toggle(listing('h1'))).toBe(true);

      expect(httpMock.match((r) => r.url === MARK)).toHaveLength(1);
      httpMock.expectNone(UNMARK);
      expect(ids()).toEqual(['h1']);
    });

    it('does nothing while signed out', () => {
      setUp();
      TestBed.tick();

      expect(store.toggle(listing('h1'))).toBe(false);
      TestBed.tick();

      httpMock.expectNone(() => true);
      expect(ids()).toEqual([]);
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('lands on the new user\'s list when the account switched before the store noticed', () => {
      signedInWith('A', ['h1']);
      session.setSession(user('B'), 'tok');

      expect(store.toggle(listing('h2'))).toBe(true);

      expect(ids()).toEqual(['h2']);
      expect(store.isFavorite('h1')).toBe(false);
      expectSave().flush({ success: true });
      TestBed.tick();
      answerLoad(expectLoad(), ['h2']);
      expect(ids()).toEqual(['h2']);
    });

    it('lets a previous user\'s failing write neither touch nor lock the next user\'s list', () => {
      signedInWith('A', []);
      store.toggle(listing('h1'));
      const forA = expectSave();

      session.setSession(user('B'), 'tok');
      TestBed.tick();
      answerLoad(expectLoad(), ['h5']);
      fail(forA, 500);
      expect(ids()).toEqual(['h5']);

      expect(store.toggle(listing('h1'))).toBe(true);
      expectSave().flush({ success: true });
      expect(ids()).toEqual(['h1', 'h5']);
    });
  });

  describe('a load racing writes', () => {
    it('lays in-flight saves and unsaves over the server list', () => {
      setUp({ signedIn: 'A', cache: cached('A', 'h1') });
      TestBed.tick();
      const load = expectLoad();

      store.toggle(listing('h9'));
      store.toggle(listing('h1'));
      answerLoad(load, ['h1', 'h2']);

      expect(ids()).toEqual(['h9', 'h2']);
      expectSave().flush({ success: true });
      expectUnsave().flush({ success: true });
      expect(ids()).toEqual(['h9', 'h2']);
    });

    // The load's response was read before the save reached the server, so it cannot know about it.
    it('keeps a save that succeeded while the load was still in flight', () => {
      setUp({ signedIn: 'A' });
      TestBed.tick();
      const load = expectLoad();

      store.toggle(listing('h9'));
      expectSave().flush({ success: true });
      answerLoad(load, ['h2']);

      expect(store.isFavorite('h9')).toBe(true);
      expect(ids()).toEqual(['h9', 'h2']);
    });

    it('keeps an unsave that succeeded while the load was still in flight', () => {
      setUp({ signedIn: 'A', cache: cached('A', 'h2') });
      TestBed.tick();
      const load = expectLoad();

      store.toggle(listing('h2'));
      expectUnsave().flush({ success: true });
      answerLoad(load, ['h2']);

      expect(store.isFavorite('h2')).toBe(false);
      expect(ids()).toEqual([]);
    });
  });

  describe('reloading after a failed write', () => {
    it('fills the heart back in when the server already had the hostel it refused to save', () => {
      setUp({ signedIn: 'A' });
      TestBed.tick();
      const first = expectLoad();

      expect(store.toggle(listing('h1'))).toBe(true);
      fail(expectSave(), 422);

      expect(first.cancelled).toBe(true);
      expect(store.isFavorite('h1')).toBe(false);
      answerLoad(expectLoad(), ['h1']);
      expect(store.isFavorite('h1')).toBe(true);
      expect(ids()).toEqual(['h1']);
    });

    it('empties the heart when the server no longer had the hostel it refused to unsave', () => {
      setUp({ signedIn: 'A', cache: cached('A', 'h1') });
      TestBed.tick();
      const first = expectLoad();

      expect(store.toggle(listing('h1'))).toBe(false);
      fail(expectUnsave(), 404);

      expect(first.cancelled).toBe(true);
      expect(store.isFavorite('h1')).toBe(true);
      answerLoad(expectLoad(), []);
      expect(store.isFavorite('h1')).toBe(false);
      expect(ids()).toEqual([]);
    });

    it('keeps other writes still in flight when the reload lands', () => {
      signedInWith('A', ['h1']);
      store.toggle(listing('h9'));
      const saveH9 = expectSave();

      store.toggle(listing('h2'));
      fail(expectSave(), 500);
      expect(ids()).toEqual(['h9', 'h1']);

      answerLoad(expectLoad(), ['h1']);
      expect(ids()).toEqual(['h9', 'h1']);
      expect(store.isFavorite('h2')).toBe(false);

      saveH9.flush({ success: true });
      expect(ids()).toEqual(['h9', 'h1']);
    });

    it('does not retry a reload that fails, and keeps the rolled-back hearts', () => {
      signedInWith('A', ['h1']);

      store.toggle(listing('h2'));
      fail(expectSave(), 500);
      fail(expectLoad(), 500);
      TestBed.tick();

      httpMock.expectNone(LIST);
      expect(ids()).toEqual(['h1']);
      expect(notify).toHaveBeenCalledOnce();
      expect(session.user()?.id).toBe('A');
    });

    it('does not reload for a previous user\'s write that fails after the switch', () => {
      signedInWith('A', []);
      store.toggle(listing('h1'));
      const forA = expectSave();

      session.setSession(user('B'), 'tok');
      TestBed.tick();
      answerLoad(expectLoad(), ['h5']);
      fail(forA, 500);

      httpMock.expectNone(LIST);
      expect(ids()).toEqual(['h5']);
    });

    it('does not reload for a previous user\'s write that fails before the store noticed the switch', () => {
      signedInWith('A', []);
      store.toggle(listing('h1'));
      const forA = expectSave();

      session.setSession(user('B'), 'tok');
      fail(forA, 500);
      httpMock.expectNone(LIST);

      TestBed.tick();
      answerLoad(expectLoad(), ['h5']);
      TestBed.tick();
      expect(ids()).toEqual(['h5']);
      expect(readCache()).toEqual({ owner: 'B', ids: ['h5'] });
    });
  });

  describe('unsave', () => {
    it('completes for a hostel the store never loaded, without adding it', () => {
      signedInWith('A', ['h1']);
      const complete = vi.fn();

      store.unsave(listing('h9')).subscribe({ complete });
      expectUnsave().flush({ success: true });

      expect(complete).toHaveBeenCalledOnce();
      expect(ids()).toEqual(['h1']);
    });

    it('fails for a hostel the store never loaded, without adding it', () => {
      signedInWith('A', ['h1']);
      let caught: ApiError | undefined;

      store.unsave(listing('h9')).subscribe({ error: (e: ApiError) => (caught = e) });
      fail(expectUnsave(), 500);

      expect(caught?.status).toBe(500);
      expect(store.isFavorite('h9')).toBe(false);
      expect(ids()).toEqual(['h1']);
      answerLoad(expectLoad(), ['h1']);
      expect(ids()).toEqual(['h1']);
    });

    it('sends the request even when nobody subscribes', () => {
      signedInWith('A', ['h2', 'h1', 'h9']);

      store.unsave(listing('h1'));

      const req = expectUnsave();
      expect(req.request.body).toEqual({ hostel_id: 'h1' });
      req.flush({ success: true });
      expect(ids()).toEqual(['h2', 'h9']);
    });

    it('completes once the server accepts it', () => {
      signedInWith('A', ['h2', 'h1', 'h9']);
      const next = vi.fn();
      const complete = vi.fn();

      store.unsave(listing('h1')).subscribe({ next, complete });
      expect(complete).not.toHaveBeenCalled();
      expectUnsave().flush({ success: true });

      expect(next).toHaveBeenCalledOnce();
      expect(complete).toHaveBeenCalledOnce();
      expect(ids()).toEqual(['h2', 'h9']);
    });

    it('hands the error to the subscriber and puts the hostel back at its index', () => {
      signedInWith('A', ['h2', 'h1', 'h9']);
      let caught: ApiError | undefined;

      store.unsave(listing('h1')).subscribe({ error: (e: ApiError) => (caught = e) });
      fail(expectUnsave(), 500);

      expect(caught?.status).toBe(500);
      expect(ids()).toEqual(['h2', 'h1', 'h9']);
      answerLoad(expectLoad(), ['h2', 'h1', 'h9']);
      expect(ids()).toEqual(['h2', 'h1', 'h9']);
    });

    it('errors at once, without a request, while signed out', () => {
      setUp();
      TestBed.tick();
      const error = vi.fn();

      store.unsave(listing('h1')).subscribe({ error });

      expect(error).toHaveBeenCalledOnce();
      httpMock.expectNone(() => true);
    });

    it('errors at once, without a request, while that hostel\'s write is in flight', () => {
      signedInWith('A', ['h1']);
      store.toggle(listing('h1'));
      const error = vi.fn();

      store.unsave(listing('h1')).subscribe({ error });

      expect(error).toHaveBeenCalledOnce();
      expect(httpMock.match((r) => r.url === UNMARK)).toHaveLength(1);
    });
  });
});
