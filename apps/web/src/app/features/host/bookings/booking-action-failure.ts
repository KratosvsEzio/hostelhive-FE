import { errorStatus, serverText } from '@core/errors/api-error-text';

/** The key shown when a second invoice is refused because one already exists. */
export const INVOICE_ALREADY_EXISTS_KEY = 'hostBookings.invoiceAlreadyExists';

/** Refusals that mean the booking left the stage the page showed it in. */
const MOVED_ON =
  /\balready (checked in|paid|inactive)\b|\bonly [\w ,-]+ bookings can be\b|\bcan no longer be\b/;

/**
 * The translation key for a move on a booking the server refused.
 *
 * Covers confirm, check-in, check-out, cancel, no-show, mark paid and invoicing. Only the few
 * refusals a host can act on get their own copy; everything else is the generic message.
 * `message` is never read.
 */
export function bookingActionFailureKey(err: unknown): string {
  if (errorStatus(err) === 0) return 'common.cannotReachTheServer';
  const text = serverText(err);
  if (/\bhas only \d+ bed\(?s?\)? available\b/.test(text))
    return 'hostBookings.notEnoughFreeBeds';
  if (/\ban invoice already exists\b/.test(text))
    return INVOICE_ALREADY_EXISTS_KEY;
  if (MOVED_ON.test(text)) return 'hostBookings.bookingMovedOn';
  return 'hostBookings.actionNotAccepted';
}

/** What to show when a room could not be released: a translation key and its params. */
export interface ReleaseFailure {
  readonly key: string;
  readonly params: Readonly<Record<string, string>>;
}

/** The key and params for a room the host could not release from a booking. */
export function releaseFailure(
  err: unknown,
  roomNumber: string,
): ReleaseFailure {
  if (errorStatus(err) === 0)
    return { key: 'common.cannotReachTheServer', params: {} };
  return {
    key: 'hostBookings.couldNotReleaseRoom',
    params: { room: roomNumber },
  };
}
