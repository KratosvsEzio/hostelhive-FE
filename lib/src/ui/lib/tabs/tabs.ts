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
    class: 'grid rounded-xl bg-surface p-1 font-medium',
    '[class]': 'hostTextClass()',
    '[style.grid-template-columns]': 'cols()',
    role: 'tablist',
  },
})
export class Tabs {
  readonly tabs = input<TabItem[]>([]);
  readonly active = model('');
  readonly size = input<'xxs' | 'xs' | 'sm'>('sm');

  protected readonly cols = computed(
    () => `repeat(${this.tabs().length || 1}, minmax(0, 1fr))`,
  );

  protected readonly hostTextClass = computed(() => {
    const s = this.size();
    return s === 'xxs' ? 'text-[10px]' : s === 'xs' ? 'text-xs' : 'text-sm';
  });

  protected btnClass(value: string): string {
    const pad = this.size() === 'xxs' ? 'px-2 py-0.5' : 'px-3 py-1.5';
    const base = `min-w-0 truncate rounded-lg ${pad} transition`;
    return value === this.active()
      ? `${base} bg-white text-ink-900 shadow-card`
      : `${base} text-ink-500 hover:text-ink-800`;
  }
}
