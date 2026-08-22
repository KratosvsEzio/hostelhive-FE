import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Button, Input, Container } from '@hostelhive/ui';
import { AuthApi } from '@services';
import { ApiError } from '@hostelhive/data-access';
import { LocaleLink } from '@core/i18n/locale-link';

type Phase = 'form' | 'done';

const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

@Component({
  selector: 'hh-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Container, RouterLink, LocaleLink, Button, Input],
  templateUrl: './reset-password.html',
})
export class ResetPassword {
  private readonly authApi = inject(AuthApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly token = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('token') ?? '')),
    { initialValue: this.route.snapshot.queryParamMap.get('token') ?? '' },
  );

  protected readonly phase = signal<Phase>('form');
  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly error = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmNewPassword = signal('');

  protected readonly newPasswordError = computed(() =>
    PASSWORD_RE.test(this.newPassword()) ? '' : 'Min 8 chars, 1 uppercase & 1 number.',
  );
  protected readonly confirmNewPasswordError = computed(() => {
    if (!this.confirmNewPassword()) return 'Please confirm your new password.';
    return this.confirmNewPassword() === this.newPassword() ? '' : 'Passwords do not match.';
  });

  protected readonly isValid = computed(
    () => !this.newPasswordError() && !this.confirmNewPasswordError(),
  );

  protected submit(event: Event): void {
    event.preventDefault();
    this.showErrors.set(true);
    this.error.set('');
    if (this.newPasswordError() || this.confirmNewPasswordError()) return;

    this.busy.set(true);
    this.authApi
      .resetPassword({ token: this.token(), new_password: this.newPassword() })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.phase.set('done');
        },
        error: (err: ApiError) => {
          this.busy.set(false);
          this.error.set(
            err?.status === 0
              ? 'Cannot reach the server — is the API running?'
              : err?.message || 'Something went wrong. Please try again.',
          );
        },
      });
  }
}
