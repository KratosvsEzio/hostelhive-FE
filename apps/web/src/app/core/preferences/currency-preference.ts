import { Injectable, signal } from '@angular/core';
import { DEFAULT_CURRENCY_CODE, isCurrencyCode } from '@util/currencies';

/**
 * Remembered choice, same shape as the locale's. Not the source of truth for any price
 * that already exists — a listing is priced in whatever its host chose, and no preference
 * changes that.
 */
const KEY = 'hh.currency';

/**
 * The code the visitor picked for themselves, or absent if they never have.
 *
 * Separate from {@link KEY} because the value alone cannot say where it came from: the
 * location guess writes the same key, so without this a guess and a decision are the same
 * record and the guess wins every reload. {@link KEY} is still written either way — it is
 * what a returning visitor starts on before the lookup answers.
 *
 * Holds the code rather than a flag so the record is self-contained. A flag would only
 * assert *that* a choice was made and leave {@link KEY} to say what it was — two facts that
 * can drift apart, and one of them meaningless on its own. It also makes the choice
 * validatable: retire a currency and the stored code stops being one this app knows, which
 * reads as no choice and hands the visitor back to the guess, rather than pinning them to
 * something the picker can no longer show.
 */
const CHOSEN_KEY = 'hh.currency.chosen';

/** Who is setting the preference: the visitor, or something guessing on their behalf. */
export type PreferenceSource = 'user' | 'auto';

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

  /**
   * Sets and remembers the preference. Ignores a code the app does not know.
   *
   * `source` defaults to `'user'` so every control that offers this choice records a
   * decision without having to say so; only the location guess passes `'auto'`.
   */
  set(code: string, source: PreferenceSource = 'user'): void {
    if (!isCurrencyCode(code)) return;
    this._code.set(code);
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(KEY, code);
    if (source === 'user') localStorage.setItem(CHOSEN_KEY, code);
  }

  /**
   * The currency the visitor picked themselves, or null if they never have.
   *
   * Validated on the way out, like {@link storedPreference}: a code this app no longer
   * lists is not a choice it can honour, so it reads as none.
   */
  userChoice(): string | null {
    if (typeof localStorage === 'undefined') return null; // SSR
    const v = localStorage.getItem(CHOSEN_KEY);
    return isCurrencyCode(v) ? v : null;
  }

  /**
   * Back to the app default, forgetting the stored choice.
   *
   * Drops the decision too, so a visitor who resets is handed back to the location guess
   * rather than being left on the default with nothing allowed to move them off it.
   */
  forget(): void {
    this._code.set(DEFAULT_CURRENCY_CODE);
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(KEY);
    localStorage.removeItem(CHOSEN_KEY);
  }
}

export { KEY as CURRENCY_STORAGE_KEY, CHOSEN_KEY as CURRENCY_CHOSEN_STORAGE_KEY };
