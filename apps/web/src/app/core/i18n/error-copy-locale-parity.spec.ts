import { LocaleTree, at, loadLocale, localeFiles, params } from './locale-files-testing';

/** The failure messages screens show instead of whatever the error object says. */
const NEW_KEYS = [
  'common.cannotReachTheServer',
  ...[
    'emailOrPasswordIncorrect',
    'emailAlreadyRegistered',
    'couldNotCreateAccount',
    'accountCannotSignIn',
    'googleDidNotFinish',
    'tooManyAttempts',
    'somethingWentWrong',
  ].map((key) => `leadWall.${key}`),
  ...[
    'notSetUpForBookings',
    'crmRequired',
    'checkInCannotBeInPast',
    'roomTypeNotBookable',
    'checkOutAfterCheckIn',
    'couldNotSaveBooking',
  ].map((key) => `hostBookings.${key}`),
  ...['couldNotUploadImage', 'fileTypeNotSupported', 'uploadTryAgain'].map(
    (key) => `hostTeam.${key}`,
  ),
  ...[
    'hostelNotTakingBookings',
    'roomNoLongerBookable',
    'checkInHasPassed',
    'checkOutAfterCheckIn',
    'logInAgainToBook',
    'tryAgain',
  ].map((key) => `publicBooking.${key}`),
  ...[
    'noLongerCancellable',
    'roomNoLongerBookable',
    'checkOutAfterCheckIn',
    'bookingNotFound',
    'cancelFailed',
  ].map((key) => `userBookings.${key}`),
];

/** Existing messages the same screens fall back to; they must exist everywhere too. */
const REUSED_KEYS = [
  'hostBookings.theRoomsForThisProperty',
  'publicBooking.couldnTBook',
  'userBookings.changeFailed',
  'userBookings.withinCutoff',
  'userBookings.noLongerEditable',
];

const ALL_KEYS = [...NEW_KEYS, ...REUSED_KEYS];

/** The text at each key, or undefined where the locale lacks it or holds a non-string. */
function texts(tree: LocaleTree): Record<string, string | undefined> {
  return Object.fromEntries(
    ALL_KEYS.map((path) => {
      const node = at(tree, path);
      return [path, typeof node === 'string' ? node : undefined];
    }),
  );
}

const files = localeFiles();
const en = texts(loadLocale('en.json'));

describe('the error copy in every language', () => {
  it('covers all 18 languages', () => {
    expect(files).toHaveLength(18);
  });

  it.each(files)('%s holds every key as non-empty text', (file) => {
    const keys = texts(loadLocale(file));
    const missing = ALL_KEYS.filter((path) => !keys[path]?.trim());
    expect(missing).toEqual([]);
  });

  it.each(files)('%s keeps the same {{param}} names as English', (file) => {
    const keys = texts(loadLocale(file));
    const mismatched = ALL_KEYS.filter(
      (path) => params(keys[path] ?? '').join(',') !== params(en[path] ?? '').join(','),
    );
    expect(mismatched).toEqual([]);
  });

  it.each(files)('%s puts no digit in the new messages', (file) => {
    const keys = texts(loadLocale(file));
    const withDigits = NEW_KEYS.filter((path) => /\p{Nd}/u.test(keys[path] ?? ''));
    expect(withDigits).toEqual([]);
  });

  it.each(files)('%s reuses its forgot-password wording for an unreachable server', (file) => {
    const tree = loadLocale(file);
    expect(at(tree, 'common.cannotReachTheServer')).toBe(
      at(tree, 'authForgotPassword.cannotReachTheServer'),
    );
  });

  it.each(files.filter((file) => file !== 'en.json'))(
    '%s translates the new messages rather than copying English',
    (file) => {
      const keys = texts(loadLocale(file));
      const copied = NEW_KEYS.filter((path) => keys[path] === en[path]);
      expect(copied).toEqual([]);
    },
  );
});
