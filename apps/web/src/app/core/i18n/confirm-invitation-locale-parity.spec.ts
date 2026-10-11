import { LocaleTree, at, leaves, loadLocale, localeFiles, params } from './locale-files-testing';

const GROUP = 'authConfirmInvitation';
/** Keys from other groups that the confirmation page shows. */
const SINGLE_KEYS = ['common.contactUs', 'common.backToHome'];
/** Keys the page's error card depends on; English must hold every one. */
const PAGE_KEYS = [
  'confirmationFailed',
  'goToLogIn',
  'cannotReachTheServer',
  'linkIsInvalidOrExpired',
  'linkIsMissingItsToken',
  'linkInvalidOrUsedTitle',
  'linkIsInvalidOrUsed',
  'linkExpiredTitle',
  'linkHasExpired',
].map((key) => `${GROUP}.${key}`);

/** The used and expired copy; none of it may state how long a link lasts. */
const NEW_KEYS = [
  'linkInvalidOrUsedTitle',
  'linkIsInvalidOrUsed',
  'linkExpiredTitle',
  'linkHasExpired',
].map((key) => `${GROUP}.${key}`);

/** The confirmation-page keys of one locale, as path -> text. */
function confirmKeys(tree: LocaleTree): Record<string, string> {
  const out: Record<string, string> = {};
  for (const path of [GROUP, ...SINGLE_KEYS]) leaves(at(tree, path), path, out);
  return out;
}

const files = localeFiles();
const en = loadLocale('en.json');
const enKeys = confirmKeys(en);

describe('the confirmation-link copy in every language', () => {
  it('covers all 18 languages', () => {
    expect(files).toHaveLength(18);
  });

  it.each([...PAGE_KEYS, ...SINGLE_KEYS])('English holds %s', (path) => {
    expect(typeof enKeys[path]).toBe('string');
  });

  it('has no empty English text', () => {
    const empty = Object.entries(enKeys)
      .filter(([, text]) => text.trim() === '')
      .map(([path]) => path);
    expect(empty).toEqual([]);
  });

  it('names no link lifetime in the English used and expired copy', () => {
    const timed = NEW_KEYS.filter((path) =>
      /\b(year|day|hour|month|minute)s?\b/i.test(enKeys[path] ?? ''),
    );
    expect(timed).toEqual([]);
  });

  it.each(files)('%s puts no digit in the used and expired copy', (file) => {
    const keys = confirmKeys(loadLocale(file));
    const withDigits = NEW_KEYS.filter((path) => /\p{Nd}/u.test(keys[path] ?? ''));
    expect(withDigits).toEqual([]);
  });

  describe.each(files.filter((f) => f !== 'en.json'))('%s', (file) => {
    const keys = confirmKeys(loadLocale(file));

    it('has exactly the English key set', () => {
      expect(Object.keys(keys).sort()).toEqual(Object.keys(enKeys).sort());
    });

    it('has no empty text', () => {
      const empty = Object.entries(keys)
        .filter(([, text]) => text.trim() === '')
        .map(([path]) => path);
      expect(empty).toEqual([]);
    });

    it('keeps the same {{param}} names as English', () => {
      const mismatched = Object.keys(enKeys)
        .filter((path) => path in keys)
        .filter((path) => params(keys[path]).join(',') !== params(enKeys[path]).join(','));
      expect(mismatched).toEqual([]);
    });

    it('translates the new used and expired messages rather than copying English', () => {
      const copied = ['linkIsInvalidOrUsed', 'linkHasExpired']
        .map((key) => `${GROUP}.${key}`)
        .filter((path) => keys[path] === enKeys[path]);
      expect(copied).toEqual([]);
    });
  });
});
