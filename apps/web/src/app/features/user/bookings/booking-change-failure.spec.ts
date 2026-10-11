import { ApiError } from '@hostelhive/data-access';
import { BookingChangeAction, changeFailureKey } from './booking-change-failure';

const API_URL = 'http://localhost/api/bookings/b1';

function apiError(status: number, serverMessages?: readonly string[]): ApiError {
  return {
    status,
    code: status === 0 ? 'network_error' : 'unknown_error',
    message: serverMessages?.join(' ') ?? `Http failure response for ${API_URL}: ${status}`,
    serverMessages,
    method: 'PATCH',
  };
}

describe('changeFailureKey', () => {
  it.each<{ why: string; err: unknown; action: BookingChangeAction; key: string }>([
    {
      why: 'an update lands within the cutoff',
      err: apiError(422, ['Bookings cannot be updated within 3 days of check-in']),
      action: 'update',
      key: 'userBookings.withinCutoff',
    },
    {
      why: 'a cancel lands within the cutoff',
      err: apiError(422, ['Bookings cannot be cancelled within 3 days of check-in']),
      action: 'cancel',
      key: 'userBookings.withinCutoff',
    },
    {
      why: 'the booking can no longer be updated',
      err: apiError(422, ['This booking can no longer be updated']),
      action: 'update',
      key: 'userBookings.noLongerEditable',
    },
    {
      why: 'the booking can no longer be cancelled',
      err: apiError(422, ['This booking can no longer be cancelled']),
      action: 'cancel',
      key: 'userBookings.noLongerCancellable',
    },
    {
      why: 'a newly picked room type is switched off',
      err: apiError(422, ['Mixed Dorm is not available for booking']),
      action: 'update',
      key: 'userBookings.roomNoLongerBookable',
    },
    {
      why: 'the dates are out of order',
      err: apiError(422, ['Checkout date must be after check-in date']),
      action: 'update',
      key: 'userBookings.checkOutAfterCheckIn',
    },
    { why: 'the booking is gone', err: apiError(404), action: 'cancel', key: 'userBookings.bookingNotFound' },
    { why: 'the server cannot be reached', err: apiError(0), action: 'update', key: 'common.cannotReachTheServer' },
    {
      why: 'a closed-hostel 422 comes back',
      err: apiError(422, ['This hostel is not taking bookings right now']),
      action: 'update',
      key: 'userBookings.changeFailed',
    },
    { why: 'a cancel gets a 500 with no envelope', err: apiError(500), action: 'cancel', key: 'userBookings.cancelFailed' },
    { why: 'an update gets a 500 with no envelope', err: apiError(500), action: 'update', key: 'userBookings.changeFailed' },
    { why: 'a cancel gets a URL-bearing 403', err: apiError(403), action: 'cancel', key: 'userBookings.cancelFailed' },
    {
      why: 'a cancel mapper throws a plain error',
      err: new Error('booking b1 not in response'),
      action: 'cancel',
      key: 'userBookings.cancelFailed',
    },
    {
      why: 'a mapper throws a plain error',
      err: new Error('booking b1 not in response'),
      action: 'update',
      key: 'userBookings.changeFailed',
    },
    { why: 'the rejection is null', err: null, action: 'cancel', key: 'userBookings.cancelFailed' },
  ])('returns $key when $why', ({ err, action, key }) => {
    expect(changeFailureKey(err, action)).toBe(key);
  });

  it('never reads the message', () => {
    expect(
      changeFailureKey({ status: 422, message: 'This booking can no longer be cancelled' }, 'cancel'),
    ).toBe('userBookings.cancelFailed');
  });
});
