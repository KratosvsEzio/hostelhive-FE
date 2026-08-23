import { TestBed } from '@angular/core/testing';
import {
  CURRENCY_CHOSEN_STORAGE_KEY,
  CURRENCY_STORAGE_KEY,
  CurrencyPreference,
} from './currency-preference';

/**
 * The store reads localStorage in its constructor, so every case sets the stored value
 * first and only then asks for the instance.
 */
function store(stored?: string): CurrencyPreference {
  if (stored !== undefined) localStorage.setItem(CURRENCY_STORAGE_KEY, stored);
  return TestBed.inject(CurrencyPreference);
}

describe('CurrencyPreference', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('defaults to the app currency when nothing is stored', () => {
    expect(store().code()).toBe('PKR');
  });

  it('starts from the remembered choice', () => {
    expect(store('USD').code()).toBe('USD');
  });

  // What is in localStorage was written by an earlier version of this app and can name a
  // currency this one no longer lists. Treating it as no preference beats handing a code
  // the picker cannot show to a form that will then submit it.
  it('ignores a stored code it does not recognise', () => {
    expect(store('XYZ').code()).toBe('PKR');
  });

  it('remembers a new choice', () => {
    const s = store();
    s.set('EUR');
    expect(s.code()).toBe('EUR');
    expect(localStorage.getItem(CURRENCY_STORAGE_KEY)).toBe('EUR');
  });

  it('refuses an unknown code rather than storing it', () => {
    const s = store('USD');
    s.set('NOPE');
    expect(s.code()).toBe('USD');
    expect(localStorage.getItem(CURRENCY_STORAGE_KEY)).toBe('USD');
  });

  it('returns to the default when forgotten', () => {
    const s = store('JPY');
    s.forget();
    expect(s.code()).toBe('PKR');
    expect(localStorage.getItem(CURRENCY_STORAGE_KEY)).toBeNull();
  });

  // Every currency the picker offers has to survive a round trip, or a host could choose
  // something on the settings page that silently fails to stick.
  it('accepts every currency the picker offers', () => {
    const s = store();
    for (const code of ['PKR', 'USD', 'GBP', 'AED', 'THB', 'UGX']) {
      s.set(code);
      expect(s.code()).toBe(code);
    }
  });

  // The location guess writes the same value key, so the value alone cannot say whether a
  // visitor decided or was guessed at. Only the flag separates them.
  it('records a pick as the visitor’s own decision', () => {
    const s = store();
    s.set('EUR');
    expect(s.userChoice()).toBe('EUR');
  });

  it('does not record an automatic set as a decision', () => {
    const s = store();
    s.set('EUR', 'auto');
    expect(s.code()).toBe('EUR');
    expect(s.userChoice()).toBeNull();
  });

  it('reports no decision when only a value was stored', () => {
    expect(store('USD').userChoice()).toBeNull();
  });

  // Retiring a currency must not strand whoever had chosen it: an unrecognised code reads
  // as no choice and hands the visitor back to the location guess.
  it('treats a currency it no longer lists as no choice', () => {
    localStorage.setItem(CURRENCY_CHOSEN_STORAGE_KEY, 'XYZ');

    expect(store().userChoice()).toBeNull();
  });

  // A visitor who resets wants the app guessing again, not to be pinned to the default.
  it('drops the decision when forgotten', () => {
    const s = store();
    s.set('JPY');
    s.forget();
    expect(s.userChoice()).toBeNull();
    expect(localStorage.getItem(CURRENCY_CHOSEN_STORAGE_KEY)).toBeNull();
  });
});
