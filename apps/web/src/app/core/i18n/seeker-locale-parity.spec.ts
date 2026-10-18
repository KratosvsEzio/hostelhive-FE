import {
  at,
  leaves,
  loadLocale,
  localeFiles,
  params,
} from './locale-files-testing';

/**
 * Every key English holds for the seeker's bookings screens and the search filters, so a new
 * English-only key fails here. Fifty-eight `userBookings` keys and the filter labels once shipped
 * in English alone, because `i18n-check` gates `en.json` only.
 */
const GROUPS = ['userBookings', 'filters', 'search'];

/** Translations that genuinely read the same as English, per file. */
const SAME_AS_ENGLISH: Record<string, string[]> = {
  // "Wi-Fi" is the international name; Arabic, Urdu and Hindi write it in their own script instead.
  'da.json': ['filters.amenityWifi', 'filters.amenityGenerator', 'search.budget'],
  'de.json': ['userBookings.guestName', 'search.budget'],
  'es.json': ['userBookings.total', 'filters.amenityWifi'],
  'fr.json': ['userBookings.total', 'filters.amenityWifi', 'filters.amenityParking', 'search.budget'],
  'hu.json': ['filters.amenityWifi'],
  // Indonesian, like Italian, uses check-in / check-out as loanwords throughout its file.
  'id.json': [
    'userBookings.checkIn',
    'userBookings.checkOut',
    'userBookings.total',
    'userBookings.guestEmail',
    'filters.amenityWifi',
    'filters.amenityAc',
    'filters.amenityCctv',
  ],
  'it.json': ['userBookings.checkIn', 'userBookings.checkOut', 'filters.amenityWifi', 'search.budget'],
  'ja.json': ['filters.amenityWifi'],
  // Dutch "bed" is the singular; "Filters" is the Dutch word too.
  'nl.json': ['userBookings.nBedsOne', 'filters.filters', 'search.budget'],
  'pl.json': ['filters.amenityWifi', 'filters.amenityParking'],
  'ru.json': ['filters.amenityWifi'],
  'sv.json': ['filters.amenityAc', 'search.budget'],
  'vi.json': ['userBookings.guestEmail', 'filters.amenityWifi'],
  'zh.json': ['filters.amenityWifi'],
};

const files = localeFiles();
const enTree = loadLocale('en.json');
const en = Object.assign(
  {},
  ...GROUPS.map((group) => leaves(at(enTree, group), group)),
) as Record<string, string>;
const ALL_KEYS = Object.keys(en);

/** The text at each English key, or undefined where the locale lacks it or holds a non-string. */
function texts(file: string): Record<string, string | undefined> {
  const tree = loadLocale(file);
  return Object.fromEntries(
    ALL_KEYS.map((path) => {
      const node = at(tree, path);
      return [path, typeof node === 'string' ? node : undefined];
    }),
  );
}

describe('the seeker bookings and search filter copy in every language', () => {
  it('covers all 18 languages', () => {
    expect(files).toHaveLength(18);
  });

  it('includes the search filter labels', () => {
    expect(ALL_KEYS).toEqual(
      expect.arrayContaining([
        'filters.propertyTypeApartment',
        'filters.amenityWifi',
        'filters.amenityAttachedBath',
      ]),
    );
  });

  it.each(files)('%s holds every English key as non-empty text', (file) => {
    const keys = texts(file);
    expect(ALL_KEYS.filter((path) => !keys[path]?.trim())).toEqual([]);
  });

  it.each(files)('%s keeps the same {{param}} names as English', (file) => {
    const keys = texts(file);
    const mismatched = ALL_KEYS.filter(
      (path) =>
        params(keys[path] ?? '').join(',') !== params(en[path]).join(','),
    );
    expect(mismatched).toEqual([]);
  });

  it.each(files.filter((file) => file !== 'en.json'))(
    '%s translates the copy rather than copying English',
    (file) => {
      const keys = texts(file);
      const allowed = SAME_AS_ENGLISH[file] ?? [];
      const copied = ALL_KEYS.filter(
        (path) => keys[path] === en[path] && !allowed.includes(path),
      );
      expect(copied).toEqual([]);
    },
  );

  it('lists only real copies as exceptions', () => {
    const stale = Object.entries(SAME_AS_ENGLISH).flatMap(([file, paths]) => {
      const keys = texts(file);
      return paths
        .filter((path) => keys[path] !== en[path])
        .map((path) => `${file}:${path}`);
    });
    expect(stale).toEqual([]);
  });
});
