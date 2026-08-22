import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Button } from '@hostelhive/ui';
import { AuthService } from '@core/auth';
import { ApiError } from '@hostelhive/data-access';
import { LocaleLink } from '@core/i18n/locale-link';

type Phase = 'verifying' | 'error';

/**
 * Email-confirmation landing — the target of the "Confirm My Account" link
 * (`/confirm_invitation?token=…`). It immediately POSTs the one-time token to
 * `/api/user/confirm_invitation`; on success the returned JWT signs the user in (persisted to
 * localStorage via the session store) and we redirect to the landing page. On failure it shows
 * a recoverable error.
 *
 * The verify call runs inside `afterNextRender` (browser only) so the one-time token is not
 * spent during SSR and then re-submitted on hydration.
 */
@Component({
  selector: 'hh-confirm-invitation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, Button],
  templateUrl: './confirm-invitation.html',
})
export class ConfirmInvitation {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly phase = signal<Phase>('verifying');
  protected readonly message = signal('');

  constructor() {
    // Browser-only: don't spend the one-time token during SSR and then again on hydration.
    afterNextRender(() => this.confirm());
  }

  private confirm(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.fail(
        'This confirmation link is missing its token. Please open the button from your email.',
      );
      return;
    }
    this.auth.confirmInvitation(token).subscribe({
      next: () => void this.router.navigateByUrl('/'), // signed in → landing page
      error: (err: ApiError) =>
        this.fail(
          err?.status === 0
            ? 'Cannot reach the server — please try again in a moment.'
            : err?.message ||
                'This confirmation link is invalid or has expired.',
        ),
    });
  }

  private fail(message: string): void {
    this.message.set(message);
    this.phase.set('error');
  }
}
