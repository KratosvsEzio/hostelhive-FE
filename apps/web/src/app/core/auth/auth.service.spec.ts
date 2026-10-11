import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ApiError, CurrentUser } from '@hostelhive/data-access';
import { AuthApi } from '@services';
import { API_CONFIG } from '@core/api-config';
import { GeoPreference } from '@core/geo/geo-preference';
import { authInterceptor } from '@core/interceptors/auth-interceptor';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { PushNotificationsService } from '@core/push-notifications';
import { StartupGate } from '@core/startup-gate';
import { Subject, defer, firstValueFrom, of, throwError } from 'rxjs';
import { AccountConfirmedNotSignedIn, AuthService } from './auth.service';
import { provideAuth } from './provide-auth';
import { SessionStore, SessionUser } from './session-store';

const TOKEN_COOKIE = 'hh_auth_token';
const USER_KEY = 'hh.auth.user';
// Not a three-part JWT, so the expiry check cannot read it and the token goes to the server.
const TOKEN = 'opaque-session-token';

const cachedUser: SessionUser = {
  id: '7',
  name: 'Ayesha',
  email: 'ayesha@h.pk',
  role: 'seeker',
  allRoles: ['seeker'],
  permissions: [],
};

const newAccount: CurrentUser = {
  id: 9,
  name: 'Bilal',
  email: 'bilal@h.pk',
  is_active: true,
  is_admin: false,
  roles: [],
};

function apiError(status: number): ApiError {
  return { status, code: 'unknown_error', message: 'failed' };
}

function persistSession(): void {
  document.cookie = `${TOKEN_COOKIE}=${TOKEN}; path=/`;
  localStorage.setItem(USER_KEY, JSON.stringify(cachedUser));
}

function clearPersistence(): void {
  document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0`;
  localStorage.clear();
}

/** Builds a JWT with a real base64url payload. The signature is never inspected. */
function jwtWithClaims(claims: Record<string, unknown>): string {
  const part = (o: unknown): string =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part({ alg: 'HS256' })}.${part(claims)}.signature`;
}

/** Persists the given token (cookie) and the cached user, as a returning visit would find them. */
function persistToken(value: string): void {
  document.cookie = `${TOKEN_COOKIE}=${value}; path=/`;
  localStorage.setItem(USER_KEY, JSON.stringify(cachedUser));
}

/** Lets the background validation's promise chain settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('AuthService', () => {
  let service: AuthService;
  let session: SessionStore;
  const currentUser = vi.fn();
  const signIn = vi.fn();
  const confirmInvitation = vi.fn();
  const signOut = vi.fn();
  const rotate = vi.fn();
  const navigateByUrl = vi.fn();

  beforeEach(() => {
    clearPersistence();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthApi,
          useValue: { currentUser, signIn, confirmInvitation, signOut },
        },
        { provide: Router, useValue: { navigateByUrl } },
        { provide: StartupGate, useValue: { hold: () => () => undefined } },
        {
          provide: PushNotificationsService,
          useValue: {
            init: () => Promise.resolve(),
            rotate,
          },
        },
      ],
    });
    service = TestBed.inject(AuthService);
    session = TestBed.inject(SessionStore);
  });

  afterEach(() => {
    vi.resetAllMocks();
    clearPersistence();
  });

  describe('restoreSession', () => {
    it('ends the session and returns to the landing page when the server rejects the token', async () => {
      persistSession();
      currentUser.mockReturnValue(throwError(() => apiError(401)));

      await service.restoreSession();
      await settle();

      expect(session.user()).toBeNull();
      expect(session.accessToken()).toBeNull();
      expect(session.readPersistedToken()).toBeNull();
      expect(localStorage.getItem(USER_KEY)).toBeNull();
      expect(navigateByUrl).toHaveBeenCalledWith('/');
    });

    it('validates the persisted token without suppressing the error toast', async () => {
      persistSession();
      currentUser.mockReturnValue(of(newAccount));

      await service.restoreSession();
      await settle();

      expect(currentUser).toHaveBeenCalledExactlyOnceWith();
    });

    it.each([0, 500])(
      'keeps the session when validation fails with status %i',
      async (status) => {
        persistSession();
        currentUser.mockReturnValue(throwError(() => apiError(status)));

        await service.restoreSession();
        await settle();

        expect(currentUser).toHaveBeenCalled();
        expect(session.user()).toEqual(cachedUser);
        expect(session.accessToken()).toBe(TOKEN);
        expect(session.readPersistedToken()).toBe(TOKEN);
        expect(session.readPersistedUser()).toEqual(cachedUser);
        expect(navigateByUrl).not.toHaveBeenCalled();
      },
    );
  });

  describe('restoreSession while validation is in flight', () => {
    const OTHER_TOKEN = 'other-account-token';
    const otherUser: SessionUser = { ...cachedUser, id: '9', name: 'Bilal' };

    /** Starts a restore whose server answer is held until the test releases it. */
    function startHeldRestore(): Subject<CurrentUser> {
      persistSession();
      const answer = new Subject<CurrentUser>();
      currentUser.mockReturnValue(answer);
      void service.restoreSession();
      return answer;
    }

    it('leaves another account that was seated meanwhile untouched when the server answers', async () => {
      const answer = startHeldRestore();
      session.setSession(otherUser, OTHER_TOKEN);

      answer.next({ ...newAccount, id: 77 });
      answer.complete();
      await settle();

      expect(session.accessToken()).toBe(OTHER_TOKEN);
      expect(session.user()?.id).toBe('9');
      expect(session.readPersistedToken()).toBe(OTHER_TOKEN);
      expect(session.readPersistedUser()?.id).toBe('9');
    });

    it('does not revive a session that was cleared meanwhile when the server answers', async () => {
      const answer = startHeldRestore();
      session.clear();

      answer.next(newAccount);
      answer.complete();
      await settle();

      expect(session.accessToken()).toBeNull();
      expect(session.user()).toBeNull();
      expect(session.readPersistedToken()).toBeNull();
      expect(session.readPersistedUser()).toBeNull();
    });

    it('keeps another account that was seated meanwhile and stays put when the server answers 401', async () => {
      const answer = startHeldRestore();
      session.setSession(otherUser, OTHER_TOKEN);

      answer.error(apiError(401));
      await settle();

      expect(session.accessToken()).toBe(OTHER_TOKEN);
      expect(session.user()?.id).toBe('9');
      expect(session.readPersistedToken()).toBe(OTHER_TOKEN);
      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it('still clears and goes home on 401 when the session was already cleared meanwhile', async () => {
      const answer = startHeldRestore();
      session.clear();

      answer.error(apiError(401));
      await settle();

      expect(session.accessToken()).toBeNull();
      expect(session.readPersistedToken()).toBeNull();
      expect(navigateByUrl).toHaveBeenCalledWith('/');
    });
  });

  describe('restoreSession with a token that carries its own expiry', () => {
    it('retires a token past its expiry without asking the server', async () => {
      persistToken(jwtWithClaims({ expiry: '2020-01-01T00:00:00.000Z' }));

      await service.restoreSession();

      expect(currentUser).not.toHaveBeenCalled();
      expect(session.accessToken()).toBeNull();
      expect(session.user()).toBeNull();
      expect(session.readPersistedToken()).toBeNull();
      expect(session.readPersistedUser()).toBeNull();
    });

    it('still validates a token whose expiry has no zone and keeps it when the server accepts it', async () => {
      const zoneless = jwtWithClaims({ expiry: '2020-01-01T00:00:00' });
      persistToken(zoneless);
      currentUser.mockReturnValue(of(newAccount));

      await service.restoreSession();
      await settle();

      expect(currentUser).toHaveBeenCalledTimes(1);
      expect(session.accessToken()).toBe(zoneless);
      expect(session.readPersistedToken()).toBe(zoneless);
      expect(session.user()?.id).toBe('9');
    });
  });

  describe('signOut', () => {
    it('revokes once without suppressing the error toast', async () => {
      signOut.mockReturnValue(of(undefined));

      await firstValueFrom(service.signOut());

      expect(signOut).toHaveBeenCalledTimes(1);
      const [options] = signOut.mock.calls[0];
      expect(options?.inlineErrors).toBeFalsy();
    });
  });

  describe('signOutThenConfirmInvitation', () => {
    const NEW_TOKEN = 'new-account-token';

    function signInPreviousAccount(): void {
      persistSession();
      session.setSession(cachedUser, TOKEN);
    }

    beforeEach(() => {
      confirmInvitation.mockReturnValue(of(NEW_TOKEN));
      currentUser.mockReturnValue(of(newAccount));
    });

    it('revokes with inline errors and spends the one-time token only after the revoke completes', () => {
      signInPreviousAccount();
      const revoke = new Subject<void>();
      signOut.mockReturnValue(revoke);

      service.signOutThenConfirmInvitation('one-time').subscribe();

      expect(signOut).toHaveBeenCalledExactlyOnceWith({ inlineErrors: true });
      expect(confirmInvitation).not.toHaveBeenCalled();

      revoke.next();
      revoke.complete();

      expect(confirmInvitation).toHaveBeenCalledExactlyOnceWith('one-time');
    });

    it('has emptied the session and rotated push by the time the one-time token is spent', () => {
      signInPreviousAccount();
      const revoke = new Subject<void>();
      signOut.mockReturnValue(revoke);
      const seen: {
        accessToken: string | null;
        persistedToken: string | null;
        persistedUser: SessionUser | null;
        rotated: boolean;
      }[] = [];
      confirmInvitation.mockImplementation(() => {
        seen.push({
          accessToken: session.accessToken(),
          persistedToken: session.readPersistedToken(),
          persistedUser: session.readPersistedUser(),
          rotated: rotate.mock.calls.length > 0,
        });
        return of(NEW_TOKEN);
      });

      service.signOutThenConfirmInvitation('one-time').subscribe();
      revoke.next();
      revoke.complete();

      expect(seen).toEqual([
        { accessToken: null, persistedToken: null, persistedUser: null, rotated: true },
      ]);
    });

    it.each([0, 500, 401])(
      'still spends the one-time token and seats the new account when the revoke fails with status %i',
      async (status) => {
        signInPreviousAccount();
        signOut.mockReturnValue(throwError(() => apiError(status)));

        await firstValueFrom(service.signOutThenConfirmInvitation('one-time'));

        expect(confirmInvitation).toHaveBeenCalledExactlyOnceWith('one-time');
        expect(session.accessToken()).toBe(NEW_TOKEN);
        expect(session.user()?.id).toBe('9');
      },
    );

    it('seats and persists the new account and leaves nothing of the previous one', async () => {
      signInPreviousAccount();
      signOut.mockReturnValue(of(undefined));

      const value = await firstValueFrom(service.signOutThenConfirmInvitation('one-time'));

      expect(value.id).toBe('9');
      expect(session.user()?.id).toBe('9');
      expect(session.accessToken()).toBe(NEW_TOKEN);
      expect(session.readPersistedToken()).toBe(NEW_TOKEN);
      expect(session.readPersistedUser()?.id).toBe('9');
    });

    it('passes a failed exchange to the subscriber and does not put the previous account back', async () => {
      signInPreviousAccount();
      signOut.mockReturnValue(of(undefined));
      const original = apiError(500);
      confirmInvitation.mockReturnValue(throwError(() => original));

      await expect(
        firstValueFrom(service.signOutThenConfirmInvitation('one-time')),
      ).rejects.toBe(original);

      expect(session.accessToken()).toBeNull();
      expect(session.user()).toBeNull();
      expect(session.readPersistedToken()).toBeNull();
      expect(session.readPersistedUser()).toBeNull();
    });
  });

  describe('signIn', () => {
    it('clears the new session when the current-user lookup answers 401', async () => {
      signIn.mockReturnValue(of(TOKEN));
      currentUser.mockReturnValue(throwError(() => apiError(401)));

      service.signIn('ayesha@h.pk', 'secret').subscribe();
      await settle();

      expect(currentUser).toHaveBeenCalled();
      expect(session.accessToken()).toBeNull();
      expect(session.user()).toBeNull();
    });

    it('looks up the current user without suppressing the error toast', async () => {
      signIn.mockReturnValue(of(TOKEN));
      currentUser.mockReturnValue(of(newAccount));

      service.signIn('ayesha@h.pk', 'secret').subscribe();
      await settle();

      expect(currentUser).toHaveBeenCalledExactlyOnceWith();
    });

    it('keeps the new token seated when the current-user lookup fails with status 0', async () => {
      signIn.mockReturnValue(of(TOKEN));
      currentUser.mockReturnValue(throwError(() => apiError(0)));

      service.signIn('ayesha@h.pk', 'secret').subscribe();
      await settle();

      expect(currentUser).toHaveBeenCalled();
      expect(session.accessToken()).toBe(TOKEN);
    });
  });

  describe('confirmInvitation', () => {
    const NEW_TOKEN = 'new-account-token';

    /** Account A is signed in and persisted before the confirmation link is opened. */
    function signInPreviousAccount(): void {
      persistSession();
      session.setSession(cachedUser, TOKEN);
    }

    function expectPreviousAccountIntact(): void {
      expect(session.user()).toEqual(cachedUser);
      expect(session.accessToken()).toBe(TOKEN);
      expect(session.readPersistedToken()).toBe(TOKEN);
      expect(session.readPersistedUser()).toEqual(cachedUser);
    }

    function expectNothingSignedIn(): void {
      expect(session.user()).toBeNull();
      expect(session.accessToken()).toBeNull();
      expect(session.readPersistedToken()).toBeNull();
      expect(session.readPersistedUser()).toBeNull();
    }

    /** Runs the confirmation to completion and reports how it ended. */
    async function runConfirmation(): Promise<{
      value?: SessionUser;
      error?: unknown;
    }> {
      try {
        const value = await firstValueFrom(service.confirmInvitation('one-time'));
        return { value };
      } catch (error) {
        return { error };
      }
    }

    beforeEach(() => {
      confirmInvitation.mockReturnValue(of(NEW_TOKEN));
    });

    describe('when the user lookup fails with something other than a 401', () => {
      it.each([0, 500])(
        'puts the signed-in account back untouched on status %i',
        async (status) => {
          signInPreviousAccount();
          currentUser.mockReturnValue(throwError(() => apiError(status)));

          const { error } = await runConfirmation();

          expect(error).toBeDefined();
          expectPreviousAccountIntact();
        },
      );

      it.each([0, 500])(
        'rotates the push registration once on status %i when an account was signed in',
        async (status) => {
          signInPreviousAccount();
          currentUser.mockReturnValue(throwError(() => apiError(status)));

          await runConfirmation();

          expect(rotate).toHaveBeenCalledTimes(1);
        },
      );

      it.each([0, 500])(
        'returns to the tokenless state without rotating push on status %i when nobody was signed in',
        async (status) => {
          currentUser.mockReturnValue(throwError(() => apiError(status)));

          const { error } = await runConfirmation();

          expect(error).toBeDefined();
          expectNothingSignedIn();
          expect(rotate).not.toHaveBeenCalled();
        },
      );
    });

    describe('when the user lookup answers 401', () => {
      it('clears the signed-in account entirely without rotating push', async () => {
        signInPreviousAccount();
        currentUser.mockReturnValue(throwError(() => apiError(401)));

        await runConfirmation();

        expectNothingSignedIn();
        expect(rotate).not.toHaveBeenCalled();
      });

      it('leaves a signed-out session empty without rotating push', async () => {
        currentUser.mockReturnValue(throwError(() => apiError(401)));

        await runConfirmation();

        expectNothingSignedIn();
        expect(rotate).not.toHaveBeenCalled();
      });
    });

    it.each([0, 500, 401])(
      'rejects as confirmed-but-not-signed-in, keeping the original error, when the lookup fails with status %i',
      async (status) => {
        const original = apiError(status);
        currentUser.mockReturnValue(throwError(() => original));

        const { error } = await runConfirmation();

        expect(error).toBeInstanceOf(AccountConfirmedNotSignedIn);
        expect((error as Error).name).toBe('AccountConfirmedNotSignedIn');
        expect((error as Error & { cause: unknown }).cause).toBe(original);
      },
    );

    it('still rejects as confirmed-but-not-signed-in when an account was signed in and the lookup answers 401', async () => {
      signInPreviousAccount();
      const original = apiError(401);
      currentUser.mockReturnValue(throwError(() => original));

      const { error } = await runConfirmation();

      expect(error).toBeInstanceOf(AccountConfirmedNotSignedIn);
      expect((error as Error & { cause: unknown }).cause).toBe(original);
    });

    it.each([
      ['nobody signed in', false, 0],
      ['nobody signed in', false, 403],
      ['nobody signed in', false, 500],
      ['an account signed in', true, 0],
      ['an account signed in', true, 403],
      ['an account signed in', true, 500],
    ])(
      'passes a failed exchange through unwrapped and touches nothing (%s, status %i)',
      async (_label, signedIn, status) => {
        if (signedIn) signInPreviousAccount();
        const original = apiError(status);
        confirmInvitation.mockReturnValue(throwError(() => original));

        const { error } = await runConfirmation();

        expect(error).toBe(original);
        expect(currentUser).not.toHaveBeenCalled();
        if (signedIn) expectPreviousAccountIntact();
        else expectNothingSignedIn();
        expect(rotate).not.toHaveBeenCalled();
      },
    );

    it('seats and persists the confirmed account when nobody was signed in', async () => {
      currentUser.mockReturnValue(of(newAccount));

      const { value } = await runConfirmation();

      expect(value?.id).toBe('9');
      expect(session.user()?.id).toBe('9');
      expect(session.accessToken()).toBe(NEW_TOKEN);
      expect(session.readPersistedToken()).toBe(NEW_TOKEN);
      expect(session.readPersistedUser()?.id).toBe('9');
      expect(rotate).not.toHaveBeenCalled();
    });

    it('replaces the signed-in account everywhere, without rotating push', async () => {
      signInPreviousAccount();
      currentUser.mockReturnValue(of(newAccount));

      await runConfirmation();

      expect(session.user()?.id).toBe('9');
      expect(session.accessToken()).toBe(NEW_TOKEN);
      expect(session.readPersistedToken()).toBe(NEW_TOKEN);
      expect(session.readPersistedUser()?.id).toBe('9');
      expect(rotate).not.toHaveBeenCalled();
    });

    it('asks for the current user with inline errors so no global toast covers the page', async () => {
      currentUser.mockReturnValue(of(newAccount));

      await runConfirmation();

      expect(currentUser).toHaveBeenCalledExactlyOnceWith({
        inlineErrors: true,
      });
    });

    it('leaves a token that was replaced meanwhile alone when the lookup fails', async () => {
      signInPreviousAccount();
      currentUser.mockReturnValue(
        defer(() => {
          session.setAccessToken('C');
          return throwError(() => apiError(0));
        }),
      );

      await runConfirmation();

      expect(session.accessToken()).toBe('C');
      expect(rotate).not.toHaveBeenCalled();
    });
  });
});

describe('AuthService.restoreSession through the real HTTP stack', () => {
  const BASE = 'https://api.test';
  const navigateByUrl = vi.fn();
  const userB: SessionUser = { ...cachedUser, id: '9', name: 'Bilal', email: 'bilal@h.pk' };

  afterEach(() => {
    vi.resetAllMocks();
    clearPersistence();
  });

  /** Wires the real interceptors and starts A's restore, leaving its validation request pending. */
  async function startRestoreOfA() {
    clearPersistence();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        provideAuth(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: GeoPreference, useValue: { refresh: vi.fn() } },
        { provide: Router, useValue: { navigateByUrl } },
        { provide: StartupGate, useValue: { hold: () => () => undefined } },
        {
          provide: PushNotificationsService,
          useValue: { init: () => Promise.resolve(), rotate: vi.fn() },
        },
      ],
    });
    const service = TestBed.inject(AuthService);
    const session = TestBed.inject(SessionStore);
    const httpMock = TestBed.inject(HttpTestingController);
    persistToken('tok-A');

    await service.restoreSession();
    const pending = httpMock.expectOne(`${BASE}/api/users/current`);
    expect(pending.request.headers.get('Authorization')).toBe('Bearer tok-A');
    return { session, httpMock, pending };
  }

  const unauthorized = { errors: ['unauthorized'] };

  it('ends the session and goes home when the rejected token is still the signed-in one', async () => {
    const { session, httpMock, pending } = await startRestoreOfA();

    pending.flush(unauthorized, { status: 401, statusText: 'Unauthorized' });
    await settle();

    expect(session.accessToken()).toBeNull();
    expect(session.readPersistedToken()).toBeNull();
    expect(session.readPersistedUser()).toBeNull();
    expect(navigateByUrl).toHaveBeenCalledWith('/');
    httpMock.verify();
  });

  it('keeps a different account seated when the replaced account\'s token is rejected with 401', async () => {
    const { session, httpMock, pending } = await startRestoreOfA();

    session.setSession(userB, 'tok-B');
    pending.flush({ errors: ['unauthorized'] }, { status: 401, statusText: 'Unauthorized' });
    await settle();

    expect(session.accessToken()).toBe('tok-B');
    expect(session.user()?.id).toBe('9');
    expect(session.readPersistedToken()).toBe('tok-B');
    expect(session.readPersistedUser()?.id).toBe('9');
    expect(navigateByUrl).not.toHaveBeenCalled();
    httpMock.verify();
  });
});
