import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Button, Input } from '@hostelhive/ui';
import { AuthApi } from '@services';
import { NotificationService } from '@core/notification.service';
import { finalize } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-account-security',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Input, TranslocoPipe],
  templateUrl: './security.html',
})
export class AccountSecurity {
  private readonly authApi = inject(AuthApi);
  private readonly notifications = inject(NotificationService);

  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly saving = signal(false);

  protected readonly mismatch = computed(
    () =>
      this.newPassword().length > 0 &&
      this.confirmPassword().length > 0 &&
      this.newPassword() !== this.confirmPassword(),
  );

  protected save(): void {
    if (this.newPassword().length < 8) {
      this.notifications.error('Password too short', 'New password must be at least 8 characters.');
      return;
    }
    if (this.mismatch()) {
      this.notifications.error('Passwords do not match', 'Please make sure both password fields are identical.');
      return;
    }

    this.saving.set(true);
    this.authApi
      .changePassword({
        current_password: this.currentPassword(),
        new_password: this.newPassword(),
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.notifications.success('Password updated', 'Your password has been changed successfully.');
          this.currentPassword.set('');
          this.newPassword.set('');
          this.confirmPassword.set('');
        },
        error: (err) => {
          this.notifications.error('Couldn\'t update password', err?.message ?? 'Something went wrong.');
        },
      });
  }
}
