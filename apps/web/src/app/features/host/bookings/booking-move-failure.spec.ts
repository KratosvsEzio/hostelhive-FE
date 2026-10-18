import { ApiError } from '@hostelhive/data-access';
import { hostBooking } from '@app/testing/host-builders';
import {
  MovedOnKind,
  bookingMoveFailureKey,
  crossPayInvoiceFailureKey,
  movedOnKind,
  refusalBorneOut,
  releaseFailureKey,
  stageChanged,
} from './booking-move-failure';
import { HostBooking } from './host-bookings-api';

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

/** The 422 refusals a stay move can get that say nothing about the booking having moved on. */
const OTHER_REFUSALS: readonly { why: string; err: unknown }[] = [
  { why: 'a room has too few beds free', err: apiError(422, ['Room 101 has only 1 bed(s) available']) },
  { why: 'the allocation names an unknown room', err: apiError(422, ['Invalid room ID']) },
  { why: 'an invoice already exists', err: apiError(422, ['An invoice already exists for this booking']) },
  { why: 'a cancellation has no reason', err: apiError(422, ['A cancellation reason is required']) },
  { why: 'the hostel does not accept bookings', err: apiError(422, ['This hostel does not accept bookings']) },
  { why: 'the room was already released', err: apiError(422, ['Occupancy is already inactive']) },
  {
    why: 'the booking is within the cutoff',
    err: apiError(422, ['Bookings cannot be cancelled within 3 days of check-in']),
  },
  { why: 'the check-in date is in the past', err: apiError(422, ['Checkin date cannot be in the past']) },
  {
    why: 'the dates are out of order',
    err: apiError(422, ['Checkout date must be after check-in date']),
  },
  { why: 'the room is not bookable', err: apiError(422, ['Room 101 is not available for booking']) },
  { why: 'an unrecognised 422 comes back', err: apiError(422, ['Disposition is invalid']) },
  { why: 'a 422 carries no message', err: apiError(422) },
];

/** Rejections that are not a 422 refusal, several of them carrying text a refusal would. */
const NOT_A_REFUSAL: readonly { why: string; err: unknown }[] = [
  { why: 'the server cannot be reached', err: apiError(0, ['This booking is already paid']) },
  { why: 'a 404 carries a wrong-stage text', err: apiError(404, ['Only confirmed bookings can be checked in']) },
  { why: 'a 500 carries an already-paid text', err: apiError(500, ['This booking is already paid']) },
  { why: 'a mapper throws a plain error', err: new Error('This booking is already paid') },
  { why: 'the rejection is null', err: null },
  { why: 'the rejection is empty', err: {} },
  { why: 'only the message holds the text', err: { status: 422, message: 'This booking is already paid' } },
];

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

describe('movedOnKind', () => {
  it.each<{ why: string; err: unknown }>([
    { why: 'the booking is already checked in', err: apiError(422, ['Booking is already checked in']) },
    { why: 'the booking is already paid', err: apiError(422, ['This booking is already paid']) },
  ])('returns done when $why', ({ err }) => {
    expect(movedOnKind(err)).toBe('done');
  });

  it.each<{ why: string; err: unknown }>([
    {
      why: 'only a confirmed booking can be checked in',
      err: apiError(422, ['Only confirmed bookings can be checked in']),
    },
    {
      why: 'only a confirmed booking can be a no-show',
      err: apiError(422, ['Only confirmed bookings can be marked a no show']),
    },
    {
      why: 'only a checked-in booking can be checked out',
      err: apiError(422, ['Only checked-in bookings can be checked out']),
    },
    {
      why: 'only a checked-in booking can be invoiced',
      err: apiError(422, ['Only checked-in bookings can be invoiced']),
    },
    {
      why: 'the booking is not at a payable stage',
      err: apiError(422, ['Only confirmed, checked-in, checked-out or no-show bookings can be marked paid']),
    },
    {
      why: 'the booking can no longer be cancelled',
      err: apiError(422, ['This booking can no longer be cancelled']),
    },
    {
      why: 'the booking can no longer be updated',
      err: apiError(422, ['This booking can no longer be updated']),
    },
  ])('returns movedOn when $why', ({ err }) => {
    expect(movedOnKind(err)).toBe('movedOn');
  });

  it.each<{ why: string; err: unknown; kind: MovedOnKind }>([
    {
      why: 'an already-checked-in message is reworded',
      err: apiError(422, ['Party is already checked-in']),
      kind: 'done',
    },
    {
      why: 'an already-paid message is reworded',
      err: apiError(422, ['Booking already paid in full']),
      kind: 'done',
    },
    {
      why: 'a wrong-stage message is reworded',
      err: apiError(422, ['Only pending bookings can be confirmed']),
      kind: 'movedOn',
    },
    {
      why: 'a no-longer-changeable message is reworded',
      err: apiError(422, ['This booking can no longer be changed']),
      kind: 'movedOn',
    },
  ])('returns $kind when $why', ({ err, kind }) => {
    expect(movedOnKind(err)).toBe(kind);
  });

  it.each(OTHER_REFUSALS)('returns null when $why', ({ err }) => {
    expect(movedOnKind(err)).toBeNull();
  });

  it.each(NOT_A_REFUSAL)('returns null when $why', ({ err }) => {
    expect(movedOnKind(err)).toBeNull();
  });

  it.each<{ why: string; messages: readonly string[]; kind: MovedOnKind | null }>([
    {
      why: 'an already-checked-in message comes before a wrong-stage one',
      messages: ['Booking is already checked in', 'Only confirmed bookings can be checked in'],
      kind: 'done',
    },
    {
      why: 'an already-checked-in message comes after a wrong-stage one',
      messages: ['Only confirmed bookings can be checked in', 'Booking is already checked in'],
      kind: 'done',
    },
    {
      why: 'a wrong-stage message comes beside an already-paid one',
      messages: ['Only confirmed bookings can be checked in', 'This booking is already paid'],
      kind: 'movedOn',
    },
    {
      why: 'a no-longer-cancellable message comes beside an already-checked-in one',
      messages: ['Booking is already checked in', 'This booking can no longer be cancelled'],
      kind: 'movedOn',
    },
    {
      why: 'a closed-hostel message comes beside an already-checked-in one',
      messages: ['This hostel does not accept bookings', 'Booking is already checked in'],
      kind: null,
    },
    {
      why: 'a too-few-beds message comes beside an already-checked-in one',
      messages: ['Room 101 has only 1 bed(s) available', 'Booking is already checked in'],
      kind: null,
    },
    {
      why: 'an unrecognised message comes beside an already-paid one',
      messages: ['Disposition is invalid', 'This booking is already paid'],
      kind: 'done',
    },
    {
      why: 'a reworded already-checked-in message comes beside an exact wrong-stage one',
      messages: ['Party is already checked-in', 'Only confirmed bookings can be checked in'],
      kind: 'movedOn',
    },
  ])('returns $kind when $why', ({ messages, kind }) => {
    expect(movedOnKind(apiError(422, messages))).toBe(kind);
  });
});

describe('stageChanged', () => {
  it.each<{ why: string; shown: string; fresh: string; changed: boolean }>([
    {
      why: 'the shown legacy slug is renamed on the copy',
      shown: 'room-assigned',
      fresh: 'confirmed',
      changed: false,
    },
    {
      why: 'the shown slug is its legacy name on the copy',
      shown: 'confirmed',
      fresh: 'room-assigned',
      changed: false,
    },
    {
      why: 'the shown legacy pending slug meets a confirmed copy',
      shown: 'pending-allotment',
      fresh: 'confirmed',
      changed: true,
    },
    { why: 'the copy is on another canonical stage', shown: 'confirmed', fresh: 'checked-in', changed: true },
    { why: 'neither slug is one the page has a stage for', shown: 'archived', fresh: 'on-hold', changed: false },
  ])('returns $changed when $why', ({ shown, fresh, changed }) => {
    expect(stageChanged(hostBooking(shown), hostBooking(fresh))).toBe(changed);
  });
});

describe('refusalBorneOut', () => {
  const alreadyPaid = apiError(422, ['This booking is already paid']);
  const alreadyCheckedIn = apiError(422, ['Booking is already checked in']);
  const wrongStage = apiError(422, ['Only confirmed bookings can be checked in']);
  const noLongerChangeable = apiError(422, ['This booking can no longer be cancelled']);

  it.each<{ why: string; fresh: HostBooking; borneOut: boolean }>([
    {
      why: 'nothing is due',
      fresh: hostBooking('checked-in', { paid: 24000, balanceDue: 0 }),
      borneOut: true,
    },
    {
      why: 'the guest has overpaid',
      fresh: hostBooking('checked-in', { paid: 24500, balanceDue: -500 }),
      borneOut: true,
    },
    {
      why: 'one is still due',
      fresh: hostBooking('checked-in', { paid: 23999, balanceDue: 1 }),
      borneOut: false,
    },
    { why: 'the whole total is still due', fresh: hostBooking('checked-in'), borneOut: false },
    {
      why: 'a cancelled copy has nothing due',
      fresh: hostBooking('cancelled', { paid: 24000, balanceDue: 0 }),
      borneOut: true,
    },
  ])('returns $borneOut for an already-paid refusal when $why', ({ fresh, borneOut }) => {
    expect(refusalBorneOut(alreadyPaid, hostBooking('checked-in'), fresh)).toBe(borneOut);
  });

  it.each<{ slug: string; borneOut: boolean }>([
    { slug: 'checked-in', borneOut: true },
    { slug: 'checked-out', borneOut: true },
    { slug: 'confirmed', borneOut: false },
    { slug: 'pending', borneOut: false },
    { slug: 'cancelled', borneOut: false },
    { slug: 'no-show', borneOut: false },
    { slug: 'room-assigned', borneOut: false },
    { slug: 'archived', borneOut: false },
  ])('returns $borneOut for an already-checked-in refusal when the copy is $slug', ({ slug, borneOut }) => {
    expect(refusalBorneOut(alreadyCheckedIn, hostBooking('confirmed'), hostBooking(slug))).toBe(borneOut);
  });

  it.each<{ why: string; err: unknown; fresh: HostBooking; borneOut: boolean }>([
    {
      why: 'a wrong-stage refusal finds the copy on another stage',
      err: wrongStage,
      fresh: hostBooking('checked-in'),
      borneOut: true,
    },
    {
      why: 'a wrong-stage refusal finds the copy on the same stage with other fields changed',
      err: wrongStage,
      fresh: hostBooking('confirmed', { guests: 3, paid: 5000, balanceDue: 19000, notes: 'Late arrival' }),
      borneOut: false,
    },
    {
      why: 'a no-longer-changeable refusal finds the copy on another stage',
      err: noLongerChangeable,
      fresh: hostBooking('cancelled'),
      borneOut: true,
    },
    {
      why: 'a no-longer-changeable refusal finds the copy on the same stage with other fields changed',
      err: noLongerChangeable,
      fresh: hostBooking('confirmed', { guests: 3, paid: 5000, balanceDue: 19000, notes: 'Late arrival' }),
      borneOut: false,
    },
  ])('returns $borneOut when $why', ({ err, fresh, borneOut }) => {
    expect(refusalBorneOut(err, hostBooking('confirmed'), fresh)).toBe(borneOut);
  });

  it.each<{ why: string; err: unknown; shown: string; fresh: string; borneOut: boolean }>([
    {
      why: 'a wrong-stage refusal finds the shown legacy slug renamed on the copy',
      err: wrongStage,
      shown: 'room-assigned',
      fresh: 'confirmed',
      borneOut: false,
    },
    {
      why: 'a wrong-stage refusal finds the shown slug as its legacy name on the copy',
      err: wrongStage,
      shown: 'confirmed',
      fresh: 'room-assigned',
      borneOut: false,
    },
    {
      why: 'a wrong-stage refusal finds a confirmed copy of a booking shown under a legacy pending slug',
      err: wrongStage,
      shown: 'pending-allotment',
      fresh: 'confirmed',
      borneOut: true,
    },
    {
      why: 'a no-longer-changeable refusal finds the shown legacy slug renamed on the copy',
      err: noLongerChangeable,
      shown: 'room-assigned',
      fresh: 'confirmed',
      borneOut: false,
    },
    {
      why: 'a no-longer-changeable refusal finds the shown slug as its legacy name on the copy',
      err: noLongerChangeable,
      shown: 'confirmed',
      fresh: 'room-assigned',
      borneOut: false,
    },
    {
      why: 'a no-longer-changeable refusal finds a confirmed copy of a booking shown under a legacy pending slug',
      err: noLongerChangeable,
      shown: 'pending-allotment',
      fresh: 'confirmed',
      borneOut: true,
    },
  ])('returns $borneOut when $why', ({ err, shown, fresh, borneOut }) => {
    expect(refusalBorneOut(err, hostBooking(shown), hostBooking(fresh))).toBe(borneOut);
  });

  it.each([...OTHER_REFUSALS, ...NOT_A_REFUSAL])(
    'returns false when $why, even against a copy that differs in stage and balance',
    ({ err }) => {
      const fresh = hostBooking('checked-in', { paid: 24000, balanceDue: 0 });
      expect(refusalBorneOut(err, hostBooking('confirmed'), fresh)).toBe(false);
    },
  );
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
