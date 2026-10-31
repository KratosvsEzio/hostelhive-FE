import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ApiError } from '@hostelhive/data-access';
import { SessionStore } from '@core/auth/session-store';
import { isUnauthorized } from '@core/errors/is-unauthorized';
import { NotificationService } from '@core/notification.service';
import { API_ERROR_NOTIFIER } from '@core/tokens';
import { actionRefusalKey } from './host-access';

/** Reports one failed host write; see {@link injectActionFailureToast}. */
export type ActionFailureToast = (err: unknown) => void;

/**
 * The one toast for a host write sent with the global toast suppressed.
 *
 * A refusal for the plan or for a permission the signed-in user's role lacks
 * ({@link actionRefusalKey}) is worded in the user's language, for the owner or staff, pinned,
 * and never with the server's English. Every other failure gets exactly what the app-wide
 * notifier gives it, by calling that notifier, so its copy, its lifetime and its mute cannot
 * drift from the global toast. A 401 gets nothing: the sign-out speaks for it. Nothing shows
 * while the app mutes error toasts (`NotificationService.muteErrors`).
 *
 * Call in an injection context.
 */
export function injectActionFailureToast(): ActionFailureToast {
  const notifications = inject(NotificationService);
  const i18n = inject(TranslocoService);
  const session = inject(SessionStore);
  const notifyApiError = inject(API_ERROR_NOTIFIER, { optional: true });
  return (err) => {
    // The same hold the global toast honours: the app is already saying it some other way.
    if (notifications.errorsMuted) return;
    const key = actionRefusalKey(err, { owner: session.hasRole('host') });
    if (key) {
      notifications.show({ kind: 'error', title: i18n.translate<string>(key) }, 0);
      return;
    }
    if (!isUnauthorized(err) && err && typeof err === 'object') notifyApiError?.(err as ApiError);
  };
}
