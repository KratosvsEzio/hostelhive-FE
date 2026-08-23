import { DEFAULT_LOCALE, isLocaleCode } from '@core/i18n/locales';
import { isCurrencyCode } from '@util/currencies';

/**
 * What a country implies about the language and the money.
 *
 * Both tables are written the readable way round — one entry per language or currency,
 * listing the countries that use it — and inverted once at module load. A flat
 * country-to-value map would be four hundred lines nobody could review, and the mistake it
 * invites (the same country listed twice, under two languages) is one this shape makes
 * impossible to write.
 *
 * Neither table tries to be complete. Anything unlisted falls back, and the fallbacks are
 * the point rather than a failure: English and the dollar are what the app should do when
 * it does not know, which is most of the world.
 */

/** ISO-4217 for a country we do not recognise, or whose currency the app does not offer. */
export const FALLBACK_CURRENCY = 'USD';

/**
 * Countries per supported language, in the app's own locale codes.
 *
 * Only the fourteen languages the app actually ships. A country is listed under the
 * language most of its people read, not every language spoken there — Belgium is Dutch
 * here because most Belgians read Dutch, and Switzerland is German for the same reason.
 * Getting that wrong costs a reader one click on a switcher that is always in the header.
 */
const COUNTRIES_BY_LOCALE: Record<string, readonly string[]> = {
  ur: ['PK'],
  hi: ['IN'],
  ar: [
    'SA', 'AE', 'EG', 'DZ', 'MA', 'IQ', 'SD', 'SY', 'YE', 'JO', 'TN', 'LY',
    'LB', 'PS', 'OM', 'KW', 'QA', 'BH', 'MR', 'DJ', 'SO', 'KM', 'EH',
  ],
  zh: ['CN', 'TW', 'HK', 'MO', 'SG'],
  ja: ['JP'],
  de: ['DE', 'AT', 'CH', 'LI'],
  fr: [
    'FR', 'MC', 'LU', 'SN', 'CI', 'ML', 'BF', 'NE', 'TG', 'BJ', 'GA', 'CG',
    'CD', 'CM', 'MG', 'HT',
  ],
  es: [
    'ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO',
    'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'GQ',
  ],
  it: ['IT', 'SM', 'VA'],
  nl: ['NL', 'BE', 'SR', 'AW', 'CW'],
  sv: ['SE'],
  da: ['DK', 'GL', 'FO'],
  hu: ['HU'],
};

/**
 * Countries per currency, limited to the codes the picker offers.
 *
 * A country whose currency the app does not list is simply absent, which is what makes the
 * dollar fallback fall out of the lookup rather than needing a second check. Croatia sits
 * under the euro, not the kuna it retired in 2023 — HRK stays in the picker so prices
 * already quoted in it still render, but nobody should be handed it as a starting point.
 */
const COUNTRIES_BY_CURRENCY: Record<string, readonly string[]> = {
  PKR: ['PK'],
  USD: ['US', 'EC', 'SV', 'PA', 'TL', 'ZW', 'PW', 'MH', 'FM', 'VG', 'TC', 'BQ'],
  EUR: [
    'AT', 'BE', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT',
    'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES', 'HR', 'AD', 'MC', 'SM', 'VA',
    'ME', 'XK',
  ],
  GBP: ['GB', 'IM', 'JE', 'GG'],
  AED: ['AE'], SAR: ['SA'], INR: ['IN'], BDT: ['BD'], LKR: ['LK'], NPR: ['NP'],
  AFN: ['AF'], CNY: ['CN'], JPY: ['JP'], KRW: ['KR'], HKD: ['HK'], SGD: ['SG'],
  MYR: ['MY'], IDR: ['ID'], THB: ['TH'], VND: ['VN'], PHP: ['PH'], TWD: ['TW'],
  AUD: ['AU', 'NR', 'TV', 'KI', 'CC', 'CX', 'NF'],
  NZD: ['NZ', 'CK', 'NU', 'PN', 'TK'],
  CAD: ['CA'],
  CHF: ['CH', 'LI'],
  SEK: ['SE'],
  NOK: ['NO', 'SJ', 'BV'],
  DKK: ['DK', 'GL', 'FO'],
  PLN: ['PL'], CZK: ['CZ'], HUF: ['HU'], RON: ['RO'], BGN: ['BG'], RUB: ['RU'],
  UAH: ['UA'], TRY: ['TR'],
  ILS: ['IL', 'PS'],
  EGP: ['EG'],
  ZAR: ['ZA', 'LS', 'NA', 'SZ'],
  NGN: ['NG'], KES: ['KE'], GHS: ['GH'],
  MAD: ['MA', 'EH'],
  DZD: ['DZ'], TND: ['TN'], QAR: ['QA'], KWD: ['KW'], BHD: ['BH'], OMR: ['OM'],
  JOD: ['JO'], LBP: ['LB'], IQD: ['IQ'], IRR: ['IR'], BRL: ['BR'], MXN: ['MX'],
  ARS: ['AR'], CLP: ['CL'], COP: ['CO'], PEN: ['PE'], UYU: ['UY'], BOB: ['BO'],
  ISK: ['IS'], RSD: ['RS'], MMK: ['MM'], KHR: ['KH'], LAK: ['LA'], MNT: ['MN'],
  KZT: ['KZ'], UZS: ['UZ'], GEL: ['GE'], AZN: ['AZ'], ETB: ['ET'], TZS: ['TZ'],
  UGX: ['UG'],
};

function invert(byValue: Record<string, readonly string[]>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [value, countries] of Object.entries(byValue)) {
    for (const country of countries) out.set(country, value);
  }
  return out;
}

const LOCALE_BY_COUNTRY = invert(COUNTRIES_BY_LOCALE);
const CURRENCY_BY_COUNTRY = invert(COUNTRIES_BY_CURRENCY);

/** ISO-3166 alpha-2, however the geo service happened to case it. */
function normalise(country: string | null | undefined): string {
  return (country ?? '').trim().toUpperCase();
}

/**
 * The language to open in for a visitor in `country` — English when the app has none.
 *
 * The result is checked against the locales actually registered rather than trusted from
 * the table above, so a language removed from the app cannot be resurrected by a stale
 * entry here.
 */
export function localeForCountry(country: string | null | undefined): string {
  const code = LOCALE_BY_COUNTRY.get(normalise(country));
  return code && isLocaleCode(code) ? code : DEFAULT_LOCALE;
}

/**
 * The currency to price in for a visitor in `country` — the dollar when the app does not
 * offer theirs.
 *
 * Checked against the picker's own list for the same reason: this should never hand back a
 * code the settings page cannot display, which would leave a visitor unable to see, let
 * alone change, what they were given.
 */
export function currencyForCountry(country: string | null | undefined): string {
  const code = CURRENCY_BY_COUNTRY.get(normalise(country));
  return code && isCurrencyCode(code) ? code : FALLBACK_CURRENCY;
}
