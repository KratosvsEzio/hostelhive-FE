import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Button } from '@hostelhive/ui';
import {
  AccountConfirmedNotSignedIn,
  AuthService,
  SessionStore,
} from '@core/auth';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';
import { Logo } from '@core/brand/logo';

type Phase = 'verifying' | 'confirmed' | 'error';

/**
 * Email-confirmation landing — the target of the "Confirm My Account" link
 * (`/confirm_invitation?token=…`). It immediately POSTs the one-time token to
 * `/api/user/confirm_invitation`; on success the returned JWT signs the user in (persisted to
 * localStorage via the session store) and we redirect to the landing page.
 *
 * Two failures are told apart: the link itself failing (a recoverable error), and the account
 * being confirmed but signing in not finishing — then the link is spent, so the page says the
 * account is confirmed and points to log in, or home if the previous account was put back.
 *
 * The verify call runs inside `afterNextRender` (browser only) so the one-time token is not
 * spent during SSR and then re-submitted on hydration.
 */
@Component({
  selector: 'hh-confirm-invitation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo, RouterLink, LocaleLink, Button, TranslocoPipe],
  templateUrl: './confirm-invitation.html',
})
export class ConfirmInvitation {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly phase = signal<Phase>('verifying');
  /** Transloco key of the error message shown in the `error` phase. */
  protected readonly messageKey = signal('');
  /** Set when a failed sign-in put the previously signed-in account back. */
  protected readonly signedInUser = this.session.user;

  constructor() {
    // Browser-only: don't spend the one-time token during SSR and then again on hydration.
    afterNextRender(() => this.confirm());
  }

  private confirm(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.fail('authConfirmInvitation.linkIsMissingItsToken');
      return;
    }
    this.auth.confirmInvitation(token).subscribe({
      next: () => void this.router.navigateByUrl('/'), // signed in → landing page
      error: (err: unknown) => this.handleError(err),
    });
  }

  private handleError(err: unknown): void {
    if (err instanceof AccountConfirmedNotSignedIn) {
      this.phase.set('confirmed');
      return;
    }
    // Never show the raw message: it can carry the API URL or a developer string.
    const status = (err as { status?: unknown } | null)?.status;
    this.fail(
      status === 0
        ? 'authConfirmInvitation.cannotReachTheServer'
        : 'authConfirmInvitation.linkIsInvalidOrExpired',
    );
  }

  private fail(messageKey: string): void {
    this.messageKey.set(messageKey);
    this.phase.set('error');
  }
}
