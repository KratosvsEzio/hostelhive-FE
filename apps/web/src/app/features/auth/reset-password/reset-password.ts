import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
  WritableSignal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Button, Input, Container } from '@hostelhive/ui';
import { AuthApi } from '@services';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';
import { Logo } from '@core/brand/logo';
import { classifyResetFailure, ResetFailureKind } from './reset-failure';

type Phase = 'form' | 'done';

/** Failures that end the link for good, so the form gives way to a panel. */
type DeadLinkKind = Extract<ResetFailureKind, 'linkInvalid' | 'linkExpired' | 'accountNotResettable'>;

/** Failures the user can retry from the form. */
type RetryableKind = Exclude<ResetFailureKind, DeadLinkKind>;

/** What replaces the form: a missing token, or a link the server turned down. */
type Panel = 'missingToken' | DeadLinkKind;

const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

const LINK_PANEL_COPY: Record<Exclude<Panel, 'accountNotResettable'>, { title: string; body: string }> = {
  missingToken: {
    title: 'authResetPassword.invalidResetLink',
    body: 'authResetPassword.thisPasswordResetLinkIs',
  },
  linkInvalid: {
    title: 'authResetPassword.linkInvalidTitle',
    body: 'authResetPassword.linkInvalidBody',
  },
  linkExpired: {
    title: 'authResetPassword.linkExpiredTitle',
    body: 'authResetPassword.linkExpiredBody',
  },
};

const INLINE_ERROR_KEYS: Record<RetryableKind, string> = {
  passwordRejected: 'authResetPassword.passwordRejected',
  network: 'authResetPassword.cannotReachTheServer',
  unknown: 'authResetPassword.somethingWentWrong',
};

/**
 * Password reset landing — the target of the emailed reset link (`/auth/reset-password?token=…`).
 *
 * A link the server rejects for good (used, expired, or an account that cannot reset by email)
 * replaces the form with a panel saying so; anything else is shown inline and can be retried.
 * Every message is a translation key — the server's own wording is never shown.
 */
@Component({
  selector: 'hh-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo, Container, RouterLink, LocaleLink, Button, Input, TranslocoPipe],
  templateUrl: './reset-password.html',
})
export class ResetPassword {
  private readonly authApi = inject(AuthApi);
  private readonly route = inject(ActivatedRoute);

  private readonly panelHeading = viewChild<ElementRef<HTMLElement>>('panelHeading');

  protected readonly token = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('token') ?? '')),
    { initialValue: this.route.snapshot.queryParamMap.get('token') ?? '' },
  );

  // Everything about one attempt starts over when a new link (token) arrives.
  protected readonly phase = this.perToken<Phase>('form');
  protected readonly busy = this.perToken(false);
  protected readonly showErrors = this.perToken(false);
  /** Transloco key of the inline error above the submit button; empty when there is none. */
  protected readonly errorKey = this.perToken('');
  protected readonly newPassword = this.perToken('');
  protected readonly confirmNewPassword = this.perToken('');
  /** The link the server turned down, keyed by its token so a fresh link gets the form back. */
  protected readonly rejected = signal<{ token: string; kind: DeadLinkKind } | null>(null);

  protected readonly panel = computed<Panel | null>(() => {
    if (!this.token()) return 'missingToken';
    const rejected = this.rejected();
    return rejected?.token === this.token() ? rejected.kind : null;
  });
  protected readonly linkPanelCopy = computed(() => {
    const panel = this.panel();
    return panel && panel !== 'accountNotResettable' ? LINK_PANEL_COPY[panel] : null;
  });

  protected readonly newPasswordError = computed(() =>
    PASSWORD_RE.test(this.newPassword()) ? '' : 'authResetPassword.min8Characters1Uppercase',
  );
  protected readonly confirmNewPasswordError = computed(() => {
    if (!this.confirmNewPassword()) return 'authResetPassword.confirmYourNewPassword';
    return this.confirmNewPassword() === this.newPassword()
      ? ''
      : 'authResetPassword.passwordsDoNotMatch';
  });

  protected readonly isValid = computed(
    () => !this.newPasswordError() && !this.confirmNewPasswordError(),
  );

  constructor() {
    // Moves focus to a rejection panel's heading when it replaces the form; never runs on the server.
    afterRenderEffect(() => {
      const heading = this.panelHeading();
      if (heading && this.panel() !== 'missingToken') heading.nativeElement.focus();
    });
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.showErrors.set(true);
    this.errorKey.set('');
    if (!this.isValid()) return;

    const token = this.token();
    this.busy.set(true);
    // A reply for a link the page has since moved on from must not touch the new link's form.
    this.authApi.resetPassword({ token, new_password: this.newPassword() }).subscribe({
      next: () => {
        if (token !== this.token()) return;
        this.busy.set(false);
        this.phase.set('done');
      },
      error: (err: unknown) => {
        if (token !== this.token()) return;
        this.busy.set(false);
        this.fail(token, classifyResetFailure(err));
      },
    });
  }

  /** A writable signal that goes back to `initial` whenever the token changes. */
  private perToken<T>(initial: T): WritableSignal<T> {
    return linkedSignal({ source: this.token, computation: () => initial });
  }

  private fail(token: string, kind: ResetFailureKind): void {
    if (isDeadLink(kind)) {
      this.rejected.set({ token, kind });
      return;
    }
    this.errorKey.set(INLINE_ERROR_KEYS[kind]);
  }
}

function isDeadLink(kind: ResetFailureKind): kind is DeadLinkKind {
  return kind === 'linkInvalid' || kind === 'linkExpired' || kind === 'accountNotResettable';
}
