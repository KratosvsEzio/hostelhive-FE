import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { NEVER, Observable, Subject, of, throwError } from 'rxjs';
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
  askTitle: 'authConfirmInvitation.alreadySignedInTitle',
  anotherAccount: 'authConfirmInvitation.signedInToAnotherAccount',
  stillWorksLater: 'authConfirmInvitation.linkStillWorksLater',
  logOutAndContinue: 'authConfirmInvitation.logOutAndContinue',
  staySignedIn: 'authConfirmInvitation.staySignedIn',
};

/** Unicode isolates the page wraps around the signed-in account's label. */
const FSI = '⁨';
const PDI = '⁩';

/** Builds an unsigned JWT with a real base64url payload; only the payload is ever read. */
function jwt(claims: Record<string, unknown>): string {
  const b64url = (o: unknown): string =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.sig`;
}

function render(
  confirmInvitation: (token: string) => Observable<SessionUser>,
  token: string | null = 'abc123',
  signOutThenConfirmInvitation: (token: string) => Observable<SessionUser> = () =>
    of(userA),
) {
  const confirm = vi.fn(confirmInvitation);
  const signOutThen = vi.fn(signOutThenConfirmInvitation);
  TestBed.configureTestingModule({
    imports: [ConfirmInvitation],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      {
        provide: AuthService,
        useValue: {
          confirmInvitation: confirm,
          signOutThenConfirmInvitation: signOutThen,
        },
      },
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
  return { fixture, confirm, signOutThen, navigate };
}

/** Runs the first render, which is what fires the browser-only confirm call, then re-renders. */
async function settle(fixture: ReturnType<typeof render>['fixture']) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Lets effects and any pending re-render run after the session or phase changed. */
async function flush(fixture: ReturnType<typeof render>['fixture']) {
  fixture.detectChanges();
  await fixture.whenStable();
  TestBed.tick();
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

function button(
  fixture: ReturnType<typeof render>['fixture'],
  label: string,
): HTMLButtonElement | undefined {
  const buttons = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
  );
  return buttons.find((b) => b.textContent?.includes(label));
}

/** What the visually hidden live region currently says. */
function statusText(fixture: ReturnType<typeof render>['fixture']): string {
  const region = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');
  return region?.textContent?.trim() ?? '';
}

/** Gives the account sentence a real template so the isolates around the label can be read. */
function translateAskSentence(): void {
  TestBed.inject(TranslocoService).setTranslation(
    { authConfirmInvitation: { signedInAsAccount: 'Signed in as {{account}}.' } },
    'en',
  );
}

describe('ConfirmInvitation', () => {
  let attached: HTMLElement | null = null;

  afterEach(() => {
    attached?.remove();
    attached = null;
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
    // Nobody is signed in at render; the exchange seats the previous account, then fails.
    const { fixture, confirm } = render(() => {
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      return throwError(() => new AccountConfirmedNotSignedIn({ status: 0 }));
    });
    TestBed.inject(TranslocoService).setTranslation(
      {
        authConfirmInvitation: {
          stillSignedInAs: "You're still signed in as {{name}}.",
        },
      },
      'en',
    );
    await settle(fixture);

    expect(confirm).toHaveBeenCalledExactlyOnceWith('abc123');
    const shown = text(fixture);
    expect(shown).not.toContain(KEY.askTitle);
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
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/', { replaceUrl: true });
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

  describe('when someone is already signed in', () => {
    it('shows the missing-token error and does not ask when the link has no token', async () => {
      const { fixture, confirm, signOutThen } = render(() => of(userA), null);
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      await settle(fixture);

      const shown = text(fixture);
      expect(shown).toContain(KEY.failed);
      expect(shown).toContain(KEY.missingToken);
      expect(shown).not.toContain(KEY.askTitle);
      expect(confirm).not.toHaveBeenCalled();
      expect(signOutThen).not.toHaveBeenCalled();
    });

    it('confirms straight away and does not ask when nobody is signed in', async () => {
      const { fixture, confirm, signOutThen } = render(() => of(userA));
      await settle(fixture);

      expect(confirm).toHaveBeenCalledExactlyOnceWith('abc123');
      expect(signOutThen).not.toHaveBeenCalled();
      expect(text(fixture)).not.toContain(KEY.askTitle);
    });

    it('asks before spending the link, naming the signed-in account with its email', async () => {
      const { fixture } = render(() => of(userA));
      translateAskSentence();
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      await settle(fixture);

      const shown = text(fixture);
      expect(shown).toContain(KEY.askTitle);
      expect(shown).toContain(`Signed in as ${FSI}Ayesha (ayesha@h.pk)${PDI}.`);
      expect(shown).toContain(KEY.stillWorksLater);
      expect(button(fixture, KEY.logOutAndContinue)).toBeDefined();
      expect(button(fixture, KEY.staySignedIn)).toBeDefined();
    });

    it('sends nothing and navigates nowhere while the question is showing', async () => {
      const { fixture, confirm, signOutThen, navigate } = render(() => of(userA));
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      await settle(fixture);

      expect(text(fixture)).toContain(KEY.askTitle);
      expect(confirm).not.toHaveBeenCalled();
      expect(signOutThen).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it.each([
      { known: 'only an email', user: { ...userA, name: '' }, label: 'ayesha@h.pk' },
      { known: 'only a name', user: { ...userA, email: '' }, label: 'Ayesha' },
    ])(
      'names the account by $label alone when the cached user has $known',
      async ({ user, label }) => {
        const { fixture } = render(() => of(userA));
        translateAskSentence();
        TestBed.inject(SessionStore).setSession(user, 'a-token');
        await settle(fixture);

        const shown = text(fixture);
        expect(shown).toContain(`Signed in as ${FSI}${label}${PDI}.`);
        expect(shown).not.toContain('(');
      },
    );

    it('names a token-only session from the name and email inside its JWT', async () => {
      const { fixture } = render(() => of(userA));
      translateAskSentence();
      TestBed.inject(SessionStore).setAccessToken(
        jwt({ name: 'Bilal', email: 'bilal@h.pk' }),
      );
      await settle(fixture);

      expect(text(fixture)).toContain(`Signed in as ${FSI}Bilal (bilal@h.pk)${PDI}.`);
    });

    it('names a token-only session from the user cached in storage', async () => {
      const { fixture } = render(() => of(userA));
      translateAskSentence();
      localStorage.setItem(USER_KEY, JSON.stringify(userA));
      TestBed.inject(SessionStore).setAccessToken('opaque-token');
      await settle(fixture);

      expect(text(fixture)).toContain(`Signed in as ${FSI}Ayesha (ayesha@h.pk)${PDI}.`);
    });

    it('asks with the generic sentence when the account cannot be named', async () => {
      const { fixture, confirm } = render(() => of(userA));
      TestBed.inject(SessionStore).setAccessToken('opaque-token');
      await settle(fixture);

      const shown = text(fixture);
      expect(shown).toContain(KEY.askTitle);
      expect(shown).toContain(KEY.anotherAccount);
      expect(button(fixture, KEY.logOutAndContinue)).toBeDefined();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('signs out then confirms once on Continue, even on a double click, and lands home', async () => {
      const exchange = new Subject<SessionUser>();
      const { fixture, confirm, signOutThen, navigate } = render(
        () => of(userA),
        'abc123',
        () => exchange,
      );
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      await settle(fixture);

      const continueButton = button(fixture, KEY.logOutAndContinue);
      continueButton?.click();
      continueButton?.click();
      fixture.detectChanges();

      expect(signOutThen).toHaveBeenCalledExactlyOnceWith('abc123');
      expect(confirm).not.toHaveBeenCalled();
      expect(text(fixture)).toContain(KEY.confirming);
      expect(text(fixture)).not.toContain(KEY.askTitle);
      expect(navigate).not.toHaveBeenCalled();

      exchange.next(userA);
      exchange.complete();

      expect(navigate).toHaveBeenCalledExactlyOnceWith('/', { replaceUrl: true });
    });

    it('offers log in, not the old account, when Continue confirms but sign-in does not finish', async () => {
      const { fixture } = render(
        () => of(userA),
        'abc123',
        () => {
          TestBed.inject(SessionStore).clear();
          return throwError(() => new AccountConfirmedNotSignedIn({ status: 0 }));
        },
      );
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      await settle(fixture);

      button(fixture, KEY.logOutAndContinue)?.click();
      await flush(fixture);

      const shown = text(fixture);
      expect(shown).toContain(KEY.confirmed);
      expect(shown).toContain(KEY.logIn);
      expect(shown).not.toContain(KEY.stillSignedIn);
      expect(link(fixture, KEY.goToLogIn)).toBeDefined();
    });

    it.each([
      { failure: 'a server error', rejection: { status: 500, message: 'boom' } },
      {
        failure: 'a response without a token',
        rejection: new Error('Auth response did not include a token.'),
      },
    ])(
      'shows the error copy, not the confirmed state, when Continue fails with $failure',
      async ({ rejection }) => {
        const { fixture } = render(
          () => of(userA),
          'abc123',
          () => throwError(() => rejection),
        );
        TestBed.inject(SessionStore).setSession(userA, 'a-token');
        await settle(fixture);

        button(fixture, KEY.logOutAndContinue)?.click();
        await flush(fixture);

        const shown = text(fixture);
        expect(shown).toContain(KEY.failed);
        expect(shown).toContain(KEY.invalid);
        expect(shown).not.toContain(KEY.confirmed);
      },
    );

    it('goes home without sending anything on Stay, even on a double click', async () => {
      const { fixture, confirm, signOutThen, navigate } = render(() => of(userA));
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      await settle(fixture);

      const stay = button(fixture, KEY.staySignedIn);
      stay?.click();
      stay?.click();
      fixture.detectChanges();

      expect(navigate).toHaveBeenCalledExactlyOnceWith('/');
      expect(confirm).not.toHaveBeenCalled();
      expect(signOutThen).not.toHaveBeenCalled();
    });

    it('carries on confirming, once, when the session ends by itself while asking', async () => {
      const { fixture, confirm, signOutThen } = render(() => of(userA));
      const session = TestBed.inject(SessionStore);
      session.setSession(userA, 'a-token');
      await settle(fixture);
      expect(confirm).not.toHaveBeenCalled();

      session.clear();
      await flush(fixture);
      await flush(fixture);

      expect(confirm).toHaveBeenCalledExactlyOnceWith('abc123');
      expect(signOutThen).not.toHaveBeenCalled();
    });

    it('does not confirm a second time when the session clears because Continue signed out', async () => {
      const { fixture, confirm, signOutThen } = render(
        () => of(userA),
        'abc123',
        () => {
          TestBed.inject(SessionStore).clear();
          return NEVER;
        },
      );
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      await settle(fixture);

      button(fixture, KEY.logOutAndContinue)?.click();
      await flush(fixture);

      expect(signOutThen).toHaveBeenCalledExactlyOnceWith('abc123');
      expect(confirm).not.toHaveBeenCalled();
    });

    it('does not confirm when the session clears after Stay was pressed', async () => {
      const { fixture, confirm } = render(() => of(userA));
      const session = TestBed.inject(SessionStore);
      session.setSession(userA, 'a-token');
      await settle(fixture);

      button(fixture, KEY.staySignedIn)?.click();
      session.clear();
      await flush(fixture);

      expect(confirm).not.toHaveBeenCalled();
    });

    it('keeps the status region empty on a plain first load while the confirmation is pending', async () => {
      const { fixture } = render(() => NEVER);
      await settle(fixture);

      expect(text(fixture)).toContain(KEY.confirming);
      expect(statusText(fixture)).toBe('');
    });

    it('keeps the status region empty on the question, then announces the confirmation after Continue', async () => {
      const { fixture } = render(
        () => of(userA),
        'abc123',
        () => NEVER,
      );
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      await settle(fixture);

      expect(text(fixture)).toContain(KEY.askTitle);
      expect(statusText(fixture)).toBe('');
      // The region must already exist before the announcement, or screen readers miss it.
      const before = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');
      expect(before).not.toBeNull();

      button(fixture, KEY.logOutAndContinue)?.click();
      await flush(fixture);

      const after = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');
      expect(after).toBe(before);
      expect(statusText(fixture)).toBe(KEY.confirming);
    });

    it('keeps the status region empty after Stay', async () => {
      const { fixture } = render(() => of(userA));
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      await settle(fixture);

      button(fixture, KEY.staySignedIn)?.click();
      await flush(fixture);

      expect(statusText(fixture)).toBe('');
    });

    it('describes the question heading by both body paragraphs', async () => {
      const { fixture } = render(() => of(userA));
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      await settle(fixture);

      const root = fixture.nativeElement as HTMLElement;
      const ids = (root.querySelector('h1')?.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .filter(Boolean);
      expect(ids).toEqual(['confirm-asking-account', 'confirm-asking-later']);
      for (const id of ids) {
        expect(root.querySelector(`p#${id}`)).not.toBeNull();
      }
    });

    it('moves focus to the heading, not a button, when the question appears', async () => {
      const { fixture } = render(() => of(userA));
      const root = fixture.nativeElement as HTMLElement;
      if (!root.isConnected) document.body.appendChild(root);
      attached = root;
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      await settle(fixture);
      await flush(fixture);

      const heading = root.querySelector('h1');
      expect(heading).not.toBeNull();
      expect(document.activeElement).toBe(heading);
      expect(document.activeElement?.tagName).not.toBe('BUTTON');
    });
  });
});
