import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Button } from '@hostelhive/ui';

@Component({
  selector: 'app-account-security',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  templateUrl: './security.html',
})
export class AccountSecurity {
  protected readonly twoFa = signal(false);
  protected readonly saved = signal(false);
  protected save(): void {
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2000);
  }
}
