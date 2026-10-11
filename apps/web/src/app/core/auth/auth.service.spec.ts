import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ApiError, CurrentUser } from '@hostelhive/data-access';
import { AuthApi } from '@services';
import { PushNotificationsService } from '@core/push-notifications';
import { StartupGate } from '@core/startup-gate';
import { defer, firstValueFrom, of, throwError } from 'rxjs';
import { AccountConfirmedNotSignedIn, AuthService } from './auth.service';
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
  const rotate = vi.fn();
  const navigateByUrl = vi.fn();

  beforeEach(() => {
    clearPersistence();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthApi,
          useValue: { currentUser, signIn, confirmInvitation },
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
