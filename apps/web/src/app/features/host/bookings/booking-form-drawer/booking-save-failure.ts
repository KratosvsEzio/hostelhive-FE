import { errorStatus } from '@core/errors/api-error-text';
import { isCrmRequired, isPermissionRefusal } from '@core/host-access/host-access';
import { bookingRefusal } from '@util/booking-refusal';
import { MoveFailureOptions } from '../booking-move-failure';

/**
 * The translation key for a booking the host could not record.
 *
 * A lapsed subscription gets the generic message: the console's plan lock replaces the bookings
 * page, drawer included, on that refusal, so this only shows if the lock does not engage. A 403 says the hostel's plan lacks CRM, or that the signed-in user may not
 * record bookings, worded for the owner or staff by `opts.owner`. Everything this does not
 * recognise falls back to the generic message. `message` is never read.
 */
export function bookingSaveFailureKey(err: unknown, opts: MoveFailureOptions = {}): string {
  const status = errorStatus(err);
  if (status === 0) return 'common.cannotReachTheServer';
  if (isCrmRequired(err)) return 'hostBookings.crmRequired';
  if (isPermissionRefusal(err)) {
    return opts.owner ? 'hostBookings.notAllowedOwner' : 'hostBookings.notAllowed';
  }

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
