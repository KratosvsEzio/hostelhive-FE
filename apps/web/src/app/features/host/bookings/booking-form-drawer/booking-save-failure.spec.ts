import { ApiError } from '@hostelhive/data-access';
import { bookingSaveFailureKey } from './booking-save-failure';

const API_URL = 'http://localhost/api/host/hostels/h1/bookings';

function apiError(status: number, serverMessages?: readonly string[], code = 'unknown_error'): ApiError {
  return {
    status,
    code,
    message: serverMessages?.join(' ') ?? `Http failure response for ${API_URL}: ${status}`,
    serverMessages,
    method: 'POST',
  };
}

describe('bookingSaveFailureKey', () => {
  it.each<{ why: string; err: unknown; key: string }>([
    {
      why: 'the plan has no CRM',
      err: apiError(403, ['Upgrade to a plan with CRM'], 'crm_required'),
      key: 'hostBookings.crmRequired',
    },
    {
      why: 'the hostel does not accept bookings',
      err: apiError(422, ['This hostel does not accept bookings']),
      key: 'hostBookings.notSetUpForBookings',
    },
    {
      why: 'the hostel is inactive',
      err: apiError(422, ['This hostel is not taking bookings right now']),
      key: 'hostBookings.notSetUpForBookings',
    },
    {
      why: 'the check-in is in the past',
      err: apiError(422, ['Checkin date cannot be in the past']),
      key: 'hostBookings.checkInCannotBeInPast',
    },
    {
      why: 'a room type is switched off',
      err: apiError(422, ['Deluxe Dorm is not available for booking']),
      key: 'hostBookings.roomTypeNotBookable',
    },
    {
      why: 'the dates are out of order',
      err: apiError(422, ['Checkout date must be after check-in date']),
      key: 'hostBookings.checkOutAfterCheckIn',
    },
    { why: 'the server cannot be reached', err: apiError(0), key: 'common.cannotReachTheServer' },
    {
      why: 'a 403 has no CRM code',
      err: apiError(403, ['You are not authorized']),
      key: 'hostBookings.couldNotSaveBooking',
    },
    {
      why: 'the crm code arrives on another status',
      err: apiError(422, ['Upgrade'], 'crm_required'),
      key: 'hostBookings.couldNotSaveBooking',
    },
    {
      why: 'a guest-only refusal comes back',
      err: apiError(422, ['This booking can no longer be updated']),
      key: 'hostBookings.couldNotSaveBooking',
    },
    { why: 'a 500 has no envelope', err: apiError(500), key: 'hostBookings.couldNotSaveBooking' },
    {
      why: 'a mapper throws a plain error',
      err: new Error('Hostel response did not include a hostel.'),
      key: 'hostBookings.couldNotSaveBooking',
    },
    { why: 'the rejection is not an object', err: 'boom', key: 'hostBookings.couldNotSaveBooking' },
  ])('returns $key when $why', ({ err, key }) => {
    expect(bookingSaveFailureKey(err)).toBe(key);
  });

  it('never reads the message', () => {
    expect(bookingSaveFailureKey({ status: 422, message: 'Checkin date cannot be in the past' })).toBe(
      'hostBookings.couldNotSaveBooking',
    );
  });
});
