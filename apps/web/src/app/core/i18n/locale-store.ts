import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { DEFAULT_LOCALE, dirFor, isLocaleCode, localeFor } from './locales';

/**
 * Remembered choice. A *preference*, not the source of truth — the URL is that, because
 * search engines and shared links only see the URL. This is what decides where to send a
 * returning visitor who arrives at an unprefixed path.
 */
const KEY = 'hh.locale';

/**
 * The active language, and everything that has to change with it.
 *
 * Switching a language is three separate updates that must not drift apart: the strings
 * Transloco serves, the `lang` attribute assistive technology and search engines read,
 * and the `dir` attribute that decides whether the page lays out left-to-right. Doing
 * them in one place is what stops a page ending up in Arabic with an English `lang`, or
 * in Urdu still laid out left-to-right.
 */
@Injectable({ providedIn: 'root' })
export class LocaleStore {
  private readonly transloco = inject(TranslocoService);
  private readonly doc = inject(DOCUMENT);

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

  /** For a "reset to site default" control, and for tests. */
  forget(): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
  }
}

export { KEY as LOCALE_STORAGE_KEY, dirFor };
