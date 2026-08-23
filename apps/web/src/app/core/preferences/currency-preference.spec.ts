import { TestBed } from '@angular/core/testing';
import { CURRENCY_STORAGE_KEY, CurrencyPreference } from './currency-preference';

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
});
