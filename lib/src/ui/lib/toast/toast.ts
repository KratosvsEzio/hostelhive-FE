import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

export type ToastTone = 'dark' | 'success' | 'error' | 'info';

const CONTAINERS: Record<ToastTone, string> = {
  dark: 'bg-ink-900 text-white shadow-pill',
  success: 'bg-tint-mint/70 text-ok',
  error: 'border border-danger/20 bg-danger/5 text-ink-800',
  info: 'border border-ink-200 bg-white text-ink-800 shadow-card',
};

const ICONS: Record<ToastTone, string> = {
  dark: 'ti-circle-check text-ok',
  success: 'ti-circle-check text-ok',
  error: 'ti-alert-triangle text-danger',
  info: 'ti-info-circle text-brand-500',
};

/** Toast / inline banner. `<hh-toast tone="success" dismissible>Saved</hh-toast>` */
@Component({
  selector: 'hh-toast',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <i class="ti shrink-0" [class]="iconClass()" aria-hidden="true"></i>
    <span class="flex-1"><ng-content /></span>
    @if (dismissible()) {
      <button
        type="button"
        class="shrink-0 opacity-60 transition hover:opacity-100"
        (click)="dismissed.emit()"
        [attr.aria-label]="'a11y.dismiss' | transloco"
      >
        <i class="ti ti-x"></i>
      </button>
    }
  `,
  host: { '[class]': 'classes()', role: 'status' },
})
export class Toast {
  readonly tone = input<ToastTone>('dark');
  readonly dismissible = input(false);
  readonly dismissed = output<void>();

  protected readonly iconClass = computed(() => ICONS[this.tone()]);
  protected readonly classes = computed(
    () =>
      `flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${CONTAINERS[this.tone()]}`,
  );
}
