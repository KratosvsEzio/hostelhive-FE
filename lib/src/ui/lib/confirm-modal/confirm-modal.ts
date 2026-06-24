import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { Button, ButtonColor } from '../button/button';

export type ConfirmModalTone = 'danger' | 'warn' | 'ok' | 'info';

const TONE_ICON_CLASS: Record<ConfirmModalTone, string> = {
  danger: 'text-danger',
  warn: 'text-warn',
  ok: 'text-ok',
  info: 'text-brand-500',
};

const TONE_BG_CLASS: Record<ConfirmModalTone, string> = {
  danger: 'bg-danger/10',
  warn: 'bg-warn/10',
  ok: 'bg-ok/10',
  info: 'bg-brand-50',
};

let _id = 0;

/**
 * Generic confirmation / alert modal.
 *
 * Rendered by the parent via `@if (open)` — this component has no internal open state.
 * Body content is projected via `<ng-content>` so parents can use rich template syntax.
 *
 * Outputs: `(confirm)` and `(cancel)`. Both fire when the respective button is clicked or
 * the backdrop is clicked (cancel). The parent is responsible for closing the modal.
 *
 * @example
 * <hh-confirm-modal
 *   title="Delete item?"
 *   icon="ti-trash"
 *   tone="danger"
 *   confirmLabel="Delete"
 *   confirmColor="danger"
 *   (confirm)="onConfirm()"
 *   (cancel)="open = false"
 * >
 *   This action cannot be undone.
 * </hh-confirm-modal>
 */
@Component({
  selector: 'hh-confirm-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="titleId"
    >
      <div
        class="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
        (click)="cancel.emit()"
      ></div>
      <div class="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        @if (icon()) {
          <div
            class="mb-4 flex h-12 w-12 items-center justify-center rounded-full"
            [class]="bgClass()"
          >
            <i
              class="ti text-xl"
              [class]="[icon(), iconClass()]"
              aria-hidden="true"
            ></i>
          </div>
        }
        <h2
          [id]="titleId"
          class="mb-1 font-display text-base font-semibold text-ink-900"
        >
          {{ title() }}
        </h2>
        <div class="mb-5 text-sm text-ink-500"><ng-content /></div>
        <div class="flex gap-3">
          @if (cancelLabel()) {
            <button
              hh-button
              variant="text"
              class="flex-1"
              (click)="cancel.emit()"
            >
              {{ cancelLabel() }}
            </button>
          }
          <button
            hh-button
            [color]="confirmColor()"
            [class]="cancelLabel() ? 'flex-1' : 'w-full'"
            (click)="confirm.emit()"
          >
            {{ confirmLabel() }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmModal {
  readonly title = input.required<string>();
  /** Tabler icon class, e.g. `'ti-trash'`. Omit to skip the icon circle. */
  readonly icon = input('');
  readonly tone = input<ConfirmModalTone>('danger');
  readonly confirmLabel = input('Confirm');
  /** Set to empty string to hide the cancel button (single-action info dialogs). */
  readonly cancelLabel = input('Cancel');
  readonly confirmColor = input<ButtonColor>('primary');

  readonly confirm = output<void>();
  // A semantic modal output, not the native <dialog> "cancel" event.
  // eslint-disable-next-line @angular-eslint/no-output-native
  readonly cancel = output<void>();

  protected readonly titleId = `hh-confirm-${++_id}`;
  protected readonly iconClass = () => TONE_ICON_CLASS[this.tone()];
  protected readonly bgClass = () => TONE_BG_CLASS[this.tone()];
}
