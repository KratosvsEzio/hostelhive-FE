import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, ButtonColor } from '../button/button';

export type ConfirmModalTone = 'danger' | 'warn' | 'ok' | 'info';

/** How much room the body needs. `sm` is a question; `md` is a question with work in it. */
export type ConfirmModalSize = 'sm' | 'md';

const SIZE_CLASS: Record<ConfirmModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
};

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
  imports: [Button, TranslocoPipe],
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
      <div class="relative w-full rounded-2xl bg-white p-6 shadow-xl" [class]="sizeClass()">
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
          <!-- Shown unless a caller opts out with an explicit empty string. The guard was a
               plain truthiness test, which hid the button for an *unset* label too — so every
               dialog that did not name one rendered a lone confirm button, and the default
               label two lines below could never run. That fallback is the evidence: somebody
               wrote a default for a button that could not appear.

               The cost fell on exactly the dialogs that could least afford it. Nine of them
               asked "delete this permanently?" and offered one red Delete button and no way
               out but the backdrop — a dialog that only says yes. The four genuine alerts
               ("photo limit reached", "some required fields are missing") pass an empty label
               on purpose and still get a single button, which is what an alert wants. -->
          @if (cancelLabel() !== '') {
            <button
              hh-button
              variant="outlined"
              class="flex-1"
              (click)="cancel.emit()"
            >
              {{ cancelLabel() ?? ('common.cancel' | transloco) }}
            </button>
          }
          <button
            hh-button
            [color]="confirmColor()"
            [class]="cancelLabel() === '' ? 'w-full' : 'flex-1'"
            [disabled]="confirmDisabled()"
            (click)="confirm.emit()"
          >
            {{ confirmLabel() ?? ('common.confirm' | transloco) }}
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
  /**
   * Widens the panel for a body that carries controls rather than a sentence.
   *
   * Opt-in, so the dozen dialogs that ask a one-line question keep the narrow column that
   * makes them readable -- a 512px box around "Delete this photo?" is a worse dialog.
   */
  readonly size = input<ConfirmModalSize>('sm');
  readonly confirmLabel = input<string | undefined>(undefined);
  /** Set to empty string to hide the cancel button (single-action info dialogs). */
  readonly cancelLabel = input<string | undefined>(undefined);
  readonly confirmColor = input<ButtonColor>('primary');
  /**
   * Greys out the confirm while the dialog cannot act yet.
   *
   * For dialogs that ask a question before they can answer one -- still loading, or waiting
   * on a choice the body is asking for. Without it those render a live button that silently
   * does nothing, which reads as the dialog being broken rather than as not-yet.
   */
  readonly confirmDisabled = input(false);

  readonly confirm = output<void>();
  // A semantic modal output, not the native <dialog> "cancel" event.
  // eslint-disable-next-line @angular-eslint/no-output-native
  readonly cancel = output<void>();

  protected readonly titleId = `hh-confirm-${++_id}`;
  protected readonly iconClass = () => TONE_ICON_CLASS[this.tone()];
  protected readonly bgClass = () => TONE_BG_CLASS[this.tone()];
  protected readonly sizeClass = () => SIZE_CLASS[this.size()];
}
