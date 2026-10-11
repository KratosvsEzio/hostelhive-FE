import { errorStatus } from '@core/errors/api-error-text';
import { bookingRefusal } from '@util/booking-refusal';

/**
 * The translation key saying why a guest's booking failed, shown under the summary's
 * "Couldn't complete the booking" headline.
 *
 * A recognised refusal gets its own sentence; anything else asks the guest to try again.
 * `message` is never read.
 */
export function bookingFailureKey(err: unknown): string {
  const status = errorStatus(err);
  if (status === 0) return 'common.cannotReachTheServer';
  if (status === 401) return 'publicBooking.logInAgainToBook';
  if (status === 404) return 'publicBooking.hostelNotTakingBookings';

  switch (bookingRefusal(err)) {
    case 'bookingsClosed':
      return 'publicBooking.hostelNotTakingBookings';
    case 'checkInPast':
      return 'publicBooking.checkInHasPassed';
    case 'roomNotBookable':
      return 'publicBooking.roomNoLongerBookable';
    case 'datesOutOfOrder':
      return 'publicBooking.checkOutAfterCheckIn';
    default:
      return 'publicBooking.tryAgain';
  }
}
