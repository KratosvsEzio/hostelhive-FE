import { errorStatus } from '@core/errors/api-error-text';
import { bookingRefusal } from '@util/booking-refusal';

/** What the guest was trying to do to their booking. */
export type BookingChangeAction = 'update' | 'cancel';

/**
 * The translation key for a guest's booking change or cancellation that failed.
 *
 * A recognised refusal gets its own sentence; anything else falls back to the generic message.
 * `message` is never read.
 */
export function changeFailureKey(err: unknown, action: BookingChangeAction): string {
  const status = errorStatus(err);
  if (status === 0) return 'common.cannotReachTheServer';
  if (status === 404) return 'userBookings.bookingNotFound';

  switch (bookingRefusal(err)) {
    case 'withinCutoff':
      return 'userBookings.withinCutoff';
    case 'noLongerChangeable':
      return action === 'cancel' ? 'userBookings.noLongerCancellable' : 'userBookings.noLongerEditable';
    case 'roomNotBookable':
      return 'userBookings.roomNoLongerBookable';
    case 'datesOutOfOrder':
      return 'userBookings.checkOutAfterCheckIn';
    default:
      return action === 'cancel' ? 'userBookings.cancelFailed' : 'userBookings.changeFailed';
  }
}
