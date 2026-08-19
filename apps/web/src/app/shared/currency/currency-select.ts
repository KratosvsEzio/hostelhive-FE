import { ChangeDetectionStrategy, Component, computed, model, signal } from '@angular/core';
import { Dropdown } from '@hostelhive/ui';
import { CURRENCY_OPTIONS } from '@util/currencies';

/**
 * Shareable currency picker — a searchable dropdown of ISO-4217 currencies labelled
 * "Name - CODE (symbol)". Two-way bound to the selected ISO code, which is what the API
 * payload carries.
 *
 * `hh-dropdown` doesn't self-filter; it emits `(searchChange)` and re-renders whatever
 * `[options]` we hand back. So the query is held here and the list is filtered against the
 * full label ("US Dollar - USD ($)") — which already carries both the name and the code —
 * so typing either "dollar" or "usd" narrows the list.
 *
 * `<hh-currency-select [(value)]="currency" />`
 */
@Component({
  selector: 'hh-currency-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown],
  template: `
    <hh-dropdown
      variant="field"
      placeholder="Select currency"
      [options]="filteredOptions()"
      [value]="value()"
      [searchable]="true"
      searchPlaceholder="Search name or code…"
      emptyLabel="No currency matches."
      (valueChange)="onChange($event)"
      (searchChange)="query.set($event)"
    />
  `,
})
export class CurrencySelect {
  /** Selected ISO-4217 code (two-way bindable via `[(value)]`). */
  readonly value = model<string | null>(null);

  protected readonly query = signal('');

  private readonly options = CURRENCY_OPTIONS;

  /** Case-insensitive match on the label, which contains both the name and the ISO code. */
  protected readonly filteredOptions = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.options;
    return this.options.filter((o) => o.label.toLowerCase().includes(q));
  });

  protected onChange(v: string | string[] | null): void {
    if (typeof v === 'string' && v) this.value.set(v);
  }
}
