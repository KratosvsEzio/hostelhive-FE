import { ApiError } from '@hostelhive/data-access';
import {
  bookingMoveFailureKey,
  crossPayInvoiceFailureKey,
  releaseFailureKey,
} from './booking-move-failure';

const API_URL = 'http://localhost/api/host/hostels/h1/bookings/b1/mark_as_checked_in';

function apiError(status: number, serverMessages?: readonly string[]): ApiError {
  return {
    status,
    code: status === 0 ? 'network_error' : 'unknown_error',
    message: serverMessages?.join(' ') ?? `Http failure response for ${API_URL}: ${status}`,
    serverMessages,
    method: 'POST',
  };
}

describe('bookingMoveFailureKey', () => {
  it.each<{ why: string; err: unknown; key: string }>([
    {
      why: 'a room has too few beds free',
      err: apiError(422, ['Room 101 has only 1 bed(s) available']),
      key: 'hostBookings.notEnoughBedsFree',
    },
    {
      why: 'the booking is already checked in',
      err: apiError(422, ['Booking is already checked in']),
      key: 'hostBookings.alreadyCheckedIn',
    },
    {
      why: 'only a confirmed booking can be checked in',
      err: apiError(422, ['Only confirmed bookings can be checked in']),
      key: 'hostBookings.bookingHasMovedOn',
    },
    {
      why: 'only a checked-in booking can be checked out',
      err: apiError(422, ['Only checked-in bookings can be checked out']),
      key: 'hostBookings.bookingHasMovedOn',
    },
    {
      why: 'only a checked-in booking can be invoiced',
      err: apiError(422, ['Only checked-in bookings can be invoiced']),
      key: 'hostBookings.bookingHasMovedOn',
    },
    {
      why: 'only a confirmed booking can be a no-show',
      err: apiError(422, ['Only confirmed bookings can be marked a no show']),
      key: 'hostBookings.bookingHasMovedOn',
    },
    {
      why: 'the booking is not at a payable stage',
      err: apiError(422, ['Only confirmed, checked-in, checked-out or no-show bookings can be marked paid']),
      key: 'hostBookings.bookingHasMovedOn',
    },
    {
      why: 'the booking is already paid',
      err: apiError(422, ['This booking is already paid']),
      key: 'hostBookings.bookingAlreadyPaid',
    },
    {
      why: 'an invoice already exists',
      err: apiError(422, ['An invoice already exists for this booking']),
      key: 'hostBookings.invoiceAlreadyExists',
    },
    {
      why: 'a cancellation has no reason',
      err: apiError(422, ['A cancellation reason is required']),
      key: 'hostBookings.giveTheGuestAReason',
    },
    {
      why: 'the allocation names an unknown room',
      err: apiError(422, ['Invalid room ID']),
      key: 'hostBookings.checkTheRoomsPicked',
    },
    {
      why: 'the hostel does not accept bookings',
      err: apiError(422, ['This hostel does not accept bookings']),
      key: 'hostBookings.notSetUpForBookings',
    },
    { why: 'the booking is gone', err: apiError(404, ['Not Found']), key: 'hostBookings.bookingNotFound' },
    { why: 'the server cannot be reached', err: apiError(0), key: 'common.cannotReachTheServer' },
    {
      why: 'an unrecognised 422 comes back',
      err: apiError(422, ['Disposition is invalid']),
      key: 'hostBookings.moveNotAccepted',
    },
    { why: 'a 500 has no envelope', err: apiError(500), key: 'hostBookings.moveNotAccepted' },
    {
      why: 'a mapper throws a plain error',
      err: new Error('booking b1 not in response'),
      key: 'hostBookings.moveNotAccepted',
    },
    { why: 'the rejection is null', err: null, key: 'hostBookings.moveNotAccepted' },
  ])('returns $key when $why', ({ err, key }) => {
    expect(bookingMoveFailureKey(err)).toBe(key);
  });

  it('never reads the message', () => {
    expect(bookingMoveFailureKey({ status: 422, message: 'This booking is already paid' })).toBe(
      'hostBookings.moveNotAccepted',
    );
  });
});

describe('releaseFailureKey', () => {
  it.each<{ why: string; err: unknown; key: string }>([
    {
      why: 'the room was already released',
      err: apiError(422, ['Occupancy is already inactive']),
      key: 'hostBookings.roomAlreadyReleased',
    },
    { why: 'the server cannot be reached', err: apiError(0), key: 'common.cannotReachTheServer' },
    { why: 'the occupancy is gone', err: apiError(404, ['Not Found']), key: 'hostBookings.couldNotReleaseRoom' },
    {
      why: 'an unrecognised 422 comes back',
      err: apiError(422, ['Room 101 is locked']),
      key: 'hostBookings.couldNotReleaseRoom',
    },
    { why: 'the rejection is null', err: null, key: 'hostBookings.couldNotReleaseRoom' },
  ])('returns $key when $why', ({ err, key }) => {
    expect(releaseFailureKey(err)).toBe(key);
  });

  it('never reads the message', () => {
    expect(releaseFailureKey({ status: 422, message: 'Occupancy is already inactive' })).toBe(
      'hostBookings.couldNotReleaseRoom',
    );
  });
});

describe('crossPayInvoiceFailureKey', () => {
  it.each<{ why: string; err: unknown; key: string }>([
    { why: 'the server cannot be reached', err: apiError(0), key: 'common.cannotReachTheServer' },
    { why: 'the invoice is gone', err: apiError(404, ['Not Found']), key: 'hostBookings.invoiceNoLongerExists' },
    {
      why: 'the invoice is refused',
      err: apiError(422, ['Status is invalid']),
      key: 'hostBookings.payTheInvoiceOnItsOwn',
    },
    { why: 'a 500 has no envelope', err: apiError(500), key: 'hostBookings.payTheInvoiceOnItsOwn' },
    { why: 'the rejection is empty', err: {}, key: 'hostBookings.payTheInvoiceOnItsOwn' },
  ])('returns $key when $why', ({ err, key }) => {
    expect(crossPayInvoiceFailureKey(err)).toBe(key);
  });
});
