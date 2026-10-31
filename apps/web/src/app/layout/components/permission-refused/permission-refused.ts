import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ErrorState } from '@hostelhive/ui';
import { SessionStore } from '@core/auth/session-store';
import { pageNotAllowedKey } from '@core/host-access/host-access';

/**
 * What a host page shows in place of its content when the server refused the signed-in user a
 * permission their role lacks. No subscription grants it and a retry would be refused again, so
 * it offers neither: the owner is pointed at HostelHive support, staff at the owner.
 */
@Component({
  selector: 'hh-permission-refused',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ErrorState, TranslocoPipe],
  host: { class: 'block' },
  template: `
    <hh-error-state
      [title]="'coreForbidden.accessBlocked' | transloco"
      [message]="messageKey() | transloco"
      [showRetry]="false"
    />
  `,
})
export class PermissionRefused {
  private readonly session = inject(SessionStore);

  protected readonly messageKey = computed(() =>
    pageNotAllowedKey({ owner: this.session.hasRole('host') }),
  );
}
