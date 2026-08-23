import { Injectable, signal } from '@angular/core';
import { DEFAULT_CURRENCY_CODE, isCurrencyCode } from '@util/currencies';

/**
 * Remembered choice, same shape as the locale's. Not the source of truth for any price
 * that already exists — a listing is priced in whatever its host chose, and no preference
 * changes that.
 */
const KEY = 'hh.currency';

/**
 * The visitor's preferred currency.
 *
 * Governs what a **new** priced thing starts out as — today that is a hostel the host is
 * creating. It deliberately does NOT restate existing prices: converting PKR 15,000 into
 * dollars needs exchange rates, and nothing in this app has any. Showing a converted
 * figure without them would mean inventing one, which is worse than showing the real
 * currency plainly.
 *
 * Kept out of `LocaleStore` because the two are genuinely independent — plenty of people
 * read the site in Urdu and price in dollars, and folding them together would force a
 * choice neither of them implies.
 */
@Injectable({ providedIn: 'root' })
export class CurrencyPreference {
  private readonly _code = signal(DEFAULT_CURRENCY_CODE);

  /** The preferred ISO-4217 code. Always a currency the app knows. */
  readonly code = this._code.asReadonly();

  constructor() {
    const stored = this.storedPreference();
    if (stored) this._code.set(stored);
  }

  /**
   * The remembered choice, or null.
   *
   * Validated on the way out: what is in `localStorage` was written by a previous version
   * of this app and can name a currency this one no longer lists, so an unknown code is
   * treated as no preference rather than being handed on as a choice.
   */
  storedPreference(): string | null {
    if (typeof localStorage === 'undefined') return null; // SSR
    const v = localStorage.getItem(KEY);
    return isCurrencyCode(v) ? v : null;
  }

  /** Sets and remembers the preference. Ignores a code the app does not know. */
  set(code: string): void {
    if (!isCurrencyCode(code)) return;
    this._code.set(code);
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, code);
  }

  /** Back to the app default, forgetting the stored choice. */
  forget(): void {
    this._code.set(DEFAULT_CURRENCY_CODE);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
  }
}

export { KEY as CURRENCY_STORAGE_KEY };
