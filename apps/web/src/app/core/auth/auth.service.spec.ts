import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ApiError } from '@hostelhive/data-access';
import { AuthApi } from '@services';
import { PushNotificationsService } from '@core/push-notifications';
import { StartupGate } from '@core/startup-gate';
import { of, throwError } from 'rxjs';
import { AuthService } from './auth.service';
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
  const navigateByUrl = vi.fn();

  beforeEach(() => {
    clearPersistence();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthApi, useValue: { currentUser, signIn } },
        { provide: Router, useValue: { navigateByUrl } },
        { provide: StartupGate, useValue: { hold: () => () => undefined } },
        {
          provide: PushNotificationsService,
          useValue: {
            init: () => Promise.resolve(),
            rotate: () => Promise.resolve(),
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

    it('keeps the new token seated when the current-user lookup fails with status 0', async () => {
      signIn.mockReturnValue(of(TOKEN));
      currentUser.mockReturnValue(throwError(() => apiError(0)));

      service.signIn('ayesha@h.pk', 'secret').subscribe();
      await settle();

      expect(currentUser).toHaveBeenCalled();
      expect(session.accessToken()).toBe(TOKEN);
    });
  });
});
