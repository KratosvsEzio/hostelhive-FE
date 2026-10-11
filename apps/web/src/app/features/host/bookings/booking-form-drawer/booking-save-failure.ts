import { errorStatus } from '@core/errors/api-error-text';
import { bookingRefusal } from '@util/booking-refusal';

/**
 * The translation key for a booking the host could not record.
 *
 * A lapsed subscription is not handled here: the drawer checks it first and shows the renewal
 * prompt instead. Everything this does not recognise falls back to the generic message.
 * `message` is never read.
 */
export function bookingSaveFailureKey(err: unknown): string {
  const status = errorStatus(err);
  if (status === 0) return 'common.cannotReachTheServer';
  if (status === 403 && errorCode(err) === 'crm_required') return 'hostBookings.crmRequired';

  switch (bookingRefusal(err)) {
    case 'bookingsClosed':
      return 'hostBookings.notSetUpForBookings';
    case 'checkInPast':
      return 'hostBookings.checkInCannotBeInPast';
    case 'roomNotBookable':
      return 'hostBookings.roomTypeNotBookable';
    case 'datesOutOfOrder':
      return 'hostBookings.checkOutAfterCheckIn';
    default:
      return 'hostBookings.couldNotSaveBooking';
  }
}

function errorCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const { code } = err as { code?: unknown };
  return typeof code === 'string' ? code : null;
}
