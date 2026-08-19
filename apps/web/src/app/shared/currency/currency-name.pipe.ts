import { Pipe, PipeTransform } from '@angular/core';
import { currencyName } from '@util/currencies';

/**
 * ISO-4217 currency code → the currency's full name, or the code itself when unknown
 * (blank/null falls back to the default currency's name). Used as the hover `title`
 * tooltip beside a symbol rendered by {@link CurrencySymbolPipe}.
 *
 * `{{ 'USD' | currencyName }}` → "US Dollar" · `[title]="listing.currency | currencyName"`.
 */
@Pipe({ name: 'currencyName', standalone: true })
export class CurrencyNamePipe implements PipeTransform {
  transform(code: string | null | undefined): string {
    return currencyName(code);
  }
}
