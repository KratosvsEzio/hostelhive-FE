/**
 * What country a hostel is in implies what its clock says.
 *
 * A booking carries a check-in and a check-out instant, and "2pm" on a booking means 2pm at
 * the hostel — not 2pm wherever the guest happens to be browsing from. Somebody in London
 * booking a room in Lahore is agreeing to arrive at 2pm Lahore time, so the instant sent to
 * the server has to be resolved against the hostel's zone rather than the browser's.
 *
 * The hostel document has no timezone field — only `country`, `city` and a lat/lng. Latitude
 * and longitude would be the exact answer and need a geographic dataset to read; the country
 * is one string that is already there and is right everywhere except a handful of very wide
 * countries, which is the trade this table makes.
 *
 * Written the readable way round, one entry per zone listing the countries in it, and
 * inverted once at module load — the same shape as {@link COUNTRIES_BY_LOCALE} next door, for
 * the same reason: a flat country-to-zone map is hundreds of lines nobody reviews, and the
 * mistake it invites is the same country listed twice under two zones.
 *
 * Each country appears under both its ISO-3166 alpha-2 code and its English name, because the
 * field this is looked up by is typed into the hostel form and comes back as whatever was
 * typed. Keeping the two spellings on one line is what stops them drifting apart.
 */

/**
 * What an unrecognised country resolves to.
 *
 * UTC rather than the app's home zone. A wrong guess and a known-nothing both produce a time
 * that is off by hours, but only the wrong guess produces one that looks deliberate — and
 * `Z` at least reads as "unresolved" to anybody reading the record later.
 */
export const FALLBACK_TIME_ZONE = 'UTC';

/**
 * Countries per IANA zone.
 *
 * **Wide countries get their principal zone, not their only one.** The United States spans
 * six; a hostel's country alone cannot say which, so the entry is a statement about where
 * most of the country lives rather than a claim to be exact. Where that is not good enough,
 * the fix is a timezone on the hostel record, not a longer table.
 */
const COUNTRIES_BY_ZONE: Record<string, readonly string[]> = {
  // South and Central Asia — the app's home market.
  'Asia/Karachi': ['PK', 'Pakistan'],
  'Asia/Kolkata': ['IN', 'India'],
  'Asia/Dhaka': ['BD', 'Bangladesh'],
  'Asia/Kathmandu': ['NP', 'Nepal'],
  'Asia/Colombo': ['LK', 'Sri Lanka'],
  'Asia/Kabul': ['AF', 'Afghanistan'],
  'Asia/Thimphu': ['BT', 'Bhutan'],
  'Indian/Maldives': ['MV', 'Maldives'],

  // Middle East.
  'Asia/Dubai': ['AE', 'United Arab Emirates', 'UAE'],
  'Asia/Riyadh': ['SA', 'Saudi Arabia'],
  'Asia/Qatar': ['QA', 'Qatar'],
  'Asia/Kuwait': ['KW', 'Kuwait'],
  'Asia/Bahrain': ['BH', 'Bahrain'],
  'Asia/Muscat': ['OM', 'Oman'],
  'Asia/Amman': ['JO', 'Jordan'],
  'Asia/Beirut': ['LB', 'Lebanon'],
  'Asia/Damascus': ['SY', 'Syria'],
  'Asia/Baghdad': ['IQ', 'Iraq'],
  'Asia/Tehran': ['IR', 'Iran'],
  'Asia/Jerusalem': ['IL', 'Israel'],
  'Asia/Hebron': ['PS', 'Palestine'],
  'Asia/Istanbul': ['TR', 'Turkey', 'Türkiye'],

  // East and Southeast Asia.
  'Asia/Shanghai': ['CN', 'China'], // one civil zone nationwide, unusually for its width
  'Asia/Hong_Kong': ['HK', 'Hong Kong'],
  'Asia/Macau': ['MO', 'Macau'],
  'Asia/Taipei': ['TW', 'Taiwan'],
  'Asia/Tokyo': ['JP', 'Japan'],
  'Asia/Seoul': ['KR', 'South Korea'],
  'Asia/Singapore': ['SG', 'Singapore'],
  'Asia/Kuala_Lumpur': ['MY', 'Malaysia'],
  'Asia/Bangkok': ['TH', 'Thailand'],
  'Asia/Ho_Chi_Minh': ['VN', 'Vietnam'],
  'Asia/Jakarta': ['ID', 'Indonesia'], // western zone: Java and Sumatra
  'Asia/Manila': ['PH', 'Philippines'],
  'Asia/Phnom_Penh': ['KH', 'Cambodia'],
  'Asia/Vientiane': ['LA', 'Laos'],
  'Asia/Yangon': ['MM', 'Myanmar'],

  // Europe.
  'Europe/London': ['GB', 'United Kingdom', 'UK', 'England', 'Scotland', 'Wales'],
  'Europe/Dublin': ['IE', 'Ireland'],
  'Europe/Lisbon': ['PT', 'Portugal'], // mainland; the Azores are an hour behind
  'Europe/Madrid': ['ES', 'Spain'], // mainland; the Canaries are an hour behind
  'Europe/Paris': ['FR', 'France'],
  'Europe/Brussels': ['BE', 'Belgium'],
  'Europe/Amsterdam': ['NL', 'Netherlands'],
  'Europe/Luxembourg': ['LU', 'Luxembourg'],
  'Europe/Berlin': ['DE', 'Germany'],
  'Europe/Vienna': ['AT', 'Austria'],
  'Europe/Zurich': ['CH', 'Switzerland'],
  'Europe/Vaduz': ['LI', 'Liechtenstein'],
  'Europe/Rome': ['IT', 'Italy', 'SM', 'San Marino', 'VA', 'Vatican City'],
  'Europe/Monaco': ['MC', 'Monaco'],
  'Europe/Athens': ['GR', 'Greece'],
  'Europe/Prague': ['CZ', 'Czechia', 'Czech Republic'],
  'Europe/Budapest': ['HU', 'Hungary'],
  'Europe/Warsaw': ['PL', 'Poland'],
  'Europe/Bucharest': ['RO', 'Romania'],
  'Europe/Sofia': ['BG', 'Bulgaria'],
  'Europe/Stockholm': ['SE', 'Sweden'],
  'Europe/Oslo': ['NO', 'Norway'],
  'Europe/Copenhagen': ['DK', 'Denmark'],
  'Europe/Helsinki': ['FI', 'Finland'],
  'Atlantic/Reykjavik': ['IS', 'Iceland'],
  'Europe/Moscow': ['RU', 'Russia'], // westernmost of eleven; where most Russians live
  'Europe/Kyiv': ['UA', 'Ukraine'],
  'Atlantic/Faroe': ['FO', 'Faroe Islands'],
  'America/Nuuk': ['GL', 'Greenland'],

  // Africa.
  'Africa/Cairo': ['EG', 'Egypt'],
  'Africa/Casablanca': ['MA', 'Morocco', 'EH', 'Western Sahara'],
  'Africa/Algiers': ['DZ', 'Algeria'],
  'Africa/Tunis': ['TN', 'Tunisia'],
  'Africa/Tripoli': ['LY', 'Libya'],
  'Africa/Khartoum': ['SD', 'Sudan'],
  'Africa/Nairobi': ['KE', 'Kenya'],
  'Africa/Dar_es_Salaam': ['TZ', 'Tanzania'],
  'Africa/Kampala': ['UG', 'Uganda'],
  'Africa/Addis_Ababa': ['ET', 'Ethiopia'],
  'Africa/Mogadishu': ['SO', 'Somalia'],
  'Africa/Djibouti': ['DJ', 'Djibouti'],
  'Indian/Comoro': ['KM', 'Comoros'],
  'Africa/Nouakchott': ['MR', 'Mauritania'],
  'Africa/Lagos': ['NG', 'Nigeria', 'CM', 'Cameroon', 'GA', 'Gabon', 'CG', 'Congo'],
  'Africa/Accra': ['GH', 'Ghana'],
  'Africa/Dakar': ['SN', 'Senegal', 'ML', 'Mali', 'BF', 'Burkina Faso'],
  'Africa/Abidjan': ['CI', "Côte d'Ivoire", 'Ivory Coast'],
  'Africa/Niamey': ['NE', 'Niger'],
  'Africa/Lome': ['TG', 'Togo'],
  'Africa/Porto-Novo': ['BJ', 'Benin'],
  'Africa/Kinshasa': ['CD', 'DR Congo', 'Democratic Republic of the Congo'], // western zone
  'Africa/Johannesburg': ['ZA', 'South Africa'],
  'Indian/Antananarivo': ['MG', 'Madagascar'],
  'Africa/Malabo': ['GQ', 'Equatorial Guinea'],

  // Americas.
  'America/New_York': ['US', 'United States', 'USA'], // eastern: the most populous of six
  'America/Toronto': ['CA', 'Canada'], // eastern, likewise
  'America/Mexico_City': ['MX', 'Mexico'],
  'America/Guatemala': ['GT', 'Guatemala'],
  'America/Tegucigalpa': ['HN', 'Honduras'],
  'America/El_Salvador': ['SV', 'El Salvador'],
  'America/Managua': ['NI', 'Nicaragua'],
  'America/Costa_Rica': ['CR', 'Costa Rica'],
  'America/Panama': ['PA', 'Panama'],
  'America/Havana': ['CU', 'Cuba'],
  'America/Santo_Domingo': ['DO', 'Dominican Republic'],
  'America/Port-au-Prince': ['HT', 'Haiti'],
  'America/Sao_Paulo': ['BR', 'Brazil'], // Brasília time, which is most of the country
  'America/Argentina/Buenos_Aires': ['AR', 'Argentina'],
  'America/Santiago': ['CL', 'Chile'], // mainland; Easter Island is two hours behind
  'America/Bogota': ['CO', 'Colombia'],
  'America/Lima': ['PE', 'Peru'],
  'America/Caracas': ['VE', 'Venezuela'],
  'America/Guayaquil': ['EC', 'Ecuador'], // mainland; the Galápagos are an hour behind
  'America/La_Paz': ['BO', 'Bolivia'],
  'America/Asuncion': ['PY', 'Paraguay'],
  'America/Montevideo': ['UY', 'Uruguay'],
  'America/Paramaribo': ['SR', 'Suriname'],
  'America/Curacao': ['CW', 'Curaçao', 'AW', 'Aruba'],

  // Oceania.
  'Australia/Sydney': ['AU', 'Australia'], // eastern: Sydney, Melbourne, Brisbane
  'Pacific/Auckland': ['NZ', 'New Zealand'],
  'Pacific/Fiji': ['FJ', 'Fiji'],
};

/**
 * Anything that is the same country written differently.
 *
 * Case, surrounding space, and the punctuation that separates words — so `united-states`,
 * `United States` and `UNITED  STATES` are one key. Accents are left alone: `Curaçao` and
 * `Türkiye` are listed as they are spelled, and stripping them would need a normalisation
 * that also has to be applied on the way in.
 */
function normalise(country: string): string {
  return country.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

const ZONE_BY_COUNTRY: ReadonlyMap<string, string> = new Map(
  Object.entries(COUNTRIES_BY_ZONE).flatMap(([zone, countries]) =>
    countries.map((c) => [normalise(c), zone] as const),
  ),
);

/**
 * The IANA zone a hostel's clock runs on, by the country on its record.
 *
 * Falls back to {@link FALLBACK_TIME_ZONE} for a country that is blank, misspelled or simply
 * not listed — the table does not try to be complete, and a caller that cannot be wrong about
 * this should not be reading a free-text field to find out.
 */
export function countryTimeZone(country: string | null | undefined): string {
  if (!country) return FALLBACK_TIME_ZONE;
  return ZONE_BY_COUNTRY.get(normalise(country)) ?? FALLBACK_TIME_ZONE;
}
