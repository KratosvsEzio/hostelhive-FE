import { ApiError } from '@hostelhive/data-access';
import { bookingFailureKey } from './booking-failure';

const API_URL = 'http://localhost/api/bookings';

function apiError(status: number, serverMessages?: readonly string[]): ApiError {
  return {
    status,
    code: status === 0 ? 'network_error' : 'unknown_error',
    message: serverMessages?.join(' ') ?? `Http failure response for ${API_URL}: ${status}`,
    serverMessages,
    method: 'POST',
  };
}

describe('bookingFailureKey', () => {
  it.each<{ why: string; err: unknown; key: string }>([
    {
      why: 'the hostel does not accept bookings',
      err: apiError(422, ['This hostel does not accept bookings']),
      key: 'publicBooking.hostelNotTakingBookings',
    },
    {
      why: 'the hostel is inactive',
      err: apiError(422, ['This hostel is not taking bookings right now']),
      key: 'publicBooking.hostelNotTakingBookings',
    },
    {
      why: 'the hostel is unknown (bare 404)',
      err: apiError(404),
      key: 'publicBooking.hostelNotTakingBookings',
    },
    {
      why: 'the check-in has passed',
      err: apiError(422, ['Checkin date cannot be in the past']),
      key: 'publicBooking.checkInHasPassed',
    },
    {
      why: 'a room type was switched off',
      err: apiError(422, ['Deluxe Dorm is not available for booking']),
      key: 'publicBooking.roomNoLongerBookable',
    },
    {
      why: 'the dates are out of order',
      err: apiError(422, ['Checkout date must be after check-in date']),
      key: 'publicBooking.checkOutAfterCheckIn',
    },
    { why: 'the session ended', err: apiError(401), key: 'publicBooking.logInAgainToBook' },
    { why: 'the server cannot be reached', err: apiError(0), key: 'common.cannotReachTheServer' },
    {
      why: 'an unrecognised 422 comes back',
      err: apiError(422, ['Line items must include at least one room']),
      key: 'publicBooking.tryAgain',
    },
    { why: 'a 500 has no envelope', err: apiError(500), key: 'publicBooking.tryAgain' },
    {
      why: 'a 403 carries the closed text',
      err: apiError(403, ['This hostel does not accept bookings']),
      key: 'publicBooking.tryAgain',
    },
    {
      why: 'a mapper throws a plain error',
      err: new Error('booking reference missing from response'),
      key: 'publicBooking.tryAgain',
    },
    { why: 'the rejection is not an object', err: undefined, key: 'publicBooking.tryAgain' },
  ])('returns $key when $why', ({ err, key }) => {
    expect(bookingFailureKey(err)).toBe(key);
  });

  it('never reads the message', () => {
    expect(bookingFailureKey({ status: 422, message: 'Checkin date cannot be in the past' })).toBe(
      'publicBooking.tryAgain',
    );
  });
});
