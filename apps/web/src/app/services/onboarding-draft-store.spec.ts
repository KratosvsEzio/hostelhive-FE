import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorHandler, PLATFORM_ID, effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SessionStore, SessionUser } from '@core/auth/session-store';
import { OnboardingDraftStore, provideOnboardingDraftCleanup } from './onboarding-draft-store';

const KEY = 'hh:onboarding:draft';

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

/** The raw stored value for a draft owned by `owner` (or ownerless when `owner` is null). */
function stored(owner: string | null, fields: Record<string, unknown> = {}): string {
  return JSON.stringify(owner === null ? fields : { owner, ...fields });
}

function readStored(): Record<string, unknown> | null {
  const raw = localStorage.getItem(KEY);
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
}

/**
 * The become-a-host draft in localStorage, driven through the real session.
 *
 * The draft is only ever handed to the user who wrote it: anyone else's, an ownerless one or
 * an unreadable one is removed when read, and the draft goes as soon as the session ends or
 * changes hands. A session still being restored (a token without a user) is not a sign-out.
 */
describe('OnboardingDraftStore', () => {
  let store: OnboardingDraftStore;
  let session: SessionStore;
  const handleError = vi.fn();

  function setUp(
    opts: {
      signedIn?: string;
      tokenOnly?: boolean;
      draft?: string;
      platform?: 'browser' | 'server';
    } = {},
  ): void {
    handleError.mockReset();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: opts.platform ?? 'browser' },
        { provide: ErrorHandler, useValue: { handleError } },
      ],
    });
    session = TestBed.inject(SessionStore);
    if (opts.draft !== undefined) localStorage.setItem(KEY, opts.draft);
    if (opts.signedIn) session.setSession(user(opts.signedIn), 'tok');
    else if (opts.tokenOnly) session.setAccessToken('tok');
    store = TestBed.inject(OnboardingDraftStore);
  }

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('read', () => {
    it('hands the signed-in user their own draft without the owner, leaving it stored', () => {
      const raw = stored('A', { name: 'Hostel A', draftId: 42, phone: '0300' });
      setUp({ signedIn: 'A', draft: raw });

      expect(store.read()).toEqual({ name: 'Hostel A', draftId: 42, phone: '0300' });
      expect(localStorage.getItem(KEY)).toBe(raw);
    });

    it('returns nothing for another user\'s draft and removes it', () => {
      setUp({ signedIn: 'A', draft: stored('B', { name: 'Hostel B', draftId: 42 }) });

      expect(store.read()).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('returns nothing for a draft saved without an owner and removes it', () => {
      setUp({ signedIn: 'A', draft: stored(null, { name: 'Legacy', draftId: 42 }) });

      expect(store.read()).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it.each([
      ['unreadable JSON', '{not json'],
      ['an array', JSON.stringify([{ owner: 'A', name: 'Hostel A' }])],
      ['a stored null', 'null'],
      ['a number', '42'],
    ])('returns nothing for %s and removes it', (_label, raw) => {
      setUp({ signedIn: 'A', draft: raw });

      expect(store.read()).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('returns nothing while signed out and leaves a stored draft alone', () => {
      const raw = stored('A', { name: 'Hostel A' });
      setUp({ draft: raw });

      expect(store.read()).toBeNull();
      expect(localStorage.getItem(KEY)).toBe(raw);
    });

    it('returns nothing when no draft is stored', () => {
      setUp({ signedIn: 'A' });

      expect(store.read()).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });

  describe('write', () => {
    it('stores the fields under the signed-in user, overriding any owner the caller passed', () => {
      setUp({ signedIn: 'A' });

      store.write({ name: 'Hostel A', draftId: 7, owner: 'B' });

      expect(readStored()).toEqual({ name: 'Hostel A', draftId: 7, owner: 'A' });
      expect(store.read()).toEqual({ name: 'Hostel A', draftId: 7 });
    });

    it('replaces the previous draft rather than merging into it', () => {
      setUp({ signedIn: 'A', draft: stored('A', { name: 'Old', draftId: 7 }) });

      store.write({ name: 'New' });

      expect(readStored()).toEqual({ name: 'New', owner: 'A' });
    });

    it('does nothing while signed out', () => {
      setUp();

      store.write({ name: 'Hostel A' });

      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('leaves a stored draft untouched while signed out', () => {
      const raw = stored('A', { name: 'Hostel A' });
      setUp({ draft: raw });

      store.write({ name: 'Someone else' });

      expect(localStorage.getItem(KEY)).toBe(raw);
    });
  });

  describe('clear', () => {
    it('removes the stored draft', () => {
      setUp({ signedIn: 'A', draft: stored('A', { name: 'Hostel A' }) });

      store.clear();

      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });

  describe('when storage fails', () => {
    function storageThrows(): void {
      const boom = (): never => {
        throw new Error('storage unavailable');
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    }

    it('never lets an error escape read, write or clear', () => {
      setUp({ signedIn: 'A' });
      storageThrows();

      expect(store.read()).toBeNull();
      expect(() => store.write({ name: 'Hostel A' })).not.toThrow();
      expect(() => store.clear()).not.toThrow();
    });

    it('never lets an error escape the session hook', () => {
      setUp({ signedIn: 'A' });
      TestBed.tick();
      storageThrows();

      session.setSession(user('B'), 'tok');
      expect(() => TestBed.tick()).not.toThrow();
      session.clear();
      expect(() => TestBed.tick()).not.toThrow();

      expect(handleError).not.toHaveBeenCalled();
    });
  });

  describe('following the session', () => {
    it('removes the draft on sign-out', () => {
      setUp({ signedIn: 'A', draft: stored('A', { name: 'Hostel A', draftId: 42 }) });
      TestBed.tick();
      expect(localStorage.getItem(KEY)).not.toBeNull();

      session.clear();
      TestBed.tick();

      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('removes the previous user\'s draft when another user signs in without a sign-out', () => {
      setUp({ signedIn: 'A', draft: stored('A', { name: 'Hostel A', draftId: 42 }) });
      TestBed.tick();

      session.setSession(user('B'), 'tok');
      TestBed.tick();

      expect(localStorage.getItem(KEY)).toBeNull();
      expect(store.read()).toBeNull();
    });

    it('keeps the draft when the same user\'s session is set again', () => {
      const raw = stored('A', { name: 'Hostel A', draftId: 42 });
      setUp({ signedIn: 'A', draft: raw });
      TestBed.tick();

      session.setSession(user('A'), 'newTok');
      TestBed.tick();

      expect(localStorage.getItem(KEY)).toBe(raw);
      expect(store.read()).toEqual({ name: 'Hostel A', draftId: 42 });
    });

    it('keeps the draft while a session is being restored, and removes it once that session ends', () => {
      const raw = stored('A', { name: 'Hostel A', draftId: 42 });
      setUp({ tokenOnly: true, draft: raw });
      TestBed.tick();
      expect(localStorage.getItem(KEY)).toBe(raw);

      session.setSession(user('A'), 'tok');
      TestBed.tick();
      expect(localStorage.getItem(KEY)).toBe(raw);
      expect(store.read()).toEqual({ name: 'Hostel A', draftId: 42 });

      session.clear();
      TestBed.tick();
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('removes a draft left behind when it starts with nobody signed in', () => {
      setUp({ draft: stored('A', { name: 'Hostel A', draftId: 42 }) });

      TestBed.tick();

      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });

  describe('during server rendering', () => {
    it('never reads, writes or removes the draft', () => {
      const raw = stored('B', { name: 'Hostel B', draftId: 42 });
      setUp({ signedIn: 'A', draft: raw, platform: 'server' });

      expect(store.read()).toBeNull();
      store.write({ name: 'Hostel A' });
      store.clear();
      TestBed.tick();
      session.clear();
      TestBed.tick();

      expect(localStorage.getItem(KEY)).toBe(raw);
      expect(handleError).not.toHaveBeenCalled();
    });
  });

  describe('called from inside an effect', () => {
    function countRuns(body: () => void): () => number {
      let runs = 0;
      TestBed.runInInjectionContext(() =>
        effect(() => {
          runs++;
          body();
        }),
      );
      return () => runs;
    }

    it('does not make the caller re-run when the session user changes on read', () => {
      setUp({ signedIn: 'A', draft: stored('A', { name: 'Hostel A' }) });
      const runs = countRuns(() => store.read());
      TestBed.tick();
      expect(runs()).toBe(1);

      session.setSession(user('B'), 'tok');
      TestBed.tick();

      expect(runs()).toBe(1);
    });

    it('does not make the caller re-run when the session user changes on write', () => {
      setUp({ signedIn: 'A' });
      const runs = countRuns(() => store.write({ name: 'Hostel A' }));
      TestBed.tick();
      expect(runs()).toBe(1);

      session.setSession(user('B'), 'tok');
      TestBed.tick();

      expect(runs()).toBe(1);
    });
  });
});

/**
 * Sign-out normally happens on a page with no onboarding screen, so nothing there injects the
 * store. The cleanup provider creates it at bootstrap; these tests never inject the store
 * themselves, so only the provider can be what removes the draft.
 */
describe('provideOnboardingDraftCleanup', () => {
  let session: SessionStore;
  const handleError = vi.fn();

  /** Boots the test module; TestBed runs app initializers on the first inject. */
  function boot(opts: { cleanup: boolean; platform?: 'browser' | 'server'; draft: string }): void {
    handleError.mockReset();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: opts.platform ?? 'browser' },
        { provide: ErrorHandler, useValue: { handleError } },
        ...(opts.cleanup ? [provideOnboardingDraftCleanup()] : []),
      ],
    });
    session = TestBed.inject(SessionStore);
    localStorage.setItem(KEY, opts.draft);
    session.setSession(user('A'), 'tok');
    TestBed.tick();
  }

  afterEach(() => {
    localStorage.clear();
  });

  it('removes a signed-in user\'s draft at sign-out without anything else creating the store', () => {
    const raw = stored('A', { name: 'Hostel A', draftId: 42 });
    boot({ cleanup: true, draft: raw });
    expect(localStorage.getItem(KEY)).toBe(raw);

    session.clear();
    TestBed.tick();

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(handleError).not.toHaveBeenCalled();
  });

  it('is what removes the draft: without it, the same sign-out leaves the draft behind', () => {
    // Guards the test above: if anything else created the store, this would pass vacuously there.
    const raw = stored('A', { name: 'Hostel A', draftId: 42 });
    boot({ cleanup: false, draft: raw });

    session.clear();
    TestBed.tick();

    expect(localStorage.getItem(KEY)).toBe(raw);
  });

  it('never reads or removes the draft on the server platform', () => {
    const raw = stored('B', { name: 'Hostel B', draftId: 42 });
    boot({ cleanup: true, platform: 'server', draft: raw });

    session.clear();
    TestBed.tick();

    expect(localStorage.getItem(KEY)).toBe(raw);
    expect(handleError).not.toHaveBeenCalled();
  });
});

/**
 * The provider only helps if the app actually registers it. Booting the real appConfig would
 * pull in auth, analytics and native-shell initializers, so the config source is read instead.
 */
describe('app config', () => {
  const configPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'app.config.ts');
  const code = readFileSync(configPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('registers the onboarding draft cleanup provider', () => {
    expect(code).toMatch(/\bprovideOnboardingDraftCleanup\(\)\s*,/);
  });

  it('imports that provider from the draft store', () => {
    expect(code).toMatch(
      /import\s*\{[^}]*\bprovideOnboardingDraftCleanup\b[^}]*\}\s*from\s*'@services\/onboarding-draft-store'/,
    );
  });
});
