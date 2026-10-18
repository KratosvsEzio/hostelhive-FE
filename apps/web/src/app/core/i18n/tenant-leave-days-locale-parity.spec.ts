import { at, loadLocale, localeFiles, params } from './locale-files-testing';

/**
 * The tenant leave confirmation's day count, singular and plural, in both directions. The
 * app has no plural rules, so the singular is its own key, chosen when the count is one.
 */
const KEYS = [
  'hostTenants.nDaysFromToday',
  'hostTenants.nDaysFromTodayOne',
  'hostTenants.nDaysAgo',
  'hostTenants.nDaysAgoOne',
];

const files = localeFiles();

function text(file: string, path: string): string | undefined {
  const node = at(loadLocale(file), path);
  return typeof node === 'string' ? node : undefined;
}

describe('the tenant leave day count in every language', () => {
  it('covers all 18 languages', () => {
    expect(files).toHaveLength(18);
  });

  it.each(files)('%s holds every key as non-empty text with a {{count}}', (file) => {
    const bad = KEYS.filter((path) => {
      const value = text(file, path);
      return !value?.trim() || params(value).join(',') !== 'count';
    });
    expect(bad).toEqual([]);
  });

  it('words the English singular without a plural "days"', () => {
    expect(text('en.json', 'hostTenants.nDaysFromTodayOne')).toBe('{{count}} day from today');
    expect(text('en.json', 'hostTenants.nDaysAgoOne')).toBe('{{count}} day ago');
  });
});
