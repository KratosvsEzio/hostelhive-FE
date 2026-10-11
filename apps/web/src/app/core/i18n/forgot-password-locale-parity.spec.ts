import { LocaleTree, at, leaves, loadLocale, localeFiles, params } from './locale-files-testing';

const GROUP = 'authForgotPassword';
/** Keys from other groups that the forgot-password page shows. */
const SINGLE_KEYS = [
  'common.emailAddress',
  'common.enterEmail',
  'common.checkYourEmail',
  'a11y.close',
];
/** Keys the page asks for; English must hold every one. */
const PAGE_KEYS = [
  'forgotYourPassword',
  'enterTheEmailAddressYou',
  'sendResetLink',
  'backToLogin',
  'didnTReceiveItResend',
  'enterAValidEmail',
  'sentIfAccountExists',
  'alreadySent',
  'sentAnother',
  'tooManyRequests',
  'cannotReachTheServer',
  'couldNotSend',
  'useADifferentEmail',
].map((key) => `${GROUP}.${key}`);

/** The page's messages; none of them may name a number or how long a link lasts. */
const NEW_KEYS = [
  'enterAValidEmail',
  'sentIfAccountExists',
  'alreadySent',
  'sentAnother',
  'tooManyRequests',
  'cannotReachTheServer',
  'couldNotSend',
  'useADifferentEmail',
].map((key) => `${GROUP}.${key}`);

/** The two fragments the sent sentence was once glued from; one parameterised key replaced them. */
const RETIRED_KEYS = ['weSentAPasswordReset', 'clickTheLinkInThe'].map((key) => `${GROUP}.${key}`);

/** The forgot-password keys of one locale, as path -> text. */
function forgotKeys(tree: LocaleTree): Record<string, string> {
  const out: Record<string, string> = {};
  for (const path of [GROUP, ...SINGLE_KEYS]) leaves(at(tree, path), path, out);
  return out;
}

const files = localeFiles();
const en = loadLocale('en.json');
const enKeys = forgotKeys(en);

describe('the forgot-password copy in every language', () => {
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

  it('puts the address in the sent sentence as {{email}}', () => {
    expect(params(enKeys[`${GROUP}.sentIfAccountExists`] ?? '')).toEqual(['email']);
  });

  it('names no link lifetime in the English messages, only "a few minutes" to wait', () => {
    const timed = NEW_KEYS.filter((path) => {
      const withoutWait = (enKeys[path] ?? '').replace(/\ba few minutes\b/gi, '');
      return /\b(year|day|hour|minute|second)s?\b/i.test(withoutWait);
    });
    expect(timed).toEqual([]);
  });

  it.each(files)('%s has dropped the retired sentence fragments', (file) => {
    const keys = forgotKeys(loadLocale(file));
    expect(RETIRED_KEYS.filter((path) => path in keys)).toEqual([]);
  });

  it.each(files)('%s puts no digit in the messages', (file) => {
    const keys = forgotKeys(loadLocale(file));
    const withDigits = NEW_KEYS.filter((path) => /\p{Nd}/u.test(keys[path] ?? ''));
    expect(withDigits).toEqual([]);
  });

  it.each(files)('%s reuses its reset-password wording for an unreachable server', (file) => {
    const tree = loadLocale(file);
    expect(at(tree, `${GROUP}.cannotReachTheServer`)).toBe(
      at(tree, 'authResetPassword.cannotReachTheServer'),
    );
  });

  describe.each(files.filter((f) => f !== 'en.json'))('%s', (file) => {
    const keys = forgotKeys(loadLocale(file));

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

    it('translates the new messages rather than copying English', () => {
      const copied = NEW_KEYS.filter((path) => keys[path] === enKeys[path]);
      expect(copied).toEqual([]);
    });
  });
});
