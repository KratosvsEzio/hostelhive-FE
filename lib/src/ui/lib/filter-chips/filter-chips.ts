import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface FilterChipOption {
  label: string;
  value: string;
}

@Component({
  selector: 'hh-filter-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      @for (tab of (tabs() ?? []); track tab.value) {
        <button
          type="button"
          [class]="chipClass(tab.value)"
          (click)="activeChange.emit(tab.value)"
        >{{ tab.label }}</button>
      }
    </div>
  `,
})
export class FilterChips {
  readonly tabs = input<FilterChipOption[] | undefined>([]);
  readonly active = input('');
  readonly activeChange = output<string>();

  protected chipClass(value: string): string {
    const base = 'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition';
    return this.active() === value
      ? `${base} bg-ink-900 text-white`
      : `${base} border border-ink-200 bg-white text-ink-600 hover:bg-surface`;
  }
}
