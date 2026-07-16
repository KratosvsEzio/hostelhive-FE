import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/** Airbnb-style filter pill. `<button hh-chip [active]="true">Wi-Fi</button>` */
@Component({
  selector: 'button[hh-chip]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: {
    '[class]': 'classes()',
    '[attr.role]': '"checkbox"',
    '[attr.aria-checked]': 'active()',
  },
})
export class Chip {
  readonly active = input(false);

  protected readonly classes = computed(() => {
    const base =
      'inline-flex h-[34px] shrink-0 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-full ' +
      'px-3.5 text-[12px] font-medium transition-all duration-200 ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-1';
    return this.active()
      ? `${base} border border-brand-500 bg-brand-500 text-white shadow-sm`
      : `${base} border border-ink-200 bg-white text-ink-700 hover:border-ink-900 hover:shadow-sm`;
  });
}
