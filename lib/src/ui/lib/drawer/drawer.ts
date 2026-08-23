import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Right-hand slide-over panel — the app's standard shell for a form that should not take
 * the user off the page they are on.
 *
 * Extracted because three features (tenants, invoices, rooms) had each copied the same
 * backdrop / panel / header markup, and the fourth (team) hand-rolled an inline dashed
 * panel instead — which is why adding staff looked unlike every other form in the console.
 *
 * Handles the parts that are easy to omit when copying by hand: the backdrop closes on
 * click but a click inside does not bubble out to it, Escape closes from anywhere in the
 * panel, and focus moves into the panel on open so the keyboard lands somewhere useful.
 *
 * ```html
 * <hh-drawer heading="Add staff" (closed)="close()">
 *   …fields…
 *   <ng-container footer>
 *     <button hh-button variant="text" (click)="close()">Cancel</button>
 *     <button hh-button color="primary" (click)="save()">Save</button>
 *   </ng-container>
 * </hh-drawer>
 * ```
 */
@Component({
  selector: 'hh-drawer',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="fixed inset-0 z-[60] flex justify-end bg-ink-900/30"
      (click)="closed.emit()"
      (keydown.escape)="closed.emit()"
      tabindex="-1"
    >
      <div
        #panel
        class="flex h-full w-full flex-col bg-white shadow-pill"
        [class]="widthClass()"
        (click)="$event.stopPropagation()"
        (keydown)="$event.stopPropagation()"
        (keydown.escape)="closed.emit()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="heading()"
        tabindex="-1"
      >
        <div class="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 class="font-display text-lg font-semibold text-ink-900">{{ heading() }}</h2>
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-full text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
            (click)="closed.emit()"
            [attr.aria-label]="'a11y.close' | transloco"
          >
            <i class="ti ti-x text-lg" aria-hidden="true"></i>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-5">
          <ng-content />
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-4">
          <ng-content select="[footer]" />
        </div>
      </div>
    </div>
  `,
})
export class Drawer {
  readonly heading = input.required<string>();
  /** Panel width. Defaults to the `max-w-lg` the existing drawers use. */
  readonly widthClass = input('max-w-lg');
  /** Backdrop click, Escape, or the close button. The parent decides whether to close. */
  readonly closed = output<void>();

  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    // Reactive rather than afterNextRender: the panel renders a tick after construction
    // when the drawer is behind an @if, and a one-shot hook would fire before it exists.
    afterRenderEffect(() => this.panelEl()?.nativeElement.focus());
  }
}
