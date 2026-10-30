import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AuthApi } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { ForgotPassword } from './forgot-password';

const API_URL = 'http://localhost/api/user/forgot_password';
const EMAIL = 'ayesha@h.pk';

/** The spec renders translation keys as-is, so assertions read the key, not today's English. */
const KEY = {
  formTitle: 'authForgotPassword.forgotYourPassword',
  sentTitle: 'common.checkYourEmail',
  sentBody: 'authForgotPassword.sentIfAccountExists',
  enterAValidEmail: 'authForgotPassword.enterAValidEmail',
  alreadySent: 'authForgotPassword.alreadySent',
  sentAnother: 'authForgotPassword.sentAnother',
  tooManyRequests: 'authForgotPassword.tooManyRequests',
  cannotReach: 'authForgotPassword.cannotReachTheServer',
  couldNotSend: 'authForgotPassword.couldNotSend',
  sendResetLink: 'authForgotPassword.sendResetLink',
  resend: 'authForgotPassword.didnTReceiveItResend',
  resendIn: 'authForgotPassword.resendIn',
  tooManyRequestsRetry: 'authForgotPassword.tooManyRequestsRetry',
  useDifferentEmail: 'authForgotPassword.useADifferentEmail',
  backToLogin: 'authForgotPassword.backToLogin',
};

/** The backend's window for a repeat send, which Resend waits out. */
const RESEND_WAIT_MS = 10 * 60_000;

/** What the backend and its rate limiter say, none of which may reach the page. */
const ALREADY_SENT_TEXT = 'Otp already has been shared on your email. Retry after 10 minutes';
const NO_ACCOUNT_TEXT = 'User does not exist';
const TOO_MANY_TEXT = 'Too many requests. Please try again later.';
const SENT_TEXT = "We've sent an change password link to your email.";

/** Unicode isolates the page wraps around the address. */
const FSI = '\u2068';
const PDI = '\u2069';

/** An error shaped the way the error interceptor rethrows it, with the backend's own messages. */
function apiError(status: number, serverMessages?: readonly string[]) {
  return {
    status,
    code: status === 0 ? 'network_error' : 'unknown_error',
    message: serverMessages?.join(' ') ?? `Http failure response for ${API_URL}: ${status}`,
    serverMessages,
    method: 'POST',
  };
}

/** The rate limiter's 429, with the `retry_after` the interceptor carries over as `retryAfter`. */
function rateLimited(seconds: number) {
  return { ...apiError(429, [TOO_MANY_TEXT]), code: 'rate_limited', retryAfter: seconds };
}

type Reply = () => Observable<unknown>;

const created: Reply = () => of({ message: SENT_TEXT });
const fails =
  (rejection: unknown): Reply =>
  () =>
    throwError(() => rejection);

/** Outcomes that show the sent screen with no notice: a link went out, or no account was named. */
const SENT_CASES = [
  { case: 'a 201', reply: created },
  {
    case: 'a 404 naming no account',
    reply: fails(apiError(404, [NO_ACCOUNT_TEXT])),
  },
];

/** Outcomes that keep the user where they are, with the key they must see. */
const FAILURES = [
  {
    case: 'a 429',
    rejection: apiError(429, [TOO_MANY_TEXT]),
    key: KEY.tooManyRequests,
  },
  {
    case: 'an unreachable server',
    rejection: apiError(0),
    key: KEY.cannotReach,
  },
  {
    case: 'a 500',
    rejection: apiError(500, ['Internal Server Error']),
    key: KEY.couldNotSend,
  },
  {
    case: 'a 500 without an envelope',
    rejection: apiError(500),
    key: KEY.couldNotSend,
  },
  {
    case: 'a bare "Not Found" 404',
    rejection: apiError(404, ['Not Found']),
    key: KEY.couldNotSend,
  },
  {
    case: 'a bare "Unprocessable Entity" 422',
    rejection: apiError(422, ['Unprocessable Entity']),
    key: KEY.couldNotSend,
  },
  {
    case: 'a 400',
    rejection: apiError(400, [ALREADY_SENT_TEXT]),
    key: KEY.couldNotSend,
  },
  {
    case: 'a 403',
    rejection: apiError(403, [NO_ACCOUNT_TEXT]),
    key: KEY.couldNotSend,
  },
  {
    case: 'a value that is not an API error',
    rejection: new Error('Cannot reach the server — is the API running?'),
    key: KEY.couldNotSend,
  },
];

/** Every key a failure can show, so a test can say none of the others is on screen. */
const FAILURE_KEYS = [KEY.tooManyRequests, KEY.cannotReach, KEY.couldNotSend];

function render(...replies: Reply[]) {
  const queue = [...replies];
  const forgotPassword = vi.fn<(body: { email: string }) => Observable<unknown>>(() =>
    (queue.shift() ?? created)(),
  );
  TestBed.configureTestingModule({
    imports: [ForgotPassword],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: AuthApi, useValue: { forgotPassword } },
    ],
  });
  const fixture = TestBed.createComponent(ForgotPassword);
  return { fixture, forgotPassword };
}

type Fixture = ReturnType<typeof render>['fixture'];

async function flush(fixture: Fixture) {
  fixture.detectChanges();
  await fixture.whenStable();
  TestBed.tick();
  fixture.detectChanges();
}

/** Moves the faked clock on, firing the page's one-second ticks on the way. */
async function elapse(fixture: Fixture, ms: number) {
  vi.advanceTimersByTime(ms);
  await flush(fixture);
}

function root(fixture: Fixture): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: Fixture): string {
  return root(fixture).textContent ?? '';
}

function emailInput(fixture: Fixture): HTMLInputElement {
  const input = root(fixture).querySelector<HTMLInputElement>('hh-input input');
  if (!input) throw new Error('no email input on screen');
  return input;
}

async function typeEmail(fixture: Fixture, value: string) {
  const input = emailInput(fixture);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await flush(fixture);
}

async function submit(fixture: Fixture) {
  root(fixture)
    .querySelector('form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush(fixture);
}

function button(fixture: Fixture, label: string): HTMLButtonElement | undefined {
  return Array.from(root(fixture).querySelectorAll('button')).find((b) =>
    b.textContent?.includes(label),
  );
}

async function click(fixture: Fixture, label: string) {
  button(fixture, label)?.click();
  await flush(fixture);
}

function heading(fixture: Fixture): HTMLElement | null {
  return root(fixture).querySelector('h2');
}

function statusRegion(fixture: Fixture): HTMLElement | null {
  return root(fixture).querySelector('[role="status"]');
}

function statusText(fixture: Fixture): string {
  return statusRegion(fixture)?.textContent?.trim() ?? '';
}

function alertText(fixture: Fixture): string {
  return root(fixture).querySelector('[role="alert"]')?.textContent?.trim() ?? '';
}

/** Puts the fixture in the document, so focus can land on it. */
function attach(fixture: Fixture): HTMLElement {
  const element = root(fixture);
  if (!element.isConnected) document.body.appendChild(element);
  return element;
}

/** Fills in a valid address and sends it, landing wherever the first reply leads. */
async function sendEmail(fixture: Fixture, value = EMAIL) {
  await flush(fixture);
  await typeEmail(fixture, value);
  await submit(fixture);
  await flush(fixture);
}

/** Asserts nothing the server, the HTTP client or the old developer copy wrote reached the page. */
function expectNoServerText(fixture: Fixture): void {
  const shown = text(fixture);
  for (const leaked of [
    ALREADY_SENT_TEXT,
    'Otp',
    NO_ACCOUNT_TEXT,
    TOO_MANY_TEXT,
    SENT_TEXT,
    'Internal Server Error',
    'Unprocessable Entity',
    'Not Found',
    API_URL,
    '/api/',
    'Http failure',
    'is the API running',
    'Something went wrong',
  ]) {
    expect(shown).not.toContain(leaked);
  }
}

function expectSentScreen(fixture: Fixture): void {
  expect(heading(fixture)?.textContent).toContain(KEY.sentTitle);
  expect(text(fixture)).toContain(KEY.sentBody);
  expect(root(fixture).querySelector('form')).toBeNull();
}

function expectForm(fixture: Fixture): void {
  expect(heading(fixture)?.textContent).toContain(KEY.formTitle);
  expect(root(fixture).querySelector('form')).not.toBeNull();
}

describe('ForgotPassword', () => {
  let attached: HTMLElement | null = null;

  beforeEach(() => {
    // Only the clock the waits read is faked; Angular's own scheduling keeps real timers.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    attached?.remove();
    attached = null;
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('opens on the form with an empty status region, no alert and no request', async () => {
    const { fixture, forgotPassword } = render();
    attached = attach(fixture);
    await flush(fixture);

    expectForm(fixture);
    expect(statusRegion(fixture)).not.toBeNull();
    expect(statusText(fixture)).toBe('');
    expect(alertText(fixture)).toBe('');
    expect(forgotPassword).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(heading(fixture));
  });

  it.each(['', 'not-an-email'])(
    'asks for a valid address, translated, and sends nothing when Send is clicked with %j',
    async (value) => {
      const { fixture, forgotPassword } = render();
      await flush(fixture);
      await typeEmail(fixture, value);
      expect(text(fixture)).not.toContain(KEY.enterAValidEmail);

      const send = button(fixture, KEY.sendResetLink);
      expect(send?.disabled).toBe(false);
      await click(fixture, KEY.sendResetLink);

      expect(text(fixture)).toContain(KEY.enterAValidEmail);
      expect(text(fixture)).not.toContain('Enter a valid email address.');
      expect(forgotPassword).not.toHaveBeenCalled();
      expectForm(fixture);
    },
  );

  it('sends a valid address when Send is clicked', async () => {
    const { fixture, forgotPassword } = render();
    await flush(fixture);
    await typeEmail(fixture, EMAIL);
    await click(fixture, KEY.sendResetLink);
    await flush(fixture);

    expect(forgotPassword).toHaveBeenCalledExactlyOnceWith({ email: EMAIL });
    expectSentScreen(fixture);
  });

  describe('on Send', () => {
    it.each(SENT_CASES)(
      'shows the neutral sent screen with no notice for $case',
      async ({ reply }) => {
        const { fixture, forgotPassword } = render(reply);
        await sendEmail(fixture, `  ${EMAIL} `);

        expect(forgotPassword).toHaveBeenCalledExactlyOnceWith({
          email: EMAIL,
        });
        expectSentScreen(fixture);
        expect(statusText(fixture)).toBe('');
        expect(alertText(fixture)).toBe('');
        expectNoServerText(fixture);
      },
    );

    it('shows the sent screen with the already-sent notice for a 422', async () => {
      const { fixture } = render(fails(apiError(422, [ALREADY_SENT_TEXT])));
      await sendEmail(fixture);

      expectSentScreen(fixture);
      expect(statusText(fixture)).toBe(KEY.alreadySent);
      expect(alertText(fixture)).toBe('');
      expectNoServerText(fixture);
    });

    it.each([...SENT_CASES, { case: 'a 422', reply: fails(apiError(422, [ALREADY_SENT_TEXT])) }])(
      'moves focus to the sent heading after $case',
      async ({ reply }) => {
        const { fixture } = render(reply);
        attached = attach(fixture);
        await sendEmail(fixture);
        await flush(fixture);

        expect(heading(fixture)?.textContent).toContain(KEY.sentTitle);
        expect(document.activeElement).toBe(heading(fixture));
      },
    );

    it('describes the sent heading by the body and the notice', async () => {
      const { fixture } = render(fails(apiError(422, [ALREADY_SENT_TEXT])));
      await sendEmail(fixture);

      const ids = (heading(fixture)?.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .filter(Boolean);
      expect(ids).toEqual(['hh-forgot-sent-body', 'hh-forgot-notice']);
      expect(root(fixture).querySelector(`#${ids[0]}`)?.textContent).toContain(KEY.sentBody);
      expect(root(fixture).querySelector(`#${ids[1]}`)?.textContent).toContain(KEY.alreadySent);
    });

    it.each(FAILURES)(
      'stays on the form with its translated alert for $case',
      async ({ rejection, key }) => {
        const { fixture } = render(fails(rejection));
        attached = attach(fixture);
        await flush(fixture);
        const send = button(fixture, KEY.sendResetLink);
        send?.focus();
        expect(document.activeElement).toBe(send);
        await sendEmail(fixture);

        expectForm(fixture);
        expect(alertText(fixture)).toBe(key);
        for (const other of FAILURE_KEYS.filter((k) => k !== key)) {
          expect(text(fixture)).not.toContain(other);
        }
        expect(statusText(fixture)).toBe('');
        expectNoServerText(fixture);
        // Focus stays on Send, the control the user was on; it never jumps to the alert.
        expect(document.activeElement).toBe(button(fixture, KEY.sendResetLink));
        expect(document.activeElement).not.toBe(heading(fixture));
        expect(document.activeElement).not.toBe(root(fixture).querySelector('[role="alert"]'));
      },
    );

    it('clears the alert as soon as the next attempt starts', async () => {
      const pending = new Subject<unknown>();
      const { fixture, forgotPassword } = render(fails(apiError(500)), () => pending);
      await sendEmail(fixture);
      expect(alertText(fixture)).toBe(KEY.couldNotSend);

      await submit(fixture);

      expect(forgotPassword).toHaveBeenCalledTimes(2);
      expect(alertText(fixture)).toBe('');
      pending.next({ message: SENT_TEXT });
      pending.complete();
      await flush(fixture);
      expectSentScreen(fixture);
    });

    it('clears the alert when the email is edited', async () => {
      const { fixture } = render(fails(apiError(429, [TOO_MANY_TEXT])));
      await sendEmail(fixture);
      expect(alertText(fixture)).toBe(KEY.tooManyRequests);

      await typeEmail(fixture, 'ayesha2@h.pk');

      expect(alertText(fixture)).toBe('');
    });

    it('sends once on a double submit', async () => {
      const pending = new Subject<unknown>();
      const { fixture, forgotPassword } = render(() => pending);
      await flush(fixture);
      await typeEmail(fixture, EMAIL);

      await submit(fixture);
      await submit(fixture);
      button(fixture, KEY.sendResetLink)?.click();
      await flush(fixture);

      expect(forgotPassword).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the address that was sent when the field changes while Send is pending', async () => {
    const pending = new Subject<unknown>();
    const { fixture, forgotPassword } = render(() => pending);
    TestBed.inject(TranslocoService).setTranslation(
      { authForgotPassword: { sentIfAccountExists: 'Sent to {{email}}.' } },
      'en',
    );
    await flush(fixture);
    await typeEmail(fixture, EMAIL);
    await submit(fixture);

    expect(emailInput(fixture).disabled).toBe(true);
    // A change that still reaches the field must not redirect the request in flight.
    await typeEmail(fixture, 'someone-else@h.pk');

    pending.next({ message: SENT_TEXT });
    pending.complete();
    await flush(fixture);

    const body = root(fixture).querySelector('#hh-forgot-sent-body');
    expect(body?.textContent).toContain(`Sent to ${FSI}${EMAIL}${PDI}.`);
    expect(body?.textContent).not.toContain('someone-else');

    await elapse(fixture, RESEND_WAIT_MS);
    await click(fixture, KEY.resend);
    expect(forgotPassword).toHaveBeenCalledTimes(2);
    expect(forgotPassword).toHaveBeenNthCalledWith(1, { email: EMAIL });
    expect(forgotPassword).toHaveBeenNthCalledWith(2, { email: EMAIL });

    await click(fixture, KEY.useDifferentEmail);
    expect(emailInput(fixture).value).toBe(EMAIL);
    expect(emailInput(fixture).disabled).toBe(false);
  });

  describe('on the sent screen', () => {
    it('binds the address into the body as isolated text, never as markup', async () => {
      const address = '<b>x</b>@h.pk';
      const { fixture } = render();
      TestBed.inject(TranslocoService).setTranslation(
        {
          authForgotPassword: {
            sentIfAccountExists: 'If an account exists for {{email}}, a link is on its way.',
          },
        },
        'en',
      );
      await sendEmail(fixture, address);
      await elapse(fixture, RESEND_WAIT_MS);

      const body = root(fixture).querySelector('#hh-forgot-sent-body');
      expect(body?.textContent).toContain(
        `If an account exists for ${FSI}${address}${PDI}, a link is on its way.`,
      );
      expect(body?.querySelector('b')).toBeNull();
    });

    it.each(SENT_CASES)('says another link went out when Resend gets $case', async ({ reply }) => {
      const { fixture, forgotPassword } = render(created, reply);
      await sendEmail(fixture);
      await elapse(fixture, RESEND_WAIT_MS);
      const region = statusRegion(fixture);
      expect(region).not.toBeNull();
      expect(statusText(fixture)).toBe('');

      await click(fixture, KEY.resend);

      expect(forgotPassword).toHaveBeenCalledTimes(2);
      expect(forgotPassword).toHaveBeenLastCalledWith({ email: EMAIL });
      // The region must already exist before the announcement, or screen readers miss it.
      expect(statusRegion(fixture)).toBe(region);
      expect(statusText(fixture)).toBe(KEY.sentAnother);
      expect(alertText(fixture)).toBe('');
      expectSentScreen(fixture);
      expectNoServerText(fixture);
    });

    it('shows the already-sent notice when Resend gets a 422', async () => {
      const { fixture } = render(created, fails(apiError(422, [ALREADY_SENT_TEXT])));
      await sendEmail(fixture);
      await elapse(fixture, RESEND_WAIT_MS);
      const region = statusRegion(fixture);

      await click(fixture, KEY.resend);

      expect(statusRegion(fixture)).toBe(region);
      expect(statusText(fixture)).toBe(KEY.alreadySent);
      expect(alertText(fixture)).toBe('');
      expectSentScreen(fixture);
      expectNoServerText(fixture);
    });

    it.each(FAILURES)(
      'shows its translated alert in the sent panel when Resend gets $case',
      async ({ rejection, key }) => {
        const { fixture } = render(created, fails(rejection));
        attached = attach(fixture);
        await sendEmail(fixture);
        await elapse(fixture, RESEND_WAIT_MS);
        await flush(fixture);
        const resend = button(fixture, KEY.resend);
        resend?.focus();
        expect(document.activeElement).toBe(resend);

        await click(fixture, KEY.resend);

        expectSentScreen(fixture);
        expect(alertText(fixture)).toBe(key);
        expect(statusText(fixture)).toBe('');
        expectNoServerText(fixture);
        // Focus stays on Resend, the control the user was on; it never jumps to the alert.
        expect(document.activeElement).toBe(button(fixture, KEY.resend));
        expect(document.activeElement).not.toBe(heading(fixture));
        expect(document.activeElement).not.toBe(root(fixture).querySelector('[role="alert"]'));
      },
    );

    it('clears the alert and the notice as soon as the next resend starts', async () => {
      const pending = new Subject<unknown>();
      const { fixture } = render(
        fails(apiError(422, [ALREADY_SENT_TEXT])),
        fails(apiError(0)),
        () => pending,
      );
      await sendEmail(fixture);
      await elapse(fixture, RESEND_WAIT_MS);
      expect(statusText(fixture)).toBe(KEY.alreadySent);

      await click(fixture, KEY.resend);
      expect(alertText(fixture)).toBe(KEY.cannotReach);
      expect(statusText(fixture)).toBe('');

      await click(fixture, KEY.resend);
      expect(alertText(fixture)).toBe('');
      expect(statusText(fixture)).toBe('');

      pending.next({ message: SENT_TEXT });
      pending.complete();
      await flush(fixture);
      expect(statusText(fixture)).toBe(KEY.sentAnother);
    });

    it('announces the already-sent notice again when a resend gets the same 422', async () => {
      const pending = new Subject<unknown>();
      const { fixture } = render(fails(apiError(422, [ALREADY_SENT_TEXT])), () => pending);
      await sendEmail(fixture);
      await elapse(fixture, RESEND_WAIT_MS);
      const region = statusRegion(fixture);
      expect(statusText(fixture)).toBe(KEY.alreadySent);

      await click(fixture, KEY.resend);
      expect(statusText(fixture)).toBe('');

      pending.error(apiError(422, [ALREADY_SENT_TEXT]));
      await flush(fixture);

      expect(statusRegion(fixture)).toBe(region);
      expect(statusText(fixture)).toBe(KEY.alreadySent);
      expectNoServerText(fixture);
    });

    it('disables Use a different email while a resend is pending, so the sent panel stays', async () => {
      const pending = new Subject<unknown>();
      const { fixture } = render(created, () => pending);
      await sendEmail(fixture);
      await elapse(fixture, RESEND_WAIT_MS);

      await click(fixture, KEY.resend);
      const useDifferent = button(fixture, KEY.useDifferentEmail);
      expect(useDifferent?.disabled).toBe(true);

      await click(fixture, KEY.useDifferentEmail);
      expectSentScreen(fixture);

      pending.next({ message: SENT_TEXT });
      pending.complete();
      await flush(fixture);
      expectSentScreen(fixture);
      expect(statusText(fixture)).toBe(KEY.sentAnother);
      expect(button(fixture, KEY.useDifferentEmail)?.disabled).toBe(false);
    });

    it('resends once on a double click', async () => {
      const pending = new Subject<unknown>();
      const { fixture, forgotPassword } = render(created, () => pending);
      await sendEmail(fixture);
      await elapse(fixture, RESEND_WAIT_MS);

      const resend = button(fixture, KEY.resend);
      resend?.click();
      resend?.click();
      await flush(fixture);

      expect(forgotPassword).toHaveBeenCalledTimes(2);
    });

    it('does not pull focus back to the heading after a resend', async () => {
      const { fixture } = render(created, created);
      attached = attach(fixture);
      await sendEmail(fixture);
      await elapse(fixture, RESEND_WAIT_MS);
      await flush(fixture);
      expect(document.activeElement).toBe(heading(fixture));

      const resend = button(fixture, KEY.resend);
      resend?.focus();
      await click(fixture, KEY.resend);
      await flush(fixture);

      expect(statusText(fixture)).toBe(KEY.sentAnother);
      expect(document.activeElement).not.toBe(heading(fixture));
    });

    it('goes back to the form with the address kept and every message cleared on Use a different email', async () => {
      const { fixture, forgotPassword } = render(
        fails(apiError(422, [ALREADY_SENT_TEXT])),
        fails(apiError(500)),
      );
      attached = attach(fixture);
      await sendEmail(fixture);
      await elapse(fixture, RESEND_WAIT_MS);
      await click(fixture, KEY.resend);
      expect(alertText(fixture)).toBe(KEY.couldNotSend);

      await click(fixture, KEY.useDifferentEmail);
      await flush(fixture);

      expectForm(fixture);
      expect(emailInput(fixture).value).toBe(EMAIL);
      expect(alertText(fixture)).toBe('');
      expect(statusText(fixture)).toBe('');
      expect(text(fixture)).not.toContain(KEY.enterAValidEmail);
      expect(document.activeElement).toBe(heading(fixture));
      expect(forgotPassword).toHaveBeenCalledTimes(2);
    });

    it('offers Back to login, Resend and Use a different email', async () => {
      const { fixture } = render();
      await sendEmail(fixture);
      await elapse(fixture, RESEND_WAIT_MS);

      const backToLogin = Array.from(root(fixture).querySelectorAll('a')).find((a) =>
        a.textContent?.includes(KEY.backToLogin),
      );
      expect(backToLogin?.getAttribute('href')).toContain('/auth?mode=login');
      expect(button(fixture, KEY.resend)).toBeDefined();
      expect(button(fixture, KEY.useDifferentEmail)).toBeDefined();
    });
  });

  describe('the waits', () => {
    /** Real copy for the two timed keys, so the clock they carry can be read. */
    function withTimedCopy() {
      TestBed.inject(TranslocoService).setTranslation(
        {
          authForgotPassword: {
            resendIn: 'Resend in {{time}}',
            tooManyRequestsRetry: 'Try again in {{time}}.',
          },
        },
        'en',
        { merge: true },
      );
    }

    /** The Resend button, whichever label it carries. */
    function resendButton(fixture: Fixture): HTMLButtonElement | undefined {
      return (
        button(fixture, KEY.resend) ?? button(fixture, KEY.resendIn) ?? button(fixture, 'Resend in')
      );
    }

    function rateAlert(fixture: Fixture) {
      const alert = root(fixture).querySelector('[role="alert"]');
      return {
        announced: alert?.querySelector('.sr-only')?.textContent?.trim() ?? '',
        shown: alert?.querySelector('[aria-hidden="true"]')?.textContent?.trim() ?? '',
      };
    }

    it('holds Resend back for ten minutes after a link goes out, counting down', async () => {
      const { fixture, forgotPassword } = render(created, created);
      withTimedCopy();
      await sendEmail(fixture);

      expect(resendButton(fixture)?.disabled).toBe(true);
      expect(resendButton(fixture)?.textContent).toContain(`Resend in ${FSI}10:00${PDI}`);
      expect(button(fixture, KEY.resend)).toBeUndefined();

      await elapse(fixture, 1000);
      expect(resendButton(fixture)?.textContent).toContain(`${FSI}9:59${PDI}`);

      resendButton(fixture)?.click();
      await flush(fixture);
      expect(forgotPassword).toHaveBeenCalledTimes(1);

      await elapse(fixture, RESEND_WAIT_MS - 1000);
      expect(button(fixture, KEY.resend)?.disabled).toBe(false);
      await click(fixture, KEY.resend);
      expect(forgotPassword).toHaveBeenCalledTimes(2);
      expect(statusText(fixture)).toBe(KEY.sentAnother);
      // A resend that went out starts the next ten minutes.
      expect(resendButton(fixture)?.textContent).toContain(`${FSI}10:00${PDI}`);
    });

    it('waits the whole ten minutes after a 422, as no send of its own is known', async () => {
      const { fixture } = render(fails(apiError(422, [ALREADY_SENT_TEXT])));
      withTimedCopy();
      await sendEmail(fixture);

      expect(resendButton(fixture)?.textContent).toContain(`${FSI}10:00${PDI}`);
    });

    it('waits one more minute when a 422 still comes back after the countdown ends', async () => {
      const { fixture } = render(created, fails(apiError(422, [ALREADY_SENT_TEXT])));
      withTimedCopy();
      await sendEmail(fixture);
      await elapse(fixture, RESEND_WAIT_MS);

      await click(fixture, KEY.resend);

      expect(statusText(fixture)).toBe(KEY.alreadySent);
      expect(alertText(fixture)).toBe('');
      expect(resendButton(fixture)?.textContent).toContain(`${FSI}1:00${PDI}`);
    });

    it('does not ask again for an address still inside its ten minutes', async () => {
      const { fixture, forgotPassword } = render(created, created);
      await sendEmail(fixture);
      await elapse(fixture, 60_000);

      await click(fixture, KEY.useDifferentEmail);
      await typeEmail(fixture, ` ${EMAIL.toUpperCase()} `);
      await submit(fixture);

      expect(forgotPassword).toHaveBeenCalledTimes(1);
      expectSentScreen(fixture);
      expect(statusText(fixture)).toBe(KEY.alreadySent);
      expect(resendButton(fixture)?.disabled).toBe(true);
    });

    it('sends straight away to a different address, with its own ten minutes', async () => {
      const other = 'bilal@h.pk';
      const { fixture, forgotPassword } = render(created, created);
      withTimedCopy();
      await sendEmail(fixture);
      await elapse(fixture, 60_000);

      await click(fixture, KEY.useDifferentEmail);
      await typeEmail(fixture, other);
      await submit(fixture);

      expect(forgotPassword).toHaveBeenLastCalledWith({ email: other });
      expect(resendButton(fixture)?.textContent).toContain(`${FSI}10:00${PDI}`);
    });

    it('shows the 429 wait on the form, announced once, and holds Send back until it ends', async () => {
      const { fixture, forgotPassword } = render(fails(rateLimited(31)));
      withTimedCopy();
      await sendEmail(fixture);

      expectForm(fixture);
      expect(rateAlert(fixture)).toEqual({
        announced: `Try again in ${FSI}0:31${PDI}.`,
        shown: `Try again in ${FSI}0:31${PDI}.`,
      });
      expect(text(fixture)).not.toContain(KEY.tooManyRequests);
      expect(button(fixture, KEY.sendResetLink)?.disabled).toBe(true);
      expectNoServerText(fixture);

      await elapse(fixture, 1000);
      // Only the visual copy ticks; the announced text keeps the wait as it arrived.
      expect(rateAlert(fixture)).toEqual({
        announced: `Try again in ${FSI}0:31${PDI}.`,
        shown: `Try again in ${FSI}0:30${PDI}.`,
      });
      await submit(fixture);
      expect(forgotPassword).toHaveBeenCalledTimes(1);

      await elapse(fixture, 30_000);
      expect(alertText(fixture)).toBe('');
      expect(button(fixture, KEY.sendResetLink)?.disabled).toBe(false);
    });

    it('lets a different address be sent while one is rate-limited', async () => {
      const { fixture } = render(fails(rateLimited(31)));
      await sendEmail(fixture);
      expect(button(fixture, KEY.sendResetLink)?.disabled).toBe(true);

      await typeEmail(fixture, 'bilal@h.pk');

      expect(alertText(fixture)).toBe('');
      expect(button(fixture, KEY.sendResetLink)?.disabled).toBe(false);

      await typeEmail(fixture, EMAIL);
      expect(button(fixture, KEY.sendResetLink)?.disabled).toBe(true);
    });

    it('writes a wait of an hour or more with hours', async () => {
      const { fixture } = render(fails(rateLimited(3600)));
      withTimedCopy();
      await sendEmail(fixture);

      expect(rateAlert(fixture).shown).toBe(`Try again in ${FSI}1:00:00${PDI}.`);
    });

    it('holds Resend back for as long as a 429 on Resend says', async () => {
      const { fixture, forgotPassword } = render(created, fails(rateLimited(90)));
      withTimedCopy();
      await sendEmail(fixture);
      await elapse(fixture, RESEND_WAIT_MS);

      await click(fixture, KEY.resend);

      expectSentScreen(fixture);
      expect(rateAlert(fixture).shown).toBe(`Try again in ${FSI}1:30${PDI}.`);
      expect(statusText(fixture)).toBe('');
      expect(resendButton(fixture)?.disabled).toBe(true);
      expect(resendButton(fixture)?.textContent).toContain(`${FSI}1:30${PDI}`);

      await elapse(fixture, 90_000);
      expect(alertText(fixture)).toBe('');
      expect(button(fixture, KEY.resend)?.disabled).toBe(false);
      expect(forgotPassword).toHaveBeenCalledTimes(2);
    });

    it('catches the countdown up when the tab becomes visible again', async () => {
      const { fixture } = render(created);
      withTimedCopy();
      await sendEmail(fixture);

      // A hidden tab's interval may not fire at all; only the wall clock moves.
      vi.setSystemTime(Date.now() + 5 * 60_000);
      document.dispatchEvent(new Event('visibilitychange'));
      await flush(fixture);

      expect(resendButton(fixture)?.textContent).toContain(`${FSI}5:00${PDI}`);
    });

    it('stops its clock once nothing is waiting', async () => {
      const { fixture } = render(created);
      await sendEmail(fixture);
      expect(vi.getTimerCount()).toBe(1);

      await elapse(fixture, RESEND_WAIT_MS);

      expect(vi.getTimerCount()).toBe(0);
    });

    it('stops its clock when the page goes away', async () => {
      const started = vi.spyOn(globalThis, 'setInterval');
      const stopped = vi.spyOn(globalThis, 'clearInterval');
      const { fixture } = render(created);
      await sendEmail(fixture);
      // Other code runs intervals too; the page's clock is the one that ticks every second.
      const ticks = started.mock.calls
        .map((call, i) => ({ delay: call[1], timer: started.mock.results[i]?.value }))
        .filter(({ delay }) => delay === 1000);
      expect(ticks).toHaveLength(1);
      expect(stopped).not.toHaveBeenCalledWith(ticks[0].timer);

      fixture.destroy();

      expect(stopped).toHaveBeenCalledWith(ticks[0].timer);
    });
  });
});
