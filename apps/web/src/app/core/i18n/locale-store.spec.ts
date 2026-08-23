import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import {
  LOCALE_CHOSEN_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
  LocaleStore,
} from './locale-store';

function store(): LocaleStore {
  return TestBed.inject(LocaleStore);
}

describe('LocaleStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideI18nTesting()],
    });
  });

  it('records a switch as the visitor’s own decision', () => {
    const s = store();
    s.switchTo('de');

    expect(s.userChoice()).toBe('de');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('de');
  });

  it('does not record an automatic switch as a decision', () => {
    const s = store();
    s.switchTo('de', 'auto');

    expect(s.active()).toBe('de');
    expect(s.userChoice()).toBeNull();
  });

  /**
   * The case the whole feature turns on.
   *
   * Someone in Germany who wants English picks `en` while already reading `en`, so the
   * switch is a no-op for everything except the record of having made it. Miss that and the
   * location guess moves them back to German on the next load — the exact complaint the
   * choice was meant to settle.
   */
  it('records picking the language already active', () => {
    const s = store();
    expect(s.active()).toBe('en');

    s.switchTo('en');

    expect(s.userChoice()).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('does not record an automatic no-op switch', () => {
    const s = store();
    s.switchTo('en', 'auto');

    expect(s.userChoice()).toBeNull();
  });

  it('reports no decision when only a value was stored', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ur');

    expect(store().userChoice()).toBeNull();
  });

  /**
   * Retiring a language must not strand whoever had chosen it.
   *
   * The stored code is validated on the way out, so one this app no longer serves reads as
   * no choice and the location guess takes over again — rather than pinning the visitor to
   * a language nothing can render.
   */
  it('treats a language it no longer serves as no choice', () => {
    localStorage.setItem(LOCALE_CHOSEN_STORAGE_KEY, 'xx');

    expect(store().userChoice()).toBeNull();
  });

  // A visitor who resets wants the app guessing again, not to be pinned to whatever they
  // last had with nothing able to move them off it.
  it('drops the decision when forgotten', () => {
    const s = store();
    s.switchTo('de');
    s.forget();

    expect(s.userChoice()).toBeNull();
    expect(localStorage.getItem(LOCALE_CHOSEN_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it('ignores a code it does not recognise', () => {
    const s = store();
    s.switchTo('zz');

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });
});
