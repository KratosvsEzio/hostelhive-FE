import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

/** Error state with a Retry action. `<hh-error-state (retry)="reload()" />` */
@Component({
  selector: 'hh-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (networkError()) {
      <i class="ti ti-wifi-off text-3xl text-ink-400" aria-hidden="true"></i>
      <p class="mt-2 text-sm font-medium text-ink-800">{{ title() || "Can't connect to server" }}</p>
      <p class="mt-1 text-xs text-ink-500">{{ message() || 'Check your internet connection and try again.' }}</p>
    } @else {
      <i class="ti ti-alert-triangle text-3xl text-danger" aria-hidden="true"></i>
      <p class="mt-2 text-sm font-medium text-ink-800">{{ title() || 'Something went wrong' }}</p>
      @if (message()) {
        <p class="mt-1 text-xs text-ink-500">{{ message() }}</p>
      }
    }
    @if (showRetry()) {
      <button
        type="button"
        class="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
        (click)="retry.emit()"
      >
        <i class="ti ti-refresh" aria-hidden="true"></i>{{ retryLabel() }}
      </button>
    }
  `,
  host: {
    '[class]': "networkError()"
      + " ? 'flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-ink-200 bg-ink-50 px-4 text-center'"
      + " : 'flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-danger/20 bg-danger/5 px-4 text-center'",
  },
})
export class ErrorState {
  readonly title = input('');
  readonly message = input('');
  readonly showRetry = input(true);
  readonly retryLabel = input('Retry');
  readonly networkError = input(false);
  readonly retry = output<void>();
}
