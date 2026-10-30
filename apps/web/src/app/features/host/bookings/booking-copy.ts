import { HostBookingLine } from './host-bookings-api';

/** A translation key and its parameters: copy built in code but rendered through the `transloco` pipe. */
export interface Phrase {
  key: string;
  params?: Record<string, string | number>;
}

/** Translates a key, for copy built in code where no pipe can reach it (filter and column configs). */
export type BookingCopy = (key: string, params?: Record<string, string | number>) => string;

// The app has no plural rules, so every count is a pair: the `…One` key when the count is one,
// the plain key otherwise (`count-singular-locale-parity.spec.ts`). Each key is written out in
// full so `i18n:check` can see it.

/** `{{count}} nights`, singular when one. */
export function nightsPhrase(count: number): Phrase {
  return { key: count === 1 ? 'common.nNightsOne' : 'common.nNights', params: { count } };
}

/** `{{count}} guests`, singular when one. */
export function guestsPhrase(count: number): Phrase {
  return { key: count === 1 ? 'common.nGuestsOne' : 'common.nGuests', params: { count } };
}

/** What one booked line holds: `{{count}} beds` on a shared line, `{{count}} rooms` otherwise. */
export function unitsPhrase(line: Pick<HostBookingLine, 'units' | 'shared'>): Phrase {
  const one = line.units === 1;
  const key = line.shared
    ? one
      ? 'common.nBedsOne'
      : 'common.nBeds'
    : one
      ? 'hostBookings.nRoomsOne'
      : 'hostBookings.nRooms';
  return { key, params: { count: line.units } };
}

/** `{{count}} private rooms`, singular when one — the headline of what a private stay asked for. */
export function privateRoomsPhrase(count: number): Phrase {
  return { key: count === 1 ? 'hostBookings.nPrivateRoomsOne' : 'hostBookings.nPrivateRooms', params: { count } };
}

/** `{{count}} shared beds`, singular when one — the headline of what a shared stay asked for. */
export function sharedBedsPhrase(count: number): Phrase {
  return { key: count === 1 ? 'hostBookings.nSharedBedsOne' : 'hostBookings.nSharedBeds', params: { count } };
}
