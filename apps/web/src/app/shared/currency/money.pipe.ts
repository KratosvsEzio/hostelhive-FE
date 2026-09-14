import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocaleStore } from '@core/i18n/locale-store';

/**
 * A price amount, grouped for the language being read, with decimals only when the amount
 * actually has any.
 *
 * `{{ 10000 | money }}` → "10,000" in en, "10.000" in de · `{{ 12.5 | money }}` → "12.50"
 *
 * **Why decimals follow the amount.** Two formats were in use side by side, visible in one
 * viewport: the booking rail's "From" went through `toLocaleString()` and rendered
 * **Rs 1,200**, while every other price used `number: '1.2-2'` and rendered **Rs 10,000.00**.
 * Nobody quotes PKR in paisa, and those four characters were not free — at 375px they pushed
 * the room card's price onto a second line, splitting "/" from "night".
 *
 * The obvious fix, a fixed `'1.0-0'`, is wrong here: the app carries 76 currencies and
 * `currencies.ts` holds no minor-unit data, so it would render $12.50 as **$13**. Keying on
 * the amount needs no table and gets both right.
 *
 * **Why `Intl` and `LocaleStore` rather than Angular's `formatNumber` and `LOCALE_ID`.**
 * Nothing in this app provides `LOCALE_ID` and `registerLocaleData` is never called, so it
 * is permanently `'en-US'` — which rendered **"Rs 10,000"** on the German page, where a
 * reader parses that as ten. Angular's formatter cannot be pointed at `de` without bundling
 * its locale data; `Intl` already has every locale the browser does, at no cost.
 *
 * Pure, so it re-runs when its input changes rather than on every check. A language switch
 * goes through `LocaleStore.switchTo`, which navigates — the component is rebuilt and every
 * price reformatted. Prices do not silently keep the old grouping.
 */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  private readonly locale = inject(LocaleStore);

  transform(value: number | string | null | undefined): string {
    const raw = typeof value === 'string' ? Number(value) : value;
    if (raw === null || raw === undefined || !Number.isFinite(raw)) return '';

    // Rounded before asking whether it is whole. `basket.total()` is a floating-point sum, so
    // three lines of 2,766.67 arrive as 8300.000000000002 — which is not an integer, and
    // rendered as "8,300.00" directly beneath line items reading "8,300". Exactly the
    // inconsistency this pipe exists to remove.
    const n = Math.round(raw * 100) / 100;
    const digits = Number.isInteger(n) ? 0 : 2;

    return new Intl.NumberFormat(this.locale.active(), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  }
}
