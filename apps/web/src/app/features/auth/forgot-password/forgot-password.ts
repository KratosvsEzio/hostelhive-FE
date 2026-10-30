import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  linkedSignal,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Button, Input, Container } from '@hostelhive/ui';
import { AuthApi } from '@services';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';
import { Logo } from '@core/brand/logo';
import { retryAfterSeconds } from '@core/errors/api-error-text';
import { classifyForgotFailure, ForgotFailureKind } from './forgot-failure';

type Phase = 'email' | 'sent';

/** Failures that keep the user where they are, with a message to act on. */
type FailureKind = Exclude<ForgotFailureKind, 'noAccount' | 'alreadySent'>;

/**
 * How one request ended: a link went out, one was already out, the rate limiter named a wait,
 * or it failed.
 */
type SendOutcome = 'sent' | 'alreadySent' | 'rateLimited' | FailureKind;

/** When an address may be sent to again, as epoch milliseconds; `0` means no wait. */
interface Waits {
  /** Ten minutes after the last link went out, the backend's own window for a repeat. */
  readonly resendAt: number;
  /** When the rate limiter's `retry_after` runs out. */
  readonly retryAt: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The backend answers a repeat within this window with a 422. */
const RESEND_WAIT_MS = 10 * 60_000;
/** A 422 after the local countdown ended means the clocks drifted; this short wait covers it. */
const DRIFT_WAIT_MS = 60_000;
const TICK_MS = 1000;

const NO_WAITS: Waits = { resendAt: 0, retryAt: 0 };

const KEY = {
  enterAValidEmail: 'authForgotPassword.enterAValidEmail',
  alreadySent: 'authForgotPassword.alreadySent',
  sentAnother: 'authForgotPassword.sentAnother',
} as const;

const FAILURE_KEY: Record<FailureKind, string> = {
  tooManyRequests: 'authForgotPassword.tooManyRequests',
  network: 'authForgotPassword.cannotReachTheServer',
  unknown: 'authForgotPassword.couldNotSend',
};

/** Unicode isolates, so an address in another script cannot reorder the sentence around it. */
const FIRST_STRONG_ISOLATE = '\u2068';
const POP_DIRECTIONAL_ISOLATE = '\u2069';

/**
 * Forgot-password page: asks for an email, then says a reset link is on its way.
 *
 * The sent screen is worded so it does not say whether an account exists: a 201 and a 404 that
 * names no account both land there. A link that is already out shows the same screen with a
 * notice, as does a resend. Too many attempts, an unreachable server and anything unrecognised
 * stay put with a translated message; the server's own wording is never shown.
 *
 * Each address waits ten minutes after a link goes out before Resend works again, and as long as
 * a 429's `retry_after` says after that. The waits count down on screen and live in memory only,
 * keyed by address, so they are the same for every address whether or not it has an account.
 */
@Component({
  selector: 'hh-forgot-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo, Container, RouterLink, LocaleLink, Button, Input, TranslocoPipe],
  templateUrl: './forgot-password.html',
})
export class ForgotPassword {
  private readonly authApi = inject(AuthApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly phase = signal<Phase>('email');
  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly email = signal('');
  /** The address the last Send asked about; the sent screen and Resend use it, not the field. */
  private readonly sentEmail = signal('');
  /** Translation key of the failure on show, or `''`. */
  protected readonly errorKey = signal('');
  /** Translation key of the sent screen's notice, or `''`. */
  protected readonly noticeKey = signal('');
  /** Set when one panel replaces the other, and cleared once its heading has focus. */
  private readonly focusHeading = signal(false);

  /** Every address's waits, keyed by `addressKey`. */
  private readonly waits = signal<ReadonlyMap<string, Waits>>(new Map());
  /** The clock the countdowns read; it only ticks while a wait is running. */
  private readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;

  protected readonly emailError = computed(() =>
    EMAIL_RE.test(this.email().trim()) ? '' : KEY.enterAValidEmail,
  );
  protected readonly visibleEmailError = computed(() =>
    this.showErrors() ? this.emailError() : '',
  );
  protected readonly isolatedEmail = computed(() => isolate(this.sentEmail()));

  /** How long until Resend works for the address on the sent screen. */
  protected readonly resendWaitMs = computed(() => {
    const { resendAt, retryAt } = this.waitsOf(this.sentEmail());
    return Math.max(0, resendAt - this.now(), retryAt - this.now());
  });
  protected readonly resendTime = computed(() => isolate(clock(this.resendWaitMs())));

  /** The address the panel on show is about: the field's on the form, the sent one after. */
  private readonly panelEmail = computed(() =>
    this.phase() === 'email' ? this.email() : this.sentEmail(),
  );
  /** How long the rate limiter still holds back the panel's address. */
  protected readonly retryWaitMs = computed(() =>
    Math.max(0, this.waitsOf(this.panelEmail()).retryAt - this.now()),
  );
  protected readonly retryTime = computed(() => isolate(clock(this.retryWaitMs())));
  /**
   * The wait as it stood when the rate-limit alert appeared. The alert announces this once; the
   * ticking copy beside it is hidden from screen readers, or they would read it every second.
   */
  protected readonly announcedRetryTime = linkedSignal({
    source: computed(() => (this.retryWaitMs() > 0 ? addressKey(this.panelEmail()) : '')),
    computation: () => untracked(this.retryTime),
  });

  constructor() {
    // A panel swap removes the control the user was on, so the new heading takes focus once.
    afterRenderEffect(() => {
      const heading = this.heading();
      if (!heading || !this.focusHeading()) return;
      heading.nativeElement.focus();
      this.focusHeading.set(false);
    });

    const doc = inject(DOCUMENT);
    // A background tab's interval is throttled, so catch the clock up as soon as it is back.
    const onVisible = () => {
      if (this.timer !== null && doc.visibilityState === 'visible') this.tick();
    };
    if (this.isBrowser) doc.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      this.stopClock();
      if (this.isBrowser) doc.removeEventListener('visibilitychange', onVisible);
    });
  }

  protected editEmail(value: string): void {
    this.email.set(value);
    this.errorKey.set('');
  }

  protected submitEmail(event: Event): void {
    event.preventDefault();
    if (this.busy() || this.retryWaitMs() > 0) return;
    this.showErrors.set(true);
    this.errorKey.set('');
    if (this.emailError()) return;

    const address = this.email().trim();
    this.sentEmail.set(address);
    // A link went out to this address moments ago; asking again could only earn a 422.
    if (this.waitsOf(address).resendAt > Date.now()) {
      this.showSent(KEY.alreadySent);
      return;
    }
    this.send((outcome) => {
      if (outcome === 'sent' || outcome === 'alreadySent') {
        this.showSent(outcome === 'alreadySent' ? KEY.alreadySent : '');
        return;
      }
      if (outcome !== 'rateLimited') this.errorKey.set(FAILURE_KEY[outcome]);
    });
  }

  protected resend(): void {
    if (this.busy() || this.resendWaitMs() > 0) return;
    this.send((outcome) => {
      if (outcome === 'sent') this.noticeKey.set(KEY.sentAnother);
      else if (outcome === 'alreadySent') this.noticeKey.set(KEY.alreadySent);
      else if (outcome !== 'rateLimited') this.errorKey.set(FAILURE_KEY[outcome]);
    });
  }

  /** Back to the form with the address kept, so a typo can be fixed. */
  protected useDifferentEmail(): void {
    if (this.busy()) return;
    this.clearMessages();
    this.showErrors.set(false);
    this.email.set(this.sentEmail());
    this.phase.set('email');
    this.focusHeading.set(true);
  }

  private showSent(noticeKey: string): void {
    this.noticeKey.set(noticeKey);
    this.phase.set('sent');
    this.focusHeading.set(true);
  }

  private send(settle: (outcome: SendOutcome) => void): void {
    const address = this.sentEmail();
    this.clearMessages();
    this.busy.set(true);
    this.authApi.forgotPassword({ email: address }).subscribe({
      next: () => {
        this.busy.set(false);
        this.recordSent(address);
        settle('sent');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        // Never show the raw message: it can carry the API URL or a developer string.
        const outcome = outcomeOf(classifyForgotFailure(err));
        const retryAfter = retryAfterSeconds(err);
        if (outcome === 'sent') this.recordSent(address);
        else if (outcome === 'alreadySent') this.recordAlreadySent(address);
        else if (outcome === 'tooManyRequests' && retryAfter !== null) {
          this.setWaits(address, { retryAt: Date.now() + retryAfter * 1000 });
          settle('rateLimited');
          return;
        }
        settle(outcome);
      },
    });
  }

  private recordSent(address: string): void {
    this.setWaits(address, { resendAt: Date.now() + RESEND_WAIT_MS });
  }

  /**
   * The backend's window is still open. Without a send of our own to count from, wait the whole
   * window, so Resend never opens before the backend does; after our countdown ran out, the
   * clocks only drifted, so a short wait is enough.
   */
  private recordAlreadySent(address: string): void {
    const now = Date.now();
    const { resendAt } = this.waitsOf(address);
    if (resendAt > now) return;
    this.setWaits(address, { resendAt: now + (resendAt ? DRIFT_WAIT_MS : RESEND_WAIT_MS) });
  }

  private waitsOf(address: string): Waits {
    return this.waits().get(addressKey(address)) ?? NO_WAITS;
  }

  private setWaits(address: string, change: Partial<Waits>): void {
    const key = addressKey(address);
    const next = new Map(this.waits());
    next.set(key, { ...(next.get(key) ?? NO_WAITS), ...change });
    this.waits.set(next);
    this.startClock();
  }

  private startClock(): void {
    this.now.set(Date.now());
    if (this.timer !== null || !this.isBrowser) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Moves the clock on, and stops it once no address is waiting any more. */
  private tick(): void {
    const now = Date.now();
    this.now.set(now);
    const waiting = [...this.waits().values()].some(
      ({ resendAt, retryAt }) => Math.max(resendAt, retryAt) > now,
    );
    if (!waiting) this.stopClock();
  }

  private stopClock(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private clearMessages(): void {
    this.errorKey.set('');
    this.noticeKey.set('');
  }
}

/** A 404 naming no account is answered like a sent link, so the page never confirms one exists. */
function outcomeOf(kind: ForgotFailureKind): SendOutcome {
  return kind === 'noAccount' ? 'sent' : kind;
}

/** Addresses share a wait whatever their surrounding space or letter case. */
function addressKey(address: string): string {
  return address.trim().toLowerCase();
}

function isolate(text: string): string {
  return FIRST_STRONG_ISOLATE + text + POP_DIRECTIONAL_ISOLATE;
}

/** A wait as a clock, rounded up to the second: `9:59`, or `1:00:00` from an hour up. */
function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  if (!hours) return `${minutes}:${seconds}`;
  return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
}
