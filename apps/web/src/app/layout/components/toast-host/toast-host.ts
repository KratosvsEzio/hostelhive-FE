import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NotificationService, ToastKind } from '@core/notification.service';
import { Button } from '@hostelhive/ui';
import { TranslocoService } from '@jsverse/transloco';

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
  imports: [Button],
  templateUrl: './toast-host.html',
  styleUrl: './toast-host.scss',
})
export class ToastHost {
  protected readonly notifications = inject(NotificationService);

  /**
   * The dismiss label as a signal rather than a `| transloco` pipe.
   *
   * That pipe is impure: it re-runs on every check and marks its view for another one. In
   * every other template that is unremarkable, but a toast is created *by* a failing API
   * call, so its first render happens inside the change detection the failure triggered —
   * and on the search page, where results are driven from `toObservable`, that pass was
   * already re-entrant. The pipe closed the loop and the tab locked up hard: no error, no
   * network, nothing to see. `selectTranslate` emits once per language and nothing more.
   */
  private readonly i18n = inject(TranslocoService);
  protected readonly dismissLabel = toSignal(
    this.i18n.selectTranslate<string>('a11y.dismissNotification'),
    { initialValue: '' },
  );

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
