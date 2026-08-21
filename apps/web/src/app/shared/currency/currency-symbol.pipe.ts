import { Pipe, PipeTransform } from '@angular/core';
import { currencySymbol } from '@util/currencies';

/**
 * ISO-4217 currency code → the currency's symbol, or the code itself when the currency is
 * unknown (blank/null falls back to the default currency's symbol).
 *
 * `{{ 'USD' | currencySym }}` → "$" · `{{ 'CHF' | currencySym }}` → "CHF" ·
 * `{{ 'XYZ' | currencySym }}` → "XYZ" · `{{ listing.currency | currencySym }} {{ price }}`.
 */
@Pipe({ name: 'currencySym', standalone: true })
export class CurrencySymbolPipe implements PipeTransform {
  transform(code: string | null | undefined): string {
    return currencySymbol(code);
  }
}
