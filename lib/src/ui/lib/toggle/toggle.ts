import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';

/** Switch toggle. `<hh-toggle [(checked)]="notify" />` */
@Component({
  selector: 'hh-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="checked()"
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
