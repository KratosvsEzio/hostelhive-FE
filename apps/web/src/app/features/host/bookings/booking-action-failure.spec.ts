import { ApiError } from '@hostelhive/data-access';
import {
  INVOICE_ALREADY_EXISTS_KEY,
  bookingActionFailureKey,
  releaseFailure,
} from './booking-action-failure';

const API_URL = 'http://localhost/api/host/hostels/h1/bookings/b1/checkin';

/** The interceptor's shape, with `message` the URL-bearing diagnostic nothing may show. */
function apiError(
  status: number,
  serverMessages?: readonly string[],
): ApiError {
  return {
    status,
    code: 'unknown_error',
    message: `Http failure response for ${API_URL}: ${status}`,
    serverMessages,
    method: 'POST',
  };
}

describe('bookingActionFailureKey', () => {
  it.each<{ why: string; err: unknown; key: string }>([
    {
      why: 'the server cannot be reached',
      err: apiError(0),
      key: 'common.cannotReachTheServer',
    },
    {
      why: 'a room is short of beds',
      err: apiError(422, ['Room 101 has only 1 bed(s) available']),
      key: 'hostBookings.notEnoughFreeBeds',
    },
    {
      why: 'an invoice already exists',
      err: apiError(422, ['An invoice already exists for this booking']),
      key: INVOICE_ALREADY_EXISTS_KEY,
    },
    {
      why: 'the guest is already checked in',
      err: apiError(422, ['Booking is already checked in']),
      key: 'hostBookings.bookingMovedOn',
    },
    {
      why: 'check-out on a booking not checked in',
      err: apiError(422, ['Only checked-in bookings can be checked out']),
      key: 'hostBookings.bookingMovedOn',
    },
    {
      why: 'check-in on a booking not confirmed',
      err: apiError(422, ['Only confirmed bookings can be checked in']),
      key: 'hostBookings.bookingMovedOn',
    },
    {
      why: 'mark paid on a booking in the wrong stage',
      err: apiError(422, [
        'Only confirmed, checked-in, checked-out or no-show bookings can be marked paid',
      ]),
      key: 'hostBookings.bookingMovedOn',
    },
    {
      why: 'the booking is already paid',
      err: apiError(422, ['This booking is already paid']),
      key: 'hostBookings.bookingMovedOn',
    },
    {
      why: 'the booking can no longer be cancelled',
      err: apiError(422, ['This booking can no longer be cancelled']),
      key: 'hostBookings.bookingMovedOn',
    },
    {
      why: 'an unrecognised refusal',
      err: apiError(422, ['Invalid room ID']),
      key: 'hostBookings.actionNotAccepted',
    },
    {
      why: 'a server error',
      err: apiError(500),
      key: 'hostBookings.actionNotAccepted',
    },
    {
      why: 'a 500 that carries text',
      err: apiError(500, ['PG::UndefinedColumn']),
      key: 'hostBookings.actionNotAccepted',
    },
    {
      why: 'a plain Error',
      err: new Error('booking X not in response'),
      key: 'hostBookings.actionNotAccepted',
    },
    { why: 'null', err: null, key: 'hostBookings.actionNotAccepted' },
  ])('$why → $key', ({ err, key }) => {
    expect(bookingActionFailureKey(err)).toBe(key);
  });

  it('never classifies on the message, even when it reads like a known refusal', () => {
    const err = {
      ...apiError(422),
      message: 'An invoice already exists for this booking',
    };
    expect(bookingActionFailureKey(err)).toBe('hostBookings.actionNotAccepted');
  });
});

describe('releaseFailure', () => {
  it('names the room when the server refuses', () => {
    expect(
      releaseFailure(apiError(422, ['Occupancy is already inactive']), '101'),
    ).toEqual({
      key: 'hostBookings.couldNotReleaseRoom',
      params: { room: '101' },
    });
  });

  it('names the room for a plain Error', () => {
    expect(
      releaseFailure(new Error('booking X not in response'), '7B'),
    ).toEqual({
      key: 'hostBookings.couldNotReleaseRoom',
      params: { room: '7B' },
    });
  });

  it('says the server cannot be reached on status 0', () => {
    expect(releaseFailure(apiError(0), '101')).toEqual({
      key: 'common.cannotReachTheServer',
      params: {},
    });
  });
});
