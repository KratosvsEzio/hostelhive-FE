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
  usedTitle: 'authConfirmInvitation.linkInvalidOrUsedTitle',
  used: 'authConfirmInvitation.linkIsInvalidOrUsed',
  expiredTitle: 'authConfirmInvitation.linkExpiredTitle',
  expired: 'authConfirmInvitation.linkHasExpired',
  contactUs: 'common.contactUs',
};

/** What the backend says for a used or unknown token, and for an expired one. */
const USED_TEXT = 'This confirmation link is invalid or has already been used';
const EXPIRED_TEXT = 'This confirmation link has expired';

/** An error shaped the way the error interceptor rethrows it, with the backend's own messages. */
function apiError(status: number, serverMessages?: readonly string[]) {
  return {
    status,
    code: 'unknown_error',
    message: serverMessages?.join(' ') ?? `Http failure response for ${API_URL}: ${status}`,
    serverMessages,
    method: 'POST',
  };
}

const FAILURES = [
  {
    case: 'a used or unknown link (404)',
    rejection: apiError(404, [USED_TEXT]),
    serverText: USED_TEXT,
    title: KEY.usedTitle,
    message: KEY.used,
    badge: { tone: 'bg-tint-sky', icon: 'ti-link-off' },
    contactUs: false,
  },
  {
    case: 'an expired link (403)',
    rejection: apiError(403, [EXPIRED_TEXT]),
    serverText: EXPIRED_TEXT,
    title: KEY.expiredTitle,
    message: KEY.expired,
    badge: { tone: 'bg-danger/10', icon: 'ti-link-off' },
    contactUs: true,
  },
];

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

/** The labels of every link on the page, in document order. */
function linkLabels(fixture: ReturnType<typeof render>['fixture']): string[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map(
    (a) => a.textContent?.trim() ?? '',
  );
}

/** The error card's round badge and the icon inside it. */
function badge(fixture: ReturnType<typeof render>['fixture']) {
  const span = (fixture.nativeElement as HTMLElement).querySelector('h1')?.previousElementSibling;
  return { span, icon: span?.querySelector('i') };
}

/** Puts the fixture in the document, so focus can land on it. */
function attach(fixture: ReturnType<typeof render>['fixture']): HTMLElement {
  const root = fixture.nativeElement as HTMLElement;
  if (!root.isConnected) document.body.appendChild(root);
  return root;
}

/** Asserts the error card for one failure: heading, message, badge and links. */
function expectFailureCard(
  fixture: ReturnType<typeof render>['fixture'],
  failure: (typeof FAILURES)[number],
): void {
  const shown = text(fixture);
  expect(shown).toContain(failure.title);
  expect(shown).toContain(failure.message);
  expect(shown).not.toContain(KEY.failed);
  expect(shown).not.toContain(KEY.invalid);
  expect(shown).not.toContain(KEY.confirmed);

  const { span, icon } = badge(fixture);
  expect(span?.classList).toContain(failure.badge.tone);
  expect(icon?.classList).toContain(failure.badge.icon);

  const expected = failure.contactUs
    ? [KEY.goToLogIn, KEY.contactUs, KEY.backToHome]
    : [KEY.goToLogIn, KEY.backToHome];
  expect(linkLabels(fixture)).toEqual(expected);
  expect(link(fixture, KEY.goToLogIn)?.getAttribute('href')).toContain('/auth?mode=login');
  if (failure.contactUs) {
    const contact = link(fixture, KEY.contactUs);
    // The locale link prefixes the active language, so this renders as "/contact" or "/en/contact".
    expect(new URL(contact?.href ?? '', 'http://localhost').pathname).toMatch(
      /^(\/[a-z]{2})?\/contact$/,
    );
  }
}

/** Asserts the warning badge and only Go to log in and Back to home, as for any generic failure. */
function expectGenericCard(fixture: ReturnType<typeof render>['fixture']): void {
  const { span, icon } = badge(fixture);
  expect(span?.classList).toContain('bg-danger/10');
  expect(icon?.classList).toContain('ti-alert-triangle');
  expect(linkLabels(fixture)).toEqual([KEY.goToLogIn, KEY.backToHome]);
}

/** Asserts nothing the server or the HTTP client wrote reached the page. */
function expectNoServerText(fixture: ReturnType<typeof render>['fixture'], serverText?: string): void {
  const shown = text(fixture);
  if (serverText) expect(shown).not.toContain(serverText);
  expect(shown).not.toContain(API_URL);
  expect(shown).not.toContain('/api/');
  expect(shown).not.toContain('Http failure');
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
      expect(shown).toContain(KEY.failed);
      expect(shown).toContain(KEY.invalid);
      expect(shown).not.toContain(KEY.usedTitle);
      expect(shown).not.toContain(KEY.expiredTitle);
      expect(link(fixture, KEY.contactUs)).toBeUndefined();
      expectNoServerText(fixture);
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

  describe('when the server turns the link down', () => {
    it.each(FAILURES)('says so for $case on first load', async (failure) => {
      const { fixture, confirm } = render(() => throwError(() => failure.rejection));
      await settle(fixture);

      expect(confirm).toHaveBeenCalledExactlyOnceWith('abc123');
      expectFailureCard(fixture, failure);
      expectNoServerText(fixture, failure.serverText);
    });

    it.each(FAILURES)('says so for $case after Log out and continue', async (failure) => {
      const { fixture, signOutThen } = render(
        () => of(userA),
        'abc123',
        () => throwError(() => failure.rejection),
      );
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      await settle(fixture);

      button(fixture, KEY.logOutAndContinue)?.click();
      await flush(fixture);

      expect(signOutThen).toHaveBeenCalledExactlyOnceWith('abc123');
      expectFailureCard(fixture, failure);
      expectNoServerText(fixture, failure.serverText);
    });

    it.each([
      { case: 'a bare Rails "Not Found" 404', serverText: 'Not Found' },
      { case: 'a 404 without an envelope', status: 404 },
      {
        case: 'a 403 that refuses sign-in rather than the link',
        status: 403,
        serverText: 'User have no roles and not allowed to sign in',
      },
      { case: 'a 500 that mentions expiry', status: 500, serverText: EXPIRED_TEXT },
    ])('keeps the generic message for $case', async ({ status = 404, serverText }) => {
      const rejection = apiError(status, serverText ? [serverText] : undefined);
      const { fixture } = render(() => throwError(() => rejection));
      await settle(fixture);

      const shown = text(fixture);
      expect(shown).toContain(KEY.failed);
      expect(shown).toContain(KEY.invalid);
      expect(shown).not.toContain(KEY.usedTitle);
      expect(shown).not.toContain(KEY.expiredTitle);
      expectGenericCard(fixture);
      expectNoServerText(fixture, serverText);
    });

    it.each(FAILURES)(
      'says so for $case when the session ends by itself while asking',
      async (failure) => {
        const { fixture, confirm, signOutThen } = render(() => throwError(() => failure.rejection));
        attached = attach(fixture);
        const session = TestBed.inject(SessionStore);
        session.setSession(userA, 'a-token');
        await settle(fixture);
        expect(text(fixture)).toContain(KEY.askTitle);

        session.clear();
        await flush(fixture);
        await flush(fixture);

        expect(confirm).toHaveBeenCalledExactlyOnceWith('abc123');
        expect(signOutThen).not.toHaveBeenCalled();
        expectFailureCard(fixture, failure);
        expectNoServerText(fixture, failure.serverText);
        expect(document.activeElement).toBe(attached.querySelector('h1'));
      },
    );

    it('says the account is confirmed, not that the link expired, when signing in fails with an expired 403', async () => {
      const { fixture } = render(() =>
        throwError(() => new AccountConfirmedNotSignedIn(apiError(403, [EXPIRED_TEXT]))),
      );
      await settle(fixture);

      const shown = text(fixture);
      expect(shown).toContain(KEY.confirmed);
      expect(shown).toContain(KEY.logIn);
      expect(shown).not.toContain(KEY.expiredTitle);
      expect(shown).not.toContain(KEY.expired);
      expect(shown).not.toContain(KEY.failed);
    });

    it('describes the error heading by the message under it', async () => {
      const { fixture } = render(() => throwError(() => apiError(404, [USED_TEXT])));
      await settle(fixture);

      const root = fixture.nativeElement as HTMLElement;
      const id = root.querySelector('h1')?.getAttribute('aria-describedby');
      expect(id).toBe('confirm-error-message');
      expect(root.querySelector(`p#${id}`)?.textContent).toContain(KEY.used);
    });

    it('moves focus to the error heading when a used link fails on first load', async () => {
      const { fixture } = render(() => throwError(() => apiError(404, [USED_TEXT])));
      attached = attach(fixture);
      await settle(fixture);
      await flush(fixture);

      const heading = attached.querySelector('h1');
      expect(heading?.textContent).toContain(KEY.usedTitle);
      expect(document.activeElement).toBe(heading);
    });

    it('does not pull focus back to the error heading on a later re-render', async () => {
      const { fixture } = render(() => throwError(() => apiError(404, [USED_TEXT])));
      const transloco = TestBed.inject(TranslocoService);
      // As the app is configured: a language switch re-renders every translated string.
      transloco.config.reRenderOnLangChange = true;
      attached = attach(fixture);
      await settle(fixture);
      await flush(fixture);
      expect(document.activeElement).toBe(attached.querySelector('h1'));

      const goToLogIn = link(fixture, KEY.goToLogIn);
      goToLogIn?.focus();
      expect(document.activeElement).toBe(goToLogIn);

      transloco.setTranslation(
        { authConfirmInvitation: { linkInvalidOrUsedTitle: 'Dieser Link funktioniert nicht mehr' } },
        'de',
      );
      transloco.setActiveLang('de');
      await flush(fixture);
      await flush(fixture);

      // The heading's text changed, so the page did render again.
      expect(attached.querySelector('h1')?.textContent).toContain('Dieser Link funktioniert nicht mehr');
      expect(document.activeElement).toBe(goToLogIn);
    });

    it('moves focus from the question to the error heading when Continue hits an expired link', async () => {
      const { fixture } = render(
        () => of(userA),
        'abc123',
        () => throwError(() => apiError(403, [EXPIRED_TEXT])),
      );
      attached = attach(fixture);
      TestBed.inject(SessionStore).setSession(userA, 'a-token');
      await settle(fixture);
      await flush(fixture);

      button(fixture, KEY.logOutAndContinue)?.click();
      await flush(fixture);

      const heading = attached.querySelector('h1');
      expect(heading?.textContent).toContain(KEY.expiredTitle);
      expect(document.activeElement).toBe(heading);
    });

    it('moves focus to the error heading when the server cannot be reached', async () => {
      const { fixture } = render(() => throwError(() => apiError(0)));
      attached = attach(fixture);
      await settle(fixture);
      await flush(fixture);

      const heading = attached.querySelector('h1');
      expect(text(fixture)).toContain(KEY.cannotReach);
      expect(text(fixture)).toContain(KEY.failed);
      expectGenericCard(fixture);
      expect(document.activeElement).toBe(heading);
    });

    it('leaves focus alone when the link has no token', async () => {
      const { fixture } = render(() => of(userA), null);
      attached = attach(fixture);
      await settle(fixture);
      await flush(fixture);

      const heading = attached.querySelector('h1');
      expect(text(fixture)).toContain(KEY.missingToken);
      expect(text(fixture)).toContain(KEY.failed);
      expectGenericCard(fixture);
      expect(heading).not.toBeNull();
      expect(document.activeElement).not.toBe(heading);
    });
  });
});
