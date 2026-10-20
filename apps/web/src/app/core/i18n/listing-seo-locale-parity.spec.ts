import { at, loadLocale, localeFiles, params } from './locale-files-testing';

/**
 * The words the listing's structured data and the place landings' link sections are built from.
 * They were English literals on every language until Trello #211, and `i18n-check` gates
 * `en.json` only, so a key missing from another file would quietly fall back to English again.
 * The amenity names come from `filters.*`, which `seeker-locale-parity.spec.ts` already gates.
 */
const KEYS = [
  'seo.priceFromMonth',
  'seo.priceFromNight',
  'seo.unitPerBedMonth',
  'seo.unitPerBedNight',
  'seo.featureMess',
  'seo.featureGender',
  'seo.headingNearCampus',
  'publicLanding.moreInPlace',
];

const files = localeFiles();
const enTree = loadLocale('en.json');
const en = Object.fromEntries(KEYS.map((key) => [key, at(enTree, key) as string]));

function texts(file: string): Record<string, string | undefined> {
  const tree = loadLocale(file);
  return Object.fromEntries(
    KEYS.map((key) => {
      const node = at(tree, key);
      return [key, typeof node === 'string' ? node : undefined];
    }),
  );
}

describe('the listing structured data and place landing link copy in every language', () => {
  it('covers all 18 languages', () => {
    expect(files).toHaveLength(18);
  });

  it.each(files)('%s holds every key as non-empty text', (file) => {
    const keys = texts(file);
    expect(KEYS.filter((key) => !keys[key]?.trim())).toEqual([]);
  });

  it.each(files)('%s keeps the same {{param}} names as English', (file) => {
    const keys = texts(file);
    expect(
      KEYS.filter((key) => params(keys[key] ?? '').join(',') !== params(en[key]).join(',')),
    ).toEqual([]);
  });

  it.each(files.filter((file) => file !== 'en.json'))(
    '%s translates the copy rather than copying English',
    (file) => {
      const keys = texts(file);
      expect(KEYS.filter((key) => keys[key] === en[key])).toEqual([]);
    },
  );
});
