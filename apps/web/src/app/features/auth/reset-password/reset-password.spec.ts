import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, NEVER, Observable, of, Subject, throwError } from 'rxjs';
import { ApiError, MessageResponse, ResetPasswordRequest } from '@hostelhive/data-access';
import { AuthApi } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { ResetPassword } from './reset-password';

const API_URL = 'http://localhost/api/user/reset_password';
const VALID_PASSWORD = 'Secret123';

const SERVER_TEXT = {
  invalid: 'This reset link is invalid or has already been used',
  expired: 'This reset link has expired',
  notResettable: "This account's password can't be reset with a link",
  blank: "New password can't be blank",
};

/** The spec renders translation keys as-is, so assertions read the key, not today's English. */
const KEY = {
  formTitle: 'authResetPassword.setANewPassword',
  missingTitle: 'authResetPassword.invalidResetLink',
  missingBody: 'authResetPassword.thisPasswordResetLinkIs',
  invalidTitle: 'authResetPassword.linkInvalidTitle',
  invalidBody: 'authResetPassword.linkInvalidBody',
  expiredTitle: 'authResetPassword.linkExpiredTitle',
  expiredBody: 'authResetPassword.linkExpiredBody',
  notResettableTitle: 'authResetPassword.accountNotResettableTitle',
  notResettableBody: 'authResetPassword.accountNotResettableBody',
  requestNewLink: 'authResetPassword.requestNewLink',
  contactUs: 'common.contactUs',
  backToLogin: 'authForgotPassword.backToLogin',
  passwordRejected: 'authResetPassword.passwordRejected',
  cannotReach: 'authResetPassword.cannotReachTheServer',
  somethingWentWrong: 'authResetPassword.somethingWentWrong',
  passwordRule: 'authResetPassword.min8Characters1Uppercase',
  confirmPassword: 'authResetPassword.confirmYourNewPassword',
  mismatch: 'authResetPassword.passwordsDoNotMatch',
  done: 'authResetPassword.passwordReset',
};

/** An error shaped the way the error interceptor rethrows it, server text in `message` too. */
function apiError(status: number, serverMessages?: string[]): ApiError {
  return {
    status,
    code: status === 0 ? 'network_error' : 'unknown_error',
    message: serverMessages?.join(' ') ?? `Http failure response for ${API_URL}: ${status}`,
    serverMessages,
    method: 'PATCH',
  };
}

function render(
  resetPassword: (body: ResetPasswordRequest) => Observable<MessageResponse>,
  token: string | null = 'abc123',
) {
  const reset = vi.fn(resetPassword);
  const queryParamMap = new BehaviorSubject<ParamMap>(
    convertToParamMap(token === null ? {} : { token }),
  );
  TestBed.configureTestingModule({
    imports: [ResetPassword],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: AuthApi, useValue: { resetPassword: reset } },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap,
          snapshot: { queryParamMap: queryParamMap.value },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ResetPassword);
  return { fixture, reset, queryParamMap };
}

type Fixture = ReturnType<typeof render>['fixture'];

async function settle(fixture: Fixture): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  TestBed.tick();
  fixture.detectChanges();
}

function root(fixture: Fixture): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: Fixture): string {
  return root(fixture).textContent ?? '';
}

function link(fixture: Fixture, label: string): HTMLAnchorElement | undefined {
  return Array.from(root(fixture).querySelectorAll('a')).find((a) =>
    a.textContent?.includes(label),
  );
}

function alertText(fixture: Fixture): string {
  return root(fixture).querySelector('[role="alert"]')?.textContent?.trim() ?? '';
}

/** The text of each password field, its error included, in page order. */
function fieldTexts(fixture: Fixture): string[] {
  return Array.from(root(fixture).querySelectorAll('hh-input')).map(
    (input) => input.textContent ?? '',
  );
}

function passwordValues(fixture: Fixture): string[] {
  return Array.from(
    root(fixture).querySelectorAll<HTMLInputElement>('input[type="password"]'),
  ).map((input) => input.value);
}

function submitButton(fixture: Fixture): HTMLButtonElement | null {
  return root(fixture).querySelector('button[type="submit"]');
}

function form(fixture: Fixture): HTMLFormElement | null {
  return root(fixture).querySelector('form');
}

async function fillAndSubmit(
  fixture: Fixture,
  password = VALID_PASSWORD,
  confirmation = password,
): Promise<void> {
  const [newInput, confirmInput] = Array.from(
    root(fixture).querySelectorAll<HTMLInputElement>('input[type="password"]'),
  );
  newInput.value = password;
  newInput.dispatchEvent(new Event('input'));
  confirmInput.value = confirmation;
  confirmInput.dispatchEvent(new Event('input'));
  await settle(fixture);
  form(fixture)?.dispatchEvent(new Event('submit', { cancelable: true }));
  await settle(fixture);
}

describe('ResetPassword', () => {
  let attached: HTMLElement | null = null;

  afterEach(() => {
    attached?.remove();
    attached = null;
    TestBed.resetTestingModule();
  });

  /** Puts the page in the document, so focus can be observed. */
  function attach(fixture: Fixture): void {
    const element = root(fixture);
    if (!element.isConnected) document.body.appendChild(element);
    attached = element;
  }

  it('shows the missing-token panel with a new-link action and no form when the link has no token', async () => {
    const { fixture, reset } = render(() => of({}), null);
    await settle(fixture);

    const shown = text(fixture);
    expect(shown).toContain(KEY.missingTitle);
    expect(shown).toContain(KEY.missingBody);
    expect(form(fixture)).toBeNull();
    expect(link(fixture, KEY.requestNewLink)?.getAttribute('href')).toContain('/auth/forgot-password');
    expect(reset).not.toHaveBeenCalled();
  });

  it('sends the token and the new password, then shows the success card', async () => {
    const { fixture, reset } = render(() => of({ message: 'Password updated' }));
    await settle(fixture);

    await fillAndSubmit(fixture);

    expect(reset).toHaveBeenCalledExactlyOnceWith({ token: 'abc123', new_password: VALID_PASSWORD });
    expect(text(fixture)).toContain(KEY.done);
    expect(form(fixture)).toBeNull();
    expect(alertText(fixture)).toBe('');
  });

  it.each([
    {
      why: 'invalid or already used',
      error: apiError(404, [SERVER_TEXT.invalid]),
      title: KEY.invalidTitle,
      body: KEY.invalidBody,
    },
    {
      why: 'expired',
      error: apiError(403, [SERVER_TEXT.expired]),
      title: KEY.expiredTitle,
      body: KEY.expiredBody,
    },
  ])(
    'replaces the form with the new-link panel when the link is $why',
    async ({ error, title, body }) => {
      const { fixture } = render(() => throwError(() => error));
      await settle(fixture);

      await fillAndSubmit(fixture);

      const shown = text(fixture);
      expect(shown).toContain(title);
      expect(shown).toContain(body);
      expect(form(fixture)).toBeNull();
      expect(root(fixture).querySelector('h2')?.id).toBe('hh-reset-title');
      expect(link(fixture, KEY.requestNewLink)?.getAttribute('href')).toContain(
        '/auth/forgot-password',
      );
      expect(link(fixture, KEY.contactUs)).toBeUndefined();
      expect(shown).not.toContain(error.serverMessages?.[0] ?? '');
    },
  );

  it('offers contact and log in, not a new link, when the account cannot reset by email', async () => {
    const { fixture } = render(() => throwError(() => apiError(403, [SERVER_TEXT.notResettable])));
    await settle(fixture);

    await fillAndSubmit(fixture);

    const shown = text(fixture);
    expect(shown).toContain(KEY.notResettableTitle);
    expect(shown).toContain(KEY.notResettableBody);
    expect(shown).not.toContain(SERVER_TEXT.notResettable);
    expect(form(fixture)).toBeNull();
    expect(root(fixture).querySelector('h2')?.id).toBe('hh-reset-title');
    expect(link(fixture, KEY.requestNewLink)).toBeUndefined();
    expect(link(fixture, KEY.contactUs)?.getAttribute('href')).toContain('/contact');
    const backToLogin = link(fixture, KEY.backToLogin);
    expect(backToLogin?.getAttribute('href')).toContain('/auth?mode=login');
  });

  it.each([
    {
      why: 'the server rejects the password',
      error: apiError(422, [SERVER_TEXT.blank]),
      key: KEY.passwordRejected,
    },
    { why: 'the server cannot be reached', error: apiError(0), key: KEY.cannotReach },
    { why: 'the server fails', error: apiError(500), key: KEY.somethingWentWrong },
    {
      why: 'a 403 matches neither known case',
      error: apiError(403, ['Forbidden']),
      key: KEY.somethingWentWrong,
    },
    { why: 'a 404 has no error envelope', error: apiError(404), key: KEY.somethingWentWrong },
    {
      why: 'the rejection is not an API error',
      error: new Error(`Http failure response for ${API_URL}`),
      key: KEY.somethingWentWrong,
    },
  ])('keeps the form and shows $key inline when $why', async ({ error, key }) => {
    const { fixture } = render(() => throwError(() => error));
    await settle(fixture);

    await fillAndSubmit(fixture);

    expect(alertText(fixture)).toBe(key);
    expect(form(fixture)).not.toBeNull();
    expect(text(fixture)).toContain(KEY.formTitle);
  });

  it.each([
    apiError(404, [SERVER_TEXT.invalid]),
    apiError(403, [SERVER_TEXT.expired]),
    apiError(403, [SERVER_TEXT.notResettable]),
    apiError(422, [SERVER_TEXT.blank]),
    apiError(0),
    apiError(500),
    apiError(403, ['Some other refusal']),
  ])('never shows the server text or the API URL (status $status)', async (error) => {
    const { fixture } = render(() => throwError(() => error));
    await settle(fixture);

    await fillAndSubmit(fixture);

    const shown = text(fixture);
    expect(shown).not.toContain(error.message);
    for (const message of error.serverMessages ?? []) expect(shown).not.toContain(message);
    expect(shown).not.toContain('/api/');
    expect(shown).not.toContain('Http failure');
  });

  it('clears the inline error on the next submit and lets it succeed', async () => {
    let attempt = 0;
    const { fixture, reset } = render(() =>
      ++attempt === 1 ? throwError(() => apiError(0)) : of({}),
    );
    await settle(fixture);

    await fillAndSubmit(fixture);
    expect(alertText(fixture)).toBe(KEY.cannotReach);

    await fillAndSubmit(fixture);
    expect(reset).toHaveBeenCalledTimes(2);
    expect(alertText(fixture)).toBe('');
    expect(text(fixture)).toContain(KEY.done);
  });

  it('clears the inline error while a retry is in flight', async () => {
    let attempt = 0;
    const { fixture } = render(() =>
      ++attempt === 1 ? throwError(() => apiError(500)) : NEVER,
    );
    await settle(fixture);

    await fillAndSubmit(fixture);
    expect(alertText(fixture)).toBe(KEY.somethingWentWrong);

    await fillAndSubmit(fixture);
    expect(alertText(fixture)).toBe('');
  });

  it('brings the form back when a new token arrives after a dead link', async () => {
    const { fixture, queryParamMap } = render(() =>
      throwError(() => apiError(404, [SERVER_TEXT.invalid])),
    );
    await settle(fixture);
    await fillAndSubmit(fixture);
    expect(text(fixture)).toContain(KEY.invalidTitle);

    queryParamMap.next(convertToParamMap({ token: 'def456' }));
    await settle(fixture);

    expect(text(fixture)).not.toContain(KEY.invalidTitle);
    expect(form(fixture)).not.toBeNull();
  });

  it.each([
    { reply: 'a 404', settle: (s: Subject<MessageResponse>) => s.error(apiError(404, [SERVER_TEXT.invalid])) },
    { reply: 'a 500', settle: (s: Subject<MessageResponse>) => s.error(apiError(500)) },
    {
      reply: 'a success',
      settle: (s: Subject<MessageResponse>) => {
        s.next({});
        s.complete();
      },
    },
  ])(
    'ignores $reply that arrives for the old link after a new one opened',
    async ({ settle: reply }) => {
      const old = new Subject<MessageResponse>();
      const { fixture, reset, queryParamMap } = render((body) =>
        body.token === 'abc123' ? old : NEVER,
      );
      await settle(fixture);
      await fillAndSubmit(fixture);
      expect(submitButton(fixture)?.getAttribute('aria-busy')).toBe('true');

      queryParamMap.next(convertToParamMap({ token: 'def456' }));
      await settle(fixture);
      reply(old);
      await settle(fixture);

      expect(form(fixture)).not.toBeNull();
      expect(text(fixture)).toContain(KEY.formTitle);
      expect(text(fixture)).not.toContain(KEY.invalidTitle);
      expect(text(fixture)).not.toContain(KEY.done);
      expect(alertText(fixture)).toBe('');
      expect(submitButton(fixture)?.hasAttribute('aria-busy')).toBe(false);

      await fillAndSubmit(fixture);
      expect(reset).toHaveBeenLastCalledWith({ token: 'def456', new_password: VALID_PASSWORD });
    },
  );

  it('starts the attempt over when a new link arrives: no inline error, field errors or typed passwords', async () => {
    const { fixture, queryParamMap } = render(() => throwError(() => apiError(500)));
    await settle(fixture);
    await fillAndSubmit(fixture);
    expect(alertText(fixture)).toBe(KEY.somethingWentWrong);
    // Field errors are switched on by the submit, so a mismatch now shows without submitting.
    const confirmInput = root(fixture).querySelectorAll<HTMLInputElement>('input[type="password"]')[1];
    confirmInput.value = 'Secret124';
    confirmInput.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(fieldTexts(fixture)[1]).toContain(KEY.mismatch);

    queryParamMap.next(convertToParamMap({ token: 'def456' }));
    await settle(fixture);

    expect(alertText(fixture)).toBe('');
    expect(passwordValues(fixture)).toEqual(['', '']);
    // Both fields are now empty, so any error still switched on would show here.
    expect(fieldTexts(fixture).join(' ')).not.toContain(KEY.passwordRule);
    expect(fieldTexts(fixture).join(' ')).not.toContain(KEY.confirmPassword);
  });

  it('shows the form again when a new link arrives after a successful reset', async () => {
    const { fixture, queryParamMap } = render(() => of({}));
    await settle(fixture);
    await fillAndSubmit(fixture);
    expect(text(fixture)).toContain(KEY.done);

    queryParamMap.next(convertToParamMap({ token: 'def456' }));
    await settle(fixture);

    expect(text(fixture)).not.toContain(KEY.done);
    expect(form(fixture)).not.toBeNull();
    expect(text(fixture)).toContain(KEY.formTitle);
  });

  it('keeps the dead-link panel when the same token is set again', async () => {
    const { fixture, queryParamMap } = render(() =>
      throwError(() => apiError(403, [SERVER_TEXT.expired])),
    );
    await settle(fixture);
    await fillAndSubmit(fixture);

    queryParamMap.next(convertToParamMap({ token: 'abc123' }));
    await settle(fixture);

    expect(text(fixture)).toContain(KEY.expiredTitle);
    expect(form(fixture)).toBeNull();
  });

  it.each([
    { why: 'the link is used', error: apiError(404, [SERVER_TEXT.invalid]) },
    { why: 'the link has expired', error: apiError(403, [SERVER_TEXT.expired]) },
    { why: 'the account cannot reset', error: apiError(403, [SERVER_TEXT.notResettable]) },
  ])('moves focus to the panel heading when $why', async ({ error }) => {
    const { fixture } = render(() => throwError(() => error));
    attach(fixture);
    await settle(fixture);

    await fillAndSubmit(fixture);
    await settle(fixture);

    const heading = root(fixture).querySelector('h2#hh-reset-title');
    expect(heading).not.toBeNull();
    expect(document.activeElement).toBe(heading);
  });

  it('does not steal focus on load for the missing-token panel', async () => {
    const { fixture } = render(() => of({}), null);
    attach(fixture);
    await settle(fixture);

    expect(document.activeElement).not.toBe(root(fixture).querySelector('h2'));
  });

  describe('validation', () => {
    it('shows translated field errors and sends nothing when both fields are empty', async () => {
      const { fixture, reset } = render(() => of({}));
      await settle(fixture);

      await fillAndSubmit(fixture, '', '');

      // The rule hint under the field always shows the rule key, so read the fields themselves.
      const [newField, confirmField] = fieldTexts(fixture);
      expect(newField).toContain(KEY.passwordRule);
      expect(confirmField).toContain(KEY.confirmPassword);
      expect(text(fixture)).not.toContain('Min 8 chars');
      expect(reset).not.toHaveBeenCalled();
    });

    it('shows the mismatch key when the confirmation differs', async () => {
      const { fixture, reset } = render(() => of({}));
      await settle(fixture);

      await fillAndSubmit(fixture, VALID_PASSWORD, 'Secret124');

      expect(text(fixture)).toContain(KEY.mismatch);
      expect(reset).not.toHaveBeenCalled();
    });

    it('shows the password-rule key for a weak password', async () => {
      const { fixture, reset } = render(() => of({}));
      await settle(fixture);

      await fillAndSubmit(fixture, 'weakpass', 'weakpass');

      const errors = fieldTexts(fixture);
      expect(errors[0]).toContain(KEY.passwordRule);
      expect(errors[1]).not.toContain(KEY.mismatch);
      expect(reset).not.toHaveBeenCalled();
    });
  });
});
