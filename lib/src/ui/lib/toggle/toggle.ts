import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';

/**
 * Switch toggle. `<hh-toggle [(checked)]="notify" />`
 *
 * `describedBy` is the id of a hint the switch should announce with its state, set as
 * `aria-describedby` on the switch button itself, which the host element can't carry for it:
 * `<hh-toggle [(checked)]="renew" describedBy="renew-hint" />`.
 *
 * The switch has no text of its own, so it needs a name: a wrapping `<label>`, or `label` (the
 * visible text beside it, set as `aria-label`), or `labelledBy` (the id of that text). A guard
 * spec (`apps/web/src/app/core/toggle-names.spec.ts`) fails on any use with none of the three (Trello #218).
 */
@Component({
  selector: 'hh-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label()"
      [attr.aria-labelledby]="labelledBy()"
      [attr.aria-describedby]="describedBy()"
      [disabled]="disabled()"
      (click)="toggle()"
      [class]="trackClasses()"
    >
      <span [class]="knobClasses()"></span>
    </button>
  `,
  host: { class: 'inline-block' },
})
export class Toggle {
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly describedBy = input<string | null>(null);
  readonly label = input<string | null>(null);
  readonly labelledBy = input<string | null>(null);

  protected toggle(): void {
    if (!this.disabled()) this.checked.set(!this.checked());
  }

  protected readonly trackClasses = computed(() => {
    const base =
      'relative block h-6 w-11 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50';
    return `${base} ${this.checked() ? 'bg-brand-500' : 'bg-ink-200'}`;
  });

  protected readonly knobClasses = computed(
    () =>
      `absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-all ${
        this.checked() ? 'end-0.5' : 'start-0.5'
      }`,
  );
}
