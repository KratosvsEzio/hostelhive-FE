import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button, Input } from '@hostelhive/ui';
import { AuthApi } from '@services';
import { ApiError } from '@hostelhive/data-access';
import { LocaleLink } from '@core/i18n/locale-link';

type Phase = 'email' | 'sent';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'hh-forgot-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, Button, Input],
  templateUrl: './forgot-password.html',
})
export class ForgotPassword {
  private readonly authApi = inject(AuthApi);

  protected readonly phase = signal<Phase>('email');
  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly error = signal('');
  protected readonly email = signal('');

  protected readonly emailError = computed(() =>
    EMAIL_RE.test(this.email().trim()) ? '' : 'Enter a valid email address.',
  );

  protected submitEmail(event: Event): void {
    event.preventDefault();
    this.showErrors.set(true);
    this.error.set('');
    if (this.emailError()) return;

    this.busy.set(true);
    this.authApi.forgotPassword({ email: this.email().trim() }).subscribe({
      next: () => {
        this.busy.set(false);
        this.phase.set('sent');
      },
      error: (err: ApiError) => this.fail(err),
    });
  }

  protected resend(): void {
    this.error.set('');
    this.busy.set(true);
    this.authApi.forgotPassword({ email: this.email().trim() }).subscribe({
      next: () => this.busy.set(false),
      error: (err: ApiError) => this.fail(err),
    });
  }

  private fail(err: ApiError): void {
    this.busy.set(false);
    this.error.set(
      err?.status === 0
        ? 'Cannot reach the server — is the API running?'
        : err?.message || 'Something went wrong. Please try again.',
    );
  }
}
