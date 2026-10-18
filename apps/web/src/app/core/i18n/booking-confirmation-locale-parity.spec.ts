import { at, loadLocale, localeFiles } from './locale-files-testing';

/** The guest booking page's confirmation link, and the new-tab note read after it. */
const KEYS = ['userBookings.downloadConfirmation', 'userBookings.opensInNewTab'];

const files = localeFiles();
const en = loadLocale('en.json');

/** The text at a key, or undefined where the locale lacks it or holds a non-string. */
function textAt(file: string, path: string): string | undefined {
  const node = at(loadLocale(file), path);
  return typeof node === 'string' ? node : undefined;
}

describe('the booking confirmation link copy in every language', () => {
  it('covers all 18 languages', () => {
    expect(files).toHaveLength(18);
  });

  it.each(KEYS)('English holds %s', (path) => {
    expect(textAt('en.json', path)?.trim()).toBeTruthy();
  });

  it.each(files)('%s holds every key as non-empty text', (file) => {
    const empty = KEYS.filter((path) => !textAt(file, path)?.trim());
    expect(empty).toEqual([]);
  });

  it.each(files.filter((file) => file !== 'en.json'))('%s translates the keys rather than copying English', (file) => {
    const copied = KEYS.filter((path) => textAt(file, path) === textAt('en.json', path));
    expect(copied).toEqual([]);
  });

  it('reads the link as downloading the confirmation document in English', () => {
    expect(at(en, 'userBookings.downloadConfirmation')).toBe('Download confirmation');
  });
});
