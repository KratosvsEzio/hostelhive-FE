import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';

export interface TabItem {
  label: string;
  value: string;
}

/** Segmented tab control. `<hh-tabs [tabs]="tabs" [(active)]="view" />` */
@Component({
  selector: 'hh-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (tab of tabs(); track tab.value) {
      <button
        type="button"
        (click)="active.set(tab.value)"
        [class]="btnClass(tab.value)"
      >
        {{ tab.label }}
      </button>
    }
  `,
  host: {
    class: 'grid rounded-xl bg-surface p-1 text-sm font-medium',
    '[style.grid-template-columns]': 'cols()',
    role: 'tablist',
  },
})
export class Tabs {
  readonly tabs = input<TabItem[]>([]);
  readonly active = model('');

  protected readonly cols = computed(
    () => `repeat(${this.tabs().length || 1}, minmax(0, 1fr))`,
  );

  protected btnClass(value: string): string {
    const base = 'rounded-lg py-2 transition';
    return value === this.active()
      ? `${base} bg-white text-ink-900 shadow-card`
      : `${base} text-ink-500 hover:text-ink-800`;
  }
}
