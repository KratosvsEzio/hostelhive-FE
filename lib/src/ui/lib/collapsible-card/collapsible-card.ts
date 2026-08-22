import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
} from '@angular/core';

/**
 * A card whose body collapses behind its heading.
 *
 * Open by default — these are form sections, and a host arriving at a page of collapsed
 * headings has to click five times before seeing anything. Collapsing is for getting a long
 * form out of the way once you have read it, not for hiding it on arrival.
 *
 * The heading row is a real `<button>` so it is keyboard-reachable and announces its state;
 * `aria-expanded` carries that to a screen reader. Project anything that belongs beside the
 * heading — a status pill, a count, an inline error — with the `aside` attribute:
 *
 * ```html
 * <hh-collapsible-card heading="Photos">
 *   <span aside class="text-ink-400">· 8</span>
 *   …body…
 * </hh-collapsible-card>
 * ```
 *
 * The body stays in the DOM when closed rather than being destroyed, so half-typed input and
 * scroll position survive a collapse, and a native form submit still sees every field.
 */
@Component({
  selector: 'hh-collapsible-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 text-start"
      [attr.aria-expanded]="open()"
      (click)="open.set(!open())"
    >
      <span class="flex min-w-0 flex-wrap items-center gap-2">
        <span class="font-display text-base font-semibold text-ink-900">{{ heading() }}</span>
        <ng-content select="[aside]" />
      </span>
      <i
        class="ti shrink-0 text-lg text-ink-400 transition-transform"
        [class]="open() ? 'ti-chevron-up' : 'ti-chevron-down'"
        aria-hidden="true"
      ></i>
    </button>

    <div [hidden]="!open()" class="mt-3">
      <ng-content />
    </div>
  `,
  host: { class: 'block rounded-2xl bg-white p-5 shadow-card' },
})
export class CollapsibleCard {
  readonly heading = input.required<string>();
  /** Two-way: `[(open)]`. Starts expanded. */
  readonly open = model(true);
}
