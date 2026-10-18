import { errorStatus } from '@core/errors/api-error-text';
import { isCrmRequired } from '@core/host-access/host-access';
import { bookingRefusal } from '@util/booking-refusal';
import { LaneKey, laneKeyFor } from './booking-month';
import { HostBooking } from './host-bookings-api';

/**
 * How a refused move's booking differs from the one on screen: `'done'` when the move was
 * already made (checked in, paid), `'movedOn'` when the booking has left the stage the move
 * starts from.
 */
export type MovedOnKind = 'done' | 'movedOn';

/** Who a refused move's message is worded for. */
export interface MoveFailureOptions {
  /**
   * The signed-in user holds the owner's `host` role, so a permission their account lacks is for
   * HostelHive support to grant. Otherwise staff, who are told to ask the owner. Staff by default.
   */
  owner?: boolean;
}

/** The `code` the error interceptor gives a failure whose body carried no code of the server's. */
const NO_SERVER_CODE = 'unknown_error';

/**
 * The translation key for a stay move the server refused: confirm, check in, check out,
 * cancel, no-show, generate invoice or mark paid.
 *
 * Every key is a whole sentence, so it reads on its own in a dialog or footer and as the
 * reason in a "one side succeeded" toast. A 403 says the hostel's plan lacks CRM, or that the
 * signed-in user may not make the move, worded for the owner or staff by `opts.owner`; one
 * carrying any other code of the server's is not told apart. Anything not recognised falls back
 * to the generic message. `message` is never read.
 */
export function bookingMoveFailureKey(err: unknown, opts: MoveFailureOptions = {}): string {
  const status = errorStatus(err);
  if (status === 0) return 'common.cannotReachTheServer';
  if (status === 404) return 'hostBookings.bookingNotFound';
  const forbidden = forbiddenKey(err, opts);
  if (forbidden) return forbidden;

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
 * The translation key for a room that could not be released. A 403 reads as it does for any
 * stay move ({@link bookingMoveFailureKey}). The generic key takes the room number as
 * `{{room}}`. `message` is never read.
 */
export function releaseFailureKey(err: unknown, opts: MoveFailureOptions = {}): string {
  if (errorStatus(err) === 0) return 'common.cannotReachTheServer';
  const forbidden = forbiddenKey(err, opts);
  if (forbidden) return forbidden;
  return bookingRefusal(err) === 'roomAlreadyReleased'
    ? 'hostBookings.roomAlreadyReleased'
    : 'hostBookings.couldNotReleaseRoom';
}

/**
 * The translation key for why a booking's invoice was not marked paid after the booking was.
 * The invoice endpoint sends no refusal of its own worth telling apart, so beyond an
 * unreachable server, a missing invoice or a 403 read as it is for any stay move
 * ({@link bookingMoveFailureKey}), the host is pointed at the invoice itself.
 */
export function crossPayInvoiceFailureKey(err: unknown, opts: MoveFailureOptions = {}): string {
  const status = errorStatus(err);
  if (status === 0) return 'common.cannotReachTheServer';
  if (status === 404) return 'hostBookings.invoiceNoLongerExists';
  return forbiddenKey(err, opts) ?? 'hostBookings.payTheInvoiceOnItsOwn';
}

/**
 * The key for a 403 worth telling the host about, or `null` to leave the caller's own reading.
 *
 * A plan without CRM has its own key. A 403 carrying no code of the server's is a permission the
 * signed-in user's role lacks, worded for the owner or for staff. Any other coded 403, such as
 * the rate limiter's `forbidden`, and every other status give `null`.
 */
function forbiddenKey(err: unknown, opts: MoveFailureOptions): string | null {
  if (errorStatus(err) !== 403) return null;
  if (isCrmRequired(err)) return 'hostBookings.planHasNoCrm';
  if (hasServerCode(err)) return null;
  return opts.owner ? 'hostBookings.notAllowedOwner' : 'hostBookings.notAllowed';
}

/** Whether a failure carries the server's own code, rather than none or the interceptor's fallback. */
function hasServerCode(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { code } = err as { code?: unknown };
  return typeof code === 'string' && code !== '' && code !== NO_SERVER_CODE;
}
