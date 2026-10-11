import {
  at,
  leaves,
  loadLocale,
  localeFiles,
  params,
} from './locale-files-testing';

/** Every key English holds in the host bookings and invoices screens, so a new English-only key fails here. */
const GROUPS = ['hostBookings', 'hostInvoices'];

/** The stay-flow and booking-invoice copy, which must be translated rather than copied from English. */
const TRANSLATED_KEYS = [
  ...[
    'invoice',
    'checkingForInvoice',
    'noInvoiceYet',
    'couldNotCheckInvoice',
    'viewInvoice',
    'alsoMarkInvoicePaid',
    'bookingAndInvoicePaid',
    'invoiceNotPaid',
    'stayedIn',
    'checkedOut',
    'cancelOpenInvoiceWarning',
    'bookingNotFound',
    'notEnoughBedsFree',
    'checkTheRoomsPicked',
    'alreadyCheckedIn',
    'bookingHasMovedOn',
    'bookingAlreadyPaid',
    'invoiceAlreadyExists',
    'giveTheGuestAReason',
    'moveNotAccepted',
    'roomAlreadyReleased',
    'couldNotReleaseRoom',
    'invoiceNoLongerExists',
    'payTheInvoiceOnItsOwn',
  ].map((key) => `hostBookings.${key}`),
  ...[
    'invoicesAppearHereNightly',
    'bookingInvoices',
    'bookingRef',
    'viewBooking',
    'guestName',
    'markPaidConfirmTitle',
    'markPaidConfirmBody',
    'alsoMarkBookingPaid',
    'invoiceAndBookingPaid',
    'bookingNotPaid',
    'invoiceNotFound',
  ].map((key) => `hostInvoices.${key}`),
];

/** Translations that genuinely read the same as English, per file. */
const SAME_AS_ENGLISH: Record<string, string[]> = {
  // Danish uses the loanword "booking" throughout, so "Booking {{ref}}" is the native label.
  'da.json': ['hostInvoices.bookingRef'],
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

describe('the host bookings and invoices copy in every language', () => {
  it('covers all 18 languages', () => {
    expect(files).toHaveLength(18);
  });

  it('checks every translated key against an English source', () => {
    expect(TRANSLATED_KEYS.filter((path) => !en[path])).toEqual([]);
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
    '%s translates the stay-flow copy rather than copying English',
    (file) => {
      const keys = texts(file);
      const allowed = SAME_AS_ENGLISH[file] ?? [];
      const copied = TRANSLATED_KEYS.filter(
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
