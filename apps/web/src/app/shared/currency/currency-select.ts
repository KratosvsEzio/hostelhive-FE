import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Dropdown, DropdownOption } from '@hostelhive/ui';
import { CURRENCIES, CURRENCY_OPTIONS } from '@util/currencies';

/**
 * Code-first labels, for a trigger too narrow to show "Pakistani Rupee - PKR (Rs)" whole.
 *
 * The name stays in the label so searching "dollar" still narrows the list — only the order
 * changes, so what survives truncation is the part that identifies the currency rather than
 * the part that describes it.
 */
const COMPACT_OPTIONS: DropdownOption[] = CURRENCIES.map((c) => ({
  value: c.code,
  label: `${c.code} (${c.symbol}) · ${c.name}`,
}));

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
  imports: [Dropdown, TranslocoPipe],
  template: `
    <hh-dropdown
      [variant]="variant()"
      [surface]="surface()"
      [size]="compact() ? 'sm' : 'md'"
      [placeholder]="'common.selectCurrency' | transloco"
      [options]="filteredOptions()"
      [value]="value()"
      [searchable]="true"
      [searchPlaceholder]="'currency.searchNameOrCode' | transloco"
      [emptyLabel]="'currency.noCurrencyMatches' | transloco"
      (valueChange)="onChange($event)"
      (searchChange)="query.set($event)"
    />
  `,
})
export class CurrencySelect {
  /** Selected ISO-4217 code (two-way bindable via `[(value)]`). */
  readonly value = model<string | null>(null);

  /**
   * Shorter control with code-first labels, for tight spots like the search map overlay.
   * The option set is unchanged — only the label order and the field height.
   */
  readonly compact = input(false);

  /**
   * Passed straight to the dropdown. `'field'` is the full-width form control this was
   * built for; `'pill'` is the inline chip the footer and filter bars want, where the
   * control sits in a row of its own rather than in a stack of labelled fields.
   */
  readonly variant = input<'field' | 'pill'>('field');

  /** Which surface the trigger sits on — see the dropdown's own `surface`. */
  readonly surface = input<'light' | 'dark'>('light');

  protected readonly query = signal('');

  private readonly options = computed(() =>
    this.compact() ? COMPACT_OPTIONS : CURRENCY_OPTIONS,
  );

  /** Case-insensitive match on the label, which contains both the name and the ISO code. */
  protected readonly filteredOptions = computed(() => {
    const all = this.options();
    const q = this.query().trim().toLowerCase();
    if (!q) return all;
    return all.filter((o) => o.label.toLowerCase().includes(q));
  });

  protected onChange(v: string | string[] | null): void {
    if (typeof v === 'string' && v) this.value.set(v);
  }
}
