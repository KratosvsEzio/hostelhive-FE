import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import {
  AccountConfirmedNotSignedIn,
  AuthService,
  SessionStore,
  SessionUser,
} from '@core/auth';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { ConfirmInvitation } from './confirm-invitation';

const TOKEN_COOKIE = 'hh_auth_token';
const USER_KEY = 'hh.auth.user';

const userA: SessionUser = {
  id: '7',
  name: 'Ayesha',
  email: 'ayesha@h.pk',
  role: 'seeker',
  allRoles: ['seeker'],
  permissions: [],
};

const API_URL = 'http://localhost/api/user/confirm_invitation';

/** The spec renders translation keys as-is, so assertions read the key, not today's English. */
const KEY = {
  confirming: 'authConfirmInvitation.confirmingYourAccount',
  failed: 'authConfirmInvitation.confirmationFailed',
  confirmed: 'authConfirmInvitation.yourAccountIsConfirmed',
  logIn: 'authConfirmInvitation.pleaseLogInToContinue',
  stillSignedIn: 'authConfirmInvitation.stillSignedInAs',
  goToLogIn: 'authConfirmInvitation.goToLogIn',
  backToHome: 'common.backToHome',
  cannotReach: 'authConfirmInvitation.cannotReachTheServer',
  invalid: 'authConfirmInvitation.linkIsInvalidOrExpired',
  missingToken: 'authConfirmInvitation.linkIsMissingItsToken',
};

function render(
  confirmInvitation: (token: string) => Observable<SessionUser>,
  token: string | null = 'abc123',
) {
  const confirm = vi.fn(confirmInvitation);
  TestBed.configureTestingModule({
    imports: [ConfirmInvitation],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: AuthService, useValue: { confirmInvitation: confirm } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: {
              get: (name: string) => (name === 'token' ? token : null),
            },
          },
        },
      },
    ],
  });
  const navigate = vi
    .spyOn(TestBed.inject(Router), 'navigateByUrl')
    .mockResolvedValue(true);
  const fixture = TestBed.createComponent(ConfirmInvitation);
  return { fixture, confirm, navigate };
}

/** Runs the first render, which is what fires the browser-only confirm call, then re-renders. */
async function settle(fixture: ReturnType<typeof render>['fixture']) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function text(fixture: ReturnType<typeof render>['fixture']): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function link(
  fixture: ReturnType<typeof render>['fixture'],
  label: string,
): HTMLAnchorElement | undefined {
  const anchors = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('a'),
  );
  return anchors.find((a) => a.textContent?.includes(label));
}

describe('ConfirmInvitation', () => {
  afterEach(() => {
    TestBed.inject(SessionStore).clear();
    document.cookie = `${TOKEN_COOKIE}=; Max-Age=0; path=/`;
    localStorage.removeItem(USER_KEY);
    TestBed.resetTestingModule();
  });

  it('shows the missing-token message and never calls the server when the link has no token', async () => {
    const { fixture, confirm } = render(() => of(userA), null);
    await settle(fixture);

    expect(text(fixture)).toContain(KEY.failed);
    expect(text(fixture)).toContain(KEY.missingToken);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('tells the visitor the server is unreachable when the exchange fails with status 0', async () => {
    const { fixture, confirm } = render(() =>
      throwError(() => ({ status: 0, message: 'Unknown Error' })),
    );
    await settle(fixture);

    expect(confirm).toHaveBeenCalledExactlyOnceWith('abc123');
    expect(text(fixture)).toContain(KEY.failed);
    expect(text(fixture)).toContain(KEY.cannotReach);
    expect(text(fixture)).not.toContain(KEY.invalid);
  });

  it.each([403, 500])(
    'shows the generic invalid-link message and leaks no API URL when the exchange fails with %i',
    async (status) => {
      const { fixture } = render(() =>
        throwError(() => ({
          status,
          message: `Http failure response for ${API_URL}: ${status}`,
        })),
      );
      await settle(fixture);

      const shown = text(fixture);
      expect(shown).toContain(KEY.invalid);
      expect(shown).not.toContain(API_URL);
      expect(shown).not.toContain('/api/');
      expect(shown).not.toContain('Http failure');
    },
  );

  it('shows the invalid-link message, not the developer string, when the exchange returns no token', async () => {
    const { fixture } = render(() =>
      throwError(() => new Error('Auth response did not include a token.')),
    );
    await settle(fixture);

    expect(text(fixture)).toContain(KEY.invalid);
    expect(text(fixture)).not.toContain('did not include a token');
  });

  it('offers log in, not an error, when the account is confirmed and nobody is signed in', async () => {
    const { fixture } = render(() =>
      throwError(() => new AccountConfirmedNotSignedIn({ status: 0 })),
    );
    await settle(fixture);

    const shown = text(fixture);
    expect(shown).toContain(KEY.confirmed);
    expect(shown).toContain(KEY.logIn);
    expect(shown).not.toContain(KEY.failed);
    expect(shown).not.toContain(KEY.stillSignedIn);

    const goToLogIn = link(fixture, KEY.goToLogIn);
    expect(goToLogIn).toBeDefined();
    expect(goToLogIn?.getAttribute('href')).toContain('/auth?mode=login');
  });

  it('keeps the restored account signed in and offers home, not log in, after a failed sign-in', async () => {
    const { fixture } = render(() =>
      throwError(() => new AccountConfirmedNotSignedIn({ status: 0 })),
    );
    TestBed.inject(TranslocoService).setTranslation(
      {
        authConfirmInvitation: {
          stillSignedInAs: "You're still signed in as {{name}}.",
        },
      },
      'en',
    );
    TestBed.inject(SessionStore).setSession(userA, 'a-token');
    await settle(fixture);

    const shown = text(fixture);
    expect(shown).toContain(KEY.confirmed);
    expect(shown).toContain("You're still signed in as Ayesha.");
    expect(shown).not.toContain(KEY.failed);
    expect(shown).not.toContain(KEY.logIn);
    expect(link(fixture, KEY.goToLogIn)).toBeUndefined();

    const home = link(fixture, KEY.backToHome);
    expect(home).toBeDefined();
    // The locale link prefixes the active language, so home renders as "/" or "/en".
    expect(new URL(home?.href ?? '', 'http://localhost').pathname).toMatch(/^\/([a-z]{2})?\/?$/);
  });

  it('navigates home and shows neither an error nor the confirmed state when sign-in succeeds', async () => {
    const { fixture, confirm, navigate } = render(() => of(userA));
    await settle(fixture);

    expect(confirm).toHaveBeenCalledExactlyOnceWith('abc123');
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/');
    const shown = text(fixture);
    expect(shown).toContain(KEY.confirming);
    expect(shown).not.toContain(KEY.failed);
    expect(shown).not.toContain(KEY.confirmed);
  });

  it.each([undefined, null, 'boom', 42])(
    'falls back to the invalid-link message without throwing when the rejection is %j',
    async (rejection) => {
      const { fixture } = render(() => throwError(() => rejection));
      await expect(settle(fixture)).resolves.toBeUndefined();

      expect(text(fixture)).toContain(KEY.failed);
      expect(text(fixture)).toContain(KEY.invalid);
    },
  );
});
