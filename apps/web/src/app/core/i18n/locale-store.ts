import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PreferenceSource } from '@core/preferences/currency-preference';
import { TranslocoService } from '@jsverse/transloco';
import {
  DEFAULT_LOCALE,
  dirFor,
  isLocaleCode,
  localeFor,
  splitLocale,
  withLocale,
} from './locales';

/**
 * Remembered choice. A *preference*, not the source of truth — the URL is that, because
 * search engines and shared links only see the URL. This is what decides where to send a
 * returning visitor who arrives at an unprefixed path.
 */
const KEY = 'hh.locale';

/**
 * The language the visitor picked for themselves, or absent if they never have.
 *
 * Separate from {@link KEY} for the same reason the currency's is: the location guess writes
 * the same key, so the value alone cannot distinguish a guess from a decision — and without
 * that distinction the guess wins every reload.
 *
 * Holds the code rather than a flag, so the record says both that a choice was made and what
 * it was. Retire a language and the stored code stops validating, which reads as no choice
 * and returns the visitor to the guess instead of pinning them to a language this app no
 * longer serves.
 */
const CHOSEN_KEY = 'hh.locale.chosen';

/**
 * The active language, and everything that has to change with it.
 *
 * Switching a language is three separate updates that must not drift apart: the strings
 * Transloco serves, the `lang` attribute assistive technology and search engines read,
 * and the `dir` attribute that decides whether the page lays out start-to-right. Doing
 * them in one place is what stops a page ending up in Arabic with an English `lang`, or
 * in Urdu still laid out start-to-right.
 */
@Injectable({ providedIn: 'root' })
export class LocaleStore {
  private readonly transloco = inject(TranslocoService);
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);

  private readonly _active = signal(DEFAULT_LOCALE);
  readonly active = this._active.asReadonly();

  /** `'rtl'` for Urdu and Arabic. Templates read this for direction-aware bits. */
  readonly dir = signal<'ltr' | 'rtl'>('ltr');

  /**
   * The visitor's remembered choice, or null.
   *
   * Read rather than applied: the caller decides what to do with it, because a stored
   * preference must never quietly override a locale the visitor explicitly asked for by
   * following a link.
   */
  storedPreference(): string | null {
    if (typeof localStorage === 'undefined') return null; // SSR
    const v = localStorage.getItem(KEY);
    return isLocaleCode(v) ? v : null;
  }

  /**
   * Points everything at `code`. Safe on the server: `DOCUMENT` exists there, so `lang`
   * and `dir` are written into the server-rendered HTML rather than being applied only
   * after hydration — which is what a crawler and a slow connection actually see.
   */
  apply(code: string, remember = false): void {
    const locale = localeFor(isLocaleCode(code) ? code : DEFAULT_LOCALE);
    this._active.set(locale.code);
    this.dir.set(locale.dir);
    this.transloco.setActiveLang(locale.code);

    const html = this.doc.documentElement;
    html.setAttribute('lang', locale.code);
    html.setAttribute('dir', locale.dir);

    if (remember && typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, locale.code);
    }
  }

  /**
   * Switches language and takes the URL with it.
   *
   * The URL is what makes a language real — it is what gets shared, bookmarked and
   * indexed — so a control that only swapped the strings would leave the address bar
   * lying about the page. Lives here rather than in any one switcher because more than
   * one control offers this choice, and they must not drift.
   */
  switchTo(code: string, source: PreferenceSource = 'user'): void {
    // Recorded before the early return below. Picking the language you are already reading
    // is still a decision, and the one it most needs to survive: someone in Germany who
    // wants English gets `en` while already on `en`, and if that went unrecorded the
    // location guess would move them off it on the very next load.
    if (source === 'user') this.remember(code);

    if (code === this._active()) return;

    // Remember before navigating: `LocaleSync` reads the URL on the resulting
    // NavigationEnd, and the stored value is what survives to the next visit.
    this.apply(code, true);

    const url = this.router.url;
    const { path } = splitLocale(url);
    const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    void this.router.navigateByUrl(withLocale(code, path) + query);
  }

  /**
   * The language the visitor picked themselves, or null if they never have.
   *
   * Validated on the way out, like {@link storedPreference}: a code this app no longer
   * serves is not a choice it can honour, so it reads as none.
   */
  userChoice(): string | null {
    if (typeof localStorage === 'undefined') return null; // SSR
    const v = localStorage.getItem(CHOSEN_KEY);
    return isLocaleCode(v) ? v : null;
  }

  /** Stores the code under both keys — the applied value, and the decision behind it. */
  private remember(code: string): void {
    if (typeof localStorage === 'undefined') return;
    const locale = localeFor(isLocaleCode(code) ? code : DEFAULT_LOCALE);
    localStorage.setItem(KEY, locale.code);
    localStorage.setItem(CHOSEN_KEY, locale.code);
  }

  /**
   * For a "reset to site default" control, and for tests.
   *
   * Drops the decision alongside the value, so a visitor who resets is handed back to the
   * location guess rather than being pinned to the default with nothing able to move them.
   */
  forget(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(KEY);
    localStorage.removeItem(CHOSEN_KEY);
  }
}

export { KEY as LOCALE_STORAGE_KEY, CHOSEN_KEY as LOCALE_CHOSEN_STORAGE_KEY, dirFor };
