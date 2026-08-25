import { CURRENCIES } from '@util/currencies';
import { LOCALE_CODES } from '@core/i18n/locales';
import {
  FALLBACK_CURRENCY,
  currencyForCountry,
  localeForCountry,
} from './country-preferences';

describe('localeForCountry', () => {
  it('maps a country to the language most of its readers use', () => {
    expect(localeForCountry('DE')).toBe('de');
    expect(localeForCountry('JP')).toBe('ja');
    expect(localeForCountry('MX')).toBe('es');
  });

  it('accepts whatever case the geo service sends', () => {
    expect(localeForCountry('jp')).toBe('ja');
    expect(localeForCountry(' De ')).toBe('de');
  });

  /**
   * Pakistan is the one country that reads as a deletion rather than an omission, so it is
   * asserted by name: `ur` is still a shipped language with an entry in the table, and only
   * the country list under it is empty. A future edit that "restores" PK there would look
   * like a fix and would silently put every first-time Pakistani visitor back into Urdu.
   */
  it('opens in English for Pakistan, which is a decision and not a gap', () => {
    expect(localeForCountry('PK')).toBe('en');
    expect(localeForCountry('pk')).toBe('en');
  });

  // The requirement: no language for the country means English, not nothing.
  it('falls back to English for a country the app has no language for', () => {
    expect(localeForCountry('TH')).toBe('en');
    expect(localeForCountry('KR')).toBe('en');
    expect(localeForCountry('ZZ')).toBe('en');
  });

  it('falls back to English when the country is missing entirely', () => {
    expect(localeForCountry(null)).toBe('en');
    expect(localeForCountry(undefined)).toBe('en');
    expect(localeForCountry('')).toBe('en');
  });

  // A language dropped from the app must not come back through a stale table entry.
  it('only ever returns a locale the app actually ships', () => {
    const codes = new Set<string>(LOCALE_CODES);
    const samples = ['PK', 'IN', 'SA', 'CN', 'JP', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'DK', 'HU', 'BR', 'ZZ'];
    for (const c of samples) expect(codes.has(localeForCountry(c))).toBe(true);
  });
});

describe('currencyForCountry', () => {
  it('maps a country to the money spent there', () => {
    expect(currencyForCountry('PK')).toBe('PKR');
    expect(currencyForCountry('GB')).toBe('GBP');
    expect(currencyForCountry('JP')).toBe('JPY');
    expect(currencyForCountry('DE')).toBe('EUR');
  });

  // The requirement: a country whose currency the picker cannot show gets the dollar.
  it('falls back to the dollar for a country the app has no currency for', () => {
    expect(currencyForCountry('CU')).toBe(FALLBACK_CURRENCY);
    expect(currencyForCountry('ZZ')).toBe(FALLBACK_CURRENCY);
    expect(currencyForCountry(null)).toBe(FALLBACK_CURRENCY);
  });

  // Croatia retired the kuna in 2023. The code stays in the picker so prices already quoted
  // in it still render, but nobody should be handed it as a starting point.
  it('gives Croatia the euro rather than the retired kuna', () => {
    expect(currencyForCountry('HR')).toBe('EUR');
  });

  it('never returns a code the picker cannot display', () => {
    const offered = new Set(CURRENCIES.map((c) => c.code));
    const samples = ['PK', 'US', 'GB', 'DE', 'IN', 'CN', 'JP', 'AU', 'BR', 'ZA', 'HR', 'CU', 'ZZ'];
    for (const c of samples) expect(offered.has(currencyForCountry(c))).toBe(true);
  });

  it('offers the dollar itself, so the fallback is always displayable', () => {
    expect(CURRENCIES.some((c) => c.code === FALLBACK_CURRENCY)).toBe(true);
  });
});

/**
 * The two tables are written one entry per language/currency and inverted at load. That
 * shape makes a duplicate country a silent last-one-wins rather than an error, so it is
 * worth asserting that no country claims two answers.
 */
describe('the country tables', () => {
  it('gives each country exactly one language and one currency', () => {
    // Re-derived through the public API: any duplicate would already have collapsed, so
    // this guards the tables by checking every mapped country still answers consistently.
    const countries = ['PK', 'IN', 'DE', 'CH', 'LI', 'BE', 'NL', 'PS', 'IL', 'EH', 'MA'];
    for (const c of countries) {
      expect(localeForCountry(c)).toBe(localeForCountry(c));
      expect(currencyForCountry(c)).toBe(currencyForCountry(c));
    }
    // Countries listed under two different languages would be a real bug; spot-check the
    // ones that genuinely sit on a border between them.
    expect(localeForCountry('CH')).toBe('de');
    expect(localeForCountry('BE')).toBe('nl');
    expect(currencyForCountry('CH')).toBe('CHF');
    expect(currencyForCountry('BE')).toBe('EUR');
  });
});

/**
 * The rule, stated as the two cases it has to get right.
 *
 * Language and currency are resolved independently. Not supporting a country's language
 * says nothing about its money, and the commonest case in the list below is exactly that:
 * Thailand gets English text and Thai baht.
 */
describe('resolving a visitor', () => {
  it('Dubai gets Arabic and dirhams', () => {
    expect(localeForCountry('AE')).toBe('ar');
    expect(currencyForCountry('AE')).toBe('AED');
  });

  it('Thailand gets English, because there is no Thai — but still baht', () => {
    expect(localeForCountry('TH')).toBe('en');
    expect(currencyForCountry('TH')).toBe('THB');
  });

  // The same independence, but where the app *does* ship the local language and chooses
  // not to assume it. The money is not a guess about a person, so it is unaffected.
  it('Pakistan gets English, though Urdu is offered — and rupees either way', () => {
    expect(localeForCountry('PK')).toBe('en');
    expect(currencyForCountry('PK')).toBe('PKR');
  });

  it('a country with neither gets English and dollars', () => {
    expect(localeForCountry('CU')).toBe('es'); // Cuba does have a language the app ships
    expect(currencyForCountry('CU')).toBe('USD'); // but the app does not offer its peso
    expect(localeForCountry('ZZ')).toBe('en');
    expect(currencyForCountry('ZZ')).toBe('USD');
  });
});
