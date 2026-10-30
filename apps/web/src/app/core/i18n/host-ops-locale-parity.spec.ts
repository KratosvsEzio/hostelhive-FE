import {
  at,
  leaves,
  loadLocale,
  localeFiles,
  params,
} from './locale-files-testing';

/** Every key English holds in the host bookings, invoices and rooms screens, so a new English-only key fails here. */
const GROUPS = ['hostBookings', 'hostInvoices', 'hostRooms'];

/**
 * The booking lifecycle copy that was hard-coded English until Trello #170. `filterStatus` and
 * `viaSource` are left out: "Status" and "via" are the native words in several languages.
 */
const LIFECYCLE_KEYS = [
  'lanePending',
  'laneConfirmed',
  'laneCheckedIn',
  'laneCheckedOut',
  'laneCancelled',
  'laneNoShow',
  'actionConfirmBooking',
  'actionCheckIn',
  'actionCheckOut',
  'actionGenerateInvoice',
  'actionMarkNoShow',
  'actionMarkPaid',
  'hintPending',
  'hintConfirmed',
  'hintCheckedIn',
  'hintInvoiced',
  'hintInvoiceOnce',
  'hintNoShow',
  'hintCancelled',
  'requestedAgo',
  'requestedJustNow',
  'bookingFallback',
  'stay',
  'quoted',
  'due',
  'booked',
  'inRooms',
  'reason',
  'reference',
  'forNNights',
  'forNNightsOne',
  'atTheProperty',
  'nPrivateRooms',
  'nPrivateRoomsOne',
  'nSharedBeds',
  'nSharedBedsOne',
  'nRooms',
  'nRoomsOne',
  'nRoomTypes',
  'loadingRooms',
  'couldNotLoadBookingRooms',
  'noRoomsRecordedYet',
  'release',
  'releasing',
  'amountPaid',
  'amountStillDue',
  'amountDue',
  'nothingOutstanding',
  'partial',
  'unpaid',
  'bookingConfirmed',
  'guestEmailedConfirmation',
  'bookingCancelled',
  'everyoneHasBeenTold',
  'markedAsNoShow',
  'everyBedFreeAgain',
  'markedAsPaid',
  'nothingLeftDue',
  'invoiceGenerated',
  'checkedIn',
  'roomTimesGuests',
  'noShowTitle',
  'checkOutTitle',
  'markPaidTitle',
  'generateInvoiceTitle',
  'working',
  'keepBooking',
  'notNow',
  'inRoomsList',
  'cancelDialogBody',
  'noShowDialogBody',
  'checkOutDialogBody',
  'markPaidDialogBody',
  'invoiceDialogBody',
  'reasonRequired',
  'reasonOptional',
  'cancelReasonPlaceholder',
  'noShowReasonPlaceholder',
  'noBookingMatchesFilters',
  'bookingsWillAppearHere',
  'filterBookingStatus',
  'filterBookingStatusHelp',
  'filterArrival',
  'filterArrivingBetween',
  'filterArrivingBetweenHelp',
  'filterGuestsInRoom',
  'filterGuestsInRoomHelp',
  'nToConfirm',
  'nothingPending',
  'awaitingConfirmation',
  'nAwaitingConfirmation',
  'details',
  'checkInGuest',
  'guestsPlaced',
  'noRoomsToCheckInto',
  'nOfNBedsFree',
  'nOfNBedsFreeOne',
  'fullNOfNBedsTaken',
  'oneFewerGuestInRoom',
  'oneMoreGuestInRoom',
  'partialPlacement',
  'partialPlacementOne',
  'placeNGuests',
  'placeNGuestsOne',
  'checkingIn',
  'checkInNGuests',
  'checkInNGuestsOne',
];

/** The stay-flow and booking-invoice copy, which must be translated rather than copied from English. */
const TRANSLATED_KEYS = [
  ...[
    'invoice',
    'checkingForInvoice',
    'noInvoiceYet',
    'couldNotCheckInvoice',
    'viewInvoice',
    'confirmation',
    'downloadConfirmation',
    'alsoMarkInvoicePaid',
    'bookingAndInvoicePaid',
    'invoiceNotPaid',
    'stayedIn',
    'checkedOut',
    'released',
    'cancelOpenInvoiceWarning',
    'bookingNotFound',
    'notEnoughBedsFree',
    'checkTheRoomsPicked',
    'alreadyCheckedIn',
    'bookingHasMovedOn',
    'bookingAlreadyPaid',
    'alreadyPaidInvoicePaid',
    'invoiceAlreadyExists',
    'giveTheGuestAReason',
    'moveNotAccepted',
    'notAllowed',
    'notAllowedOwner',
    'planHasNoCrm',
    'roomAlreadyReleased',
    'couldNotReleaseRoom',
    'invoiceNoLongerExists',
    'payTheInvoiceOnItsOwn',
    ...LIFECYCLE_KEYS,
  ].map((key) => `hostBookings.${key}`),
  // The rooms screens' booking-guest copy, English-only until Trello #170.
  ...[
    'nFree',
    'full',
    'guestsOnBookings',
    'noBookingGuests',
    'guestCount',
    'untilDate',
    'couldNotLoadBookingGuests',
  ].map((key) => `hostRooms.${key}`),
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
  // Danish uses the loanword "booking" throughout, so "Booking {{ref}}" is the native label;
  // "Reference" is the word it already uses for the billing column.
  'da.json': ['hostInvoices.bookingRef', 'hostBookings.bookingFallback', 'hostBookings.reference'],
  // Dutch "Details", as its own rooms detail tab already reads.
  'nl.json': ['hostBookings.details'],
  // French spells the booking-confirmation document the same way English does.
  'fr.json': ['hostBookings.confirmation'],
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

describe('the host bookings, invoices and rooms copy in every language', () => {
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

  it.each(['alreadyCheckedIn', 'bookingHasMovedOn', 'bookingAlreadyPaid'])(
    'words hostBookings.%s in English without asking the host to refresh',
    (key) => {
      expect(en[`hostBookings.${key}`]).not.toMatch(/refresh/i);
    },
  );

  it.each(['notAllowed', 'notAllowedOwner', 'planHasNoCrm'])(
    'words hostBookings.%s in English without inviting a retry',
    (key) => {
      expect(en[`hostBookings.${key}`]).not.toMatch(/try again/i);
    },
  );

  it.each(files)('%s keeps the HostelHive name in the owner permission sentence', (file) => {
    expect(texts(file)['hostBookings.notAllowedOwner']).toContain('HostelHive');
  });

  it.each(files)('%s keeps the CRM name in the plan sentence', (file) => {
    expect(texts(file)['hostBookings.planHasNoCrm']).toContain('CRM');
  });

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
