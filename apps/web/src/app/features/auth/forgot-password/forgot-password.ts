import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button, Input, Container } from '@hostelhive/ui';
import { AuthApi } from '@services';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';
import { Logo } from '@core/brand/logo';
import { classifyForgotFailure, ForgotFailureKind } from './forgot-failure';

type Phase = 'email' | 'sent';

/** Failures that keep the user where they are, with a message to act on. */
type FailureKind = Exclude<ForgotFailureKind, 'noAccount' | 'alreadySent'>;

/** How one request ended: a link went out, one was already out, or it failed. */
type SendOutcome = 'sent' | 'alreadySent' | FailureKind;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
 */
@Component({
  selector: 'hh-forgot-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo, Container, RouterLink, LocaleLink, Button, Input, TranslocoPipe],
  templateUrl: './forgot-password.html',
})
export class ForgotPassword {
  private readonly authApi = inject(AuthApi);

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

  protected readonly emailError = computed(() =>
    EMAIL_RE.test(this.email().trim()) ? '' : KEY.enterAValidEmail,
  );
  protected readonly visibleEmailError = computed(() =>
    this.showErrors() ? this.emailError() : '',
  );
  protected readonly isolatedEmail = computed(
    () => FIRST_STRONG_ISOLATE + this.sentEmail() + POP_DIRECTIONAL_ISOLATE,
  );

  constructor() {
    // A panel swap removes the control the user was on, so the new heading takes focus once.
    afterRenderEffect(() => {
      const heading = this.heading();
      if (!heading || !this.focusHeading()) return;
      heading.nativeElement.focus();
      this.focusHeading.set(false);
    });
  }

  protected editEmail(value: string): void {
    this.email.set(value);
    this.errorKey.set('');
  }

  protected submitEmail(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    this.showErrors.set(true);
    this.errorKey.set('');
    if (this.emailError()) return;

    this.sentEmail.set(this.email().trim());
    this.send((outcome) => {
      if (outcome === 'sent' || outcome === 'alreadySent') {
        this.showSent(outcome === 'alreadySent' ? KEY.alreadySent : '');
        return;
      }
      this.errorKey.set(FAILURE_KEY[outcome]);
    });
  }

  protected resend(): void {
    if (this.busy()) return;
    this.send((outcome) => {
      if (outcome === 'sent') this.noticeKey.set(KEY.sentAnother);
      else if (outcome === 'alreadySent') this.noticeKey.set(KEY.alreadySent);
      else this.errorKey.set(FAILURE_KEY[outcome]);
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
    this.clearMessages();
    this.busy.set(true);
    this.authApi.forgotPassword({ email: this.sentEmail() }).subscribe({
      next: () => {
        this.busy.set(false);
        settle('sent');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        // Never show the raw message: it can carry the API URL or a developer string.
        settle(outcomeOf(classifyForgotFailure(err)));
      },
    });
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
