import type { DropdownOption } from '@hostelhive/ui';

/** One ISO-4217 currency: name, 3-letter code, and symbol ('' when the currency has none). */
export interface Currency {
  code: string;
  name: string;
  symbol: string;
}

/**
 * ISO-4217 currencies with their display symbol. `symbol` is '' where the currency has no
 * distinct glyph (the code doubles as the symbol) — the label helper then omits the parens.
 */
export const CURRENCIES: readonly Currency[] = [
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' },
  { code: 'NPR', name: 'Nepalese Rupee', symbol: 'Rs' },
  { code: 'AFN', name: 'Afghan Afghani', symbol: '؋' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei' },
  { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'ILS', name: 'Israeli New Shekel', symbol: '₪' },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵' },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.' },
  { code: 'DZD', name: 'Algerian Dinar', symbol: 'د.ج' },
  { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼' },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك' },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: '.د.ب' },
  { code: 'OMR', name: 'Omani Rial', symbol: '﷼' },
  { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا' },
  { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل' },
  { code: 'IQD', name: 'Iraqi Dinar', symbol: 'ع.د' },
  { code: 'IRR', name: 'Iranian Rial', symbol: '﷼' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  { code: 'ARS', name: 'Argentine Peso', symbol: '$' },
  { code: 'CLP', name: 'Chilean Peso', symbol: '$' },
  { code: 'COP', name: 'Colombian Peso', symbol: '$' },
  { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/' },
  { code: 'UYU', name: 'Uruguayan Peso', symbol: '$U' },
  { code: 'BOB', name: 'Bolivian Boliviano', symbol: 'Bs' },
  { code: 'ISK', name: 'Icelandic Krona', symbol: 'kr' },
  { code: 'HRK', name: 'Croatian Kuna', symbol: 'kn' },
  { code: 'RSD', name: 'Serbian Dinar', symbol: 'дин.' },
  { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K' },
  { code: 'KHR', name: 'Cambodian Riel', symbol: '៛' },
  { code: 'LAK', name: 'Lao Kip', symbol: '₭' },
  { code: 'MNT', name: 'Mongolian Tugrik', symbol: '₮' },
  { code: 'KZT', name: 'Kazakhstani Tenge', symbol: '₸' },
  { code: 'UZS', name: 'Uzbekistani Som', symbol: "so'm" },
  { code: 'GEL', name: 'Georgian Lari', symbol: '₾' },
  { code: 'AZN', name: 'Azerbaijani Manat', symbol: '₼' },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br' },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' },
];

/** "US Dollar - USD ($)", or "Swiss Franc - CHF" when the symbol equals the code / is blank. */
export function formatCurrencyLabel(c: Currency): string {
  const showSymbol = c.symbol && c.symbol !== c.code;
  return showSymbol ? `${c.name} - ${c.code} (${c.symbol})` : `${c.name} - ${c.code}`;
}

/** Dropdown options for the currency picker, keyed by ISO code. */
export const CURRENCY_OPTIONS: DropdownOption[] = CURRENCIES.map((c) => ({
  value: c.code,
  label: formatCurrencyLabel(c),
}));

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

/** Default currency for hostels with none set (the app's primary market). */
export const DEFAULT_CURRENCY_CODE = 'PKR';

/**
 * The symbol to prefix prices with for `code`:
 *  - a known currency → its glyph (or the code itself when it has no distinct glyph),
 *  - an unknown but present code → the code as-is (so nothing is silently dropped),
 *  - blank/null → the default currency's symbol (existing listings quote in it).
 */
export function currencySymbol(code: string | null | undefined): string {
  if (!code) return BY_CODE.get(DEFAULT_CURRENCY_CODE)?.symbol ?? 'Rs';
  const c = BY_CODE.get(code);
  if (c) return c.symbol || c.code;
  return code;
}

/**
 * The full display name for `code` ("US Dollar"), used as the hover tooltip beside the
 * symbol. Falls back to the default currency's name when blank, and to the raw code for an
 * unknown one — mirroring {@link currencySymbol} so the tooltip never renders empty.
 */
export function currencyName(code: string | null | undefined): string {
  if (!code) return BY_CODE.get(DEFAULT_CURRENCY_CODE)?.name ?? DEFAULT_CURRENCY_CODE;
  return BY_CODE.get(code)?.name ?? code;
}
