import { errorStatus } from '@core/errors/api-error-text';
import { bookingRefusal } from '@util/booking-refusal';

/**
 * The translation key for a stay move the server refused: confirm, check in, check out,
 * cancel, no-show, generate invoice or mark paid.
 *
 * Every key is a whole sentence, so it reads on its own in a dialog or footer and as the
 * reason in a "one side succeeded" toast. Anything not recognised falls back to the generic
 * message. `message` is never read.
 */
export function bookingMoveFailureKey(err: unknown): string {
  const status = errorStatus(err);
  if (status === 0) return 'common.cannotReachTheServer';
  if (status === 404) return 'hostBookings.bookingNotFound';

  switch (bookingRefusal(err)) {
    case 'bookingsClosed':
      return 'hostBookings.notSetUpForBookings';
    case 'notEnoughBeds':
      return 'hostBookings.notEnoughBedsFree';
    case 'allocationInvalid':
      return 'hostBookings.checkTheRoomsPicked';
    case 'alreadyCheckedIn':
      return 'hostBookings.alreadyCheckedIn';
    case 'wrongStage':
    case 'noLongerChangeable':
      return 'hostBookings.bookingHasMovedOn';
    case 'alreadyPaid':
      return 'hostBookings.bookingAlreadyPaid';
    case 'invoiceExists':
      return 'hostBookings.invoiceAlreadyExists';
    case 'reasonRequired':
      return 'hostBookings.giveTheGuestAReason';
    default:
      return 'hostBookings.moveNotAccepted';
  }
}

/**
 * The translation key for a room that could not be released. The generic one takes the room
 * number as `{{room}}`. `message` is never read.
 */
export function releaseFailureKey(err: unknown): string {
  if (errorStatus(err) === 0) return 'common.cannotReachTheServer';
  return bookingRefusal(err) === 'roomAlreadyReleased'
    ? 'hostBookings.roomAlreadyReleased'
    : 'hostBookings.couldNotReleaseRoom';
}

/**
 * The translation key for why a booking's invoice was not marked paid after the booking was.
 * The invoice endpoint sends no refusal of its own worth telling apart, so beyond an
 * unreachable server or a missing invoice the host is pointed at the invoice itself.
 */
export function crossPayInvoiceFailureKey(err: unknown): string {
  const status = errorStatus(err);
  if (status === 0) return 'common.cannotReachTheServer';
  if (status === 404) return 'hostBookings.invoiceNoLongerExists';
  return 'hostBookings.payTheInvoiceOnItsOwn';
}
