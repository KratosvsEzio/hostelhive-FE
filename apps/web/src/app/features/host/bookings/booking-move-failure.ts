import { errorStatus } from '@core/errors/api-error-text';
import {
  RefusalAudience,
  actionRefusalKey,
  isPlanInactive,
  planInactiveKey,
} from '@core/host-access/host-access';
import { bookingRefusal } from '@util/booking-refusal';
import { LaneKey, laneKeyFor } from './booking-month';
import { HostBooking } from './host-bookings-api';

/**
 * How a refused move's booking differs from the one on screen: `'done'` when the move was
 * already made (checked in, paid), `'movedOn'` when the booking has left the stage the move
 * starts from.
 */
export type MovedOnKind = 'done' | 'movedOn';

/** Who a refused move's message is worded for: the audience every host refusal is worded for. */
export type MoveFailureOptions = RefusalAudience;

/**
 * The translation key for a stay move the server refused: confirm, check in, check out,
 * cancel, no-show, generate invoice or mark paid.
 *
 * Every key is a whole sentence, so it reads on its own in a dialog or footer and as the
 * reason in a "one side succeeded" toast. A 403 says the hostel's plan lacks CRM, or that the
 * signed-in user may not make the move ({@link actionRefusalKey}); one carrying any other code of
 * the server's is not told apart. A 400 saying the hostel has no live plan says so
 * ({@link planInactiveKey}). Both are worded for the owner or staff by `opts.owner`. Anything not
 * recognised falls back to the generic message. `message` is never read.
 */
export function bookingMoveFailureKey(err: unknown, opts: MoveFailureOptions = {}): string {
  const status = errorStatus(err);
  if (status === 0) return 'common.cannotReachTheServer';
  if (status === 404) return 'hostBookings.bookingNotFound';
  const refused = actionRefusalKey(err, opts);
  if (refused) return refused;
  if (isPlanInactive(err)) return planInactiveKey(opts);

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
 * Whether a stay move was refused because the server's booking is not the one on screen, and
 * how; `null` for every other refusal, an unreachable server and a missing booking.
 *
 * Its translation key still comes from {@link bookingMoveFailureKey}.
 */
export function movedOnKind(err: unknown): MovedOnKind | null {
  switch (bookingRefusal(err)) {
    case 'alreadyCheckedIn':
    case 'alreadyPaid':
      return 'done';
    case 'wrongStage':
    case 'noLongerChangeable':
      return 'movedOn';
    default:
      return null;
  }
}

/** Stages a booking has been checked in by. */
const CHECKED_IN_LANES: readonly LaneKey[] = ['checked-in', 'checked-out'];

/**
 * Whether the database's copy of a booking is on another stage than the one shown.
 *
 * Stages are compared by lane, so a legacy slug and the slug it stands for are the same stage.
 * Two slugs the page has no lane for count as the same stage too.
 */
export function stageChanged(shown: HostBooking, fresh: HostBooking): boolean {
  return laneKeyFor(fresh.disposition.slug) !== laneKeyFor(shown.disposition.slug);
}

/**
 * Whether the database's copy of a booking shows what a {@link movedOnKind} refusal said: paid,
 * checked in, or on another stage than the one shown ({@link stageChanged}).
 *
 * One that does not means the server and the page disagree about the same booking, so the
 * refusal is not treated as the booking having changed.
 */
export function refusalBorneOut(err: unknown, shown: HostBooking, fresh: HostBooking): boolean {
  switch (bookingRefusal(err)) {
    case 'alreadyPaid':
      return fresh.balanceDue <= 0;
    case 'alreadyCheckedIn': {
      const lane = laneKeyFor(fresh.disposition.slug);
      return !!lane && CHECKED_IN_LANES.includes(lane);
    }
    case 'wrongStage':
    case 'noLongerChangeable':
      return stageChanged(shown, fresh);
    default:
      return false;
  }
}

/**
 * The translation key for a room that could not be released. A 403 and a hostel with no live
 * plan read as they do for any stay move ({@link bookingMoveFailureKey}). The generic key takes
 * the room number as `{{room}}`. `message` is never read.
 */
export function releaseFailureKey(err: unknown, opts: MoveFailureOptions = {}): string {
  if (errorStatus(err) === 0) return 'common.cannotReachTheServer';
  const refused = actionRefusalKey(err, opts);
  if (refused) return refused;
  if (isPlanInactive(err)) return planInactiveKey(opts);
  return bookingRefusal(err) === 'roomAlreadyReleased'
    ? 'hostBookings.roomAlreadyReleased'
    : 'hostBookings.couldNotReleaseRoom';
}

/**
 * The translation key for why a booking's invoice was not marked paid after the booking was.
 * The invoice endpoint sends no refusal of its own worth telling apart, so beyond an
 * unreachable server, a missing invoice, a 403 or a hostel with no live plan, each read as it is
 * for any stay move ({@link bookingMoveFailureKey}), the host is pointed at the invoice itself.
 */
export function crossPayInvoiceFailureKey(err: unknown, opts: MoveFailureOptions = {}): string {
  const status = errorStatus(err);
  if (status === 0) return 'common.cannotReachTheServer';
  if (status === 404) return 'hostBookings.invoiceNoLongerExists';
  const refused = actionRefusalKey(err, opts);
  if (refused) return refused;
  return isPlanInactive(err) ? planInactiveKey(opts) : 'hostBookings.payTheInvoiceOnItsOwn';
}
