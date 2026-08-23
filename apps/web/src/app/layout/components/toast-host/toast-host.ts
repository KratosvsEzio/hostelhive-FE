import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NotificationService, ToastKind } from '@core/notification.service';
import { Button } from '@hostelhive/ui';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Renders the {@link NotificationService} toast stack — a fixed, top-anchored column that
 * floats above all chrome (z-100) and never intercepts clicks except on the toasts
 * themselves (`pointer-events-none` wrapper, `pointer-events-auto` cards). Mounted once at
 * the app root so it shows on every route, seeker or console.
 */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [Button, TranslocoPipe],
  templateUrl: './toast-host.html',
  styleUrl: './toast-host.scss',
})
export class ToastHost {
  protected readonly notifications = inject(NotificationService);

  protected icon(kind: ToastKind): string {
    return kind === 'error'
      ? 'ti-alert-triangle'
      : kind === 'success'
        ? 'ti-circle-check'
        : 'ti-info-circle';
  }

  protected iconWrap(kind: ToastKind): string {
    return kind === 'error'
      ? 'bg-danger/10 text-danger'
      : kind === 'success'
        ? 'bg-ok/10 text-ok'
        : 'bg-brand-50 text-brand-600';
  }
}
