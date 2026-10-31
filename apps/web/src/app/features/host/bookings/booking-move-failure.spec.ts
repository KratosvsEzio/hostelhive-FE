import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiError } from '@hostelhive/data-access';
import { apiErrorWithCode, hostBooking } from '@app/testing/host-builders';
import { API_CONFIG } from '@core/api-config';
import { CRM_REQUIRED_CODE, CRM_REQUIRED_MESSAGE } from '@core/host-access/host-access';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import {
  MoveFailureOptions,
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

/** The backend's CanCan refusal, and the same text its host and manager check sends. */
const CANCAN = 'You are not authorized to access this page.';
const UNREACHABLE = 'common.cannotReachTheServer';
const PLAN_HAS_NO_CRM = 'hostBookings.planHasNoCrm';
const OWNER: MoveFailureOptions = { owner: true };
/** The keys only a 403 may read as. */
const FORBIDDEN_KEY = /^hostBookings\.(notAllowed|notAllowedOwner|planHasNoCrm)$/;

/** One 422 text of every kind `bookingRefusal` tells apart. */
const REFUSAL_TEXTS: readonly string[] = [
  'This hostel does not accept bookings',
  'This booking can no longer be cancelled',
  'Bookings cannot be cancelled within 3 days of check-in',
  'Checkin date cannot be in the past',
  'Checkout date must be after check-in date',
  'Room 101 is not available for booking',
  'Room 101 has only 1 bed(s) available',
  'Booking is already checked in',
  'Only confirmed bookings can be checked in',
  'This booking is already paid',
  'An invoice already exists for this booking',
  'Occupancy is already inactive',
  'A cancellation reason is required',
  'Invalid room ID',
];

interface Classifier {
  name: string;
  fn: (err: unknown, opts?: MoveFailureOptions) => string;
  /** What a refusal it does not tell apart reads as. */
  fallback: string;
  /** What a 404 reads as. */
  notFound: string;
  /** A 422 text, and what it reads as. */
  refusal: { text: string; key: string };
}

const CLASSIFIERS: readonly Classifier[] = [
  {
    name: 'bookingMoveFailureKey',
    fn: bookingMoveFailureKey,
    fallback: 'hostBookings.moveNotAccepted',
    notFound: 'hostBookings.bookingNotFound',
    refusal: { text: 'Room 101 has only 1 bed(s) available', key: 'hostBookings.notEnoughBedsFree' },
  },
  {
    name: 'releaseFailureKey',
    fn: releaseFailureKey,
    fallback: 'hostBookings.couldNotReleaseRoom',
    notFound: 'hostBookings.couldNotReleaseRoom',
    refusal: { text: 'Occupancy is already inactive', key: 'hostBookings.roomAlreadyReleased' },
  },
  {
    name: 'crossPayInvoiceFailureKey',
    fn: crossPayInvoiceFailureKey,
    fallback: 'hostBookings.payTheInvoiceOnItsOwn',
    notFound: 'hostBookings.invoiceNoLongerExists',
    refusal: { text: 'Status is invalid', key: 'hostBookings.payTheInvoiceOnItsOwn' },
  },
];

/** Who is signed in, and the permission sentence a 403 reads as for them. */
const ROLES: readonly { role: string; opts: MoveFailureOptions; permission: string }[] = [
  { role: 'staff', opts: { owner: false }, permission: 'hostBookings.notAllowed' },
  { role: 'owner', opts: { owner: true }, permission: 'hostBookings.notAllowedOwner' },
];

/** Each case once per role, so a test reads `{ ...the case, role, opts, permission }`. */
function perRole<T extends object>(cases: readonly T[]) {
  return cases.flatMap((c) => ROLES.map((r) => ({ ...c, ...r })));
}

describe.each(CLASSIFIERS)('$name when the server answers 403', ({ fn, fallback, notFound, refusal }) => {
  it.each<{ why: string; opts: MoveFailureOptions | undefined }>([
    { why: 'no options are given', opts: undefined },
    { why: 'the options are empty', opts: {} },
    { why: 'the owner flag is off', opts: { owner: false } },
    { why: 'the owner flag is unset', opts: { owner: undefined } },
  ])('names the staff permission when $why', ({ opts }) => {
    expect(fn(apiError(403, [CANCAN]), opts)).toBe('hostBookings.notAllowed');
  });

  it('names the owner permission when the owner flag is on', () => {
    expect(fn(apiError(403, [CANCAN]), { owner: true })).toBe('hostBookings.notAllowedOwner');
  });

  it.each(
    perRole<{ why: string; err: unknown }>([
      { why: 'the body carried no message', err: apiError(403) },
      { why: 'the body carried an empty list of messages', err: apiError(403, []) },
      { why: 'it is a bare status', err: { status: 403 } },
      { why: 'the code is missing', err: { status: 403, serverMessages: [CANCAN] } },
      { why: 'the code is empty', err: { ...apiError(403, [CANCAN]), code: '' } },
      { why: 'the code is a number', err: { ...apiError(403, [CANCAN]), code: 42 } },
    ]),
  )('names the $role permission when $why', ({ err, opts, permission }) => {
    expect(fn(err, opts)).toBe(permission);
  });

  it.each(
    perRole<{ why: string; err: unknown }>([
      {
        why: 'the code and the message both come back',
        err: apiErrorWithCode(403, CRM_REQUIRED_CODE, [CRM_REQUIRED_MESSAGE]),
      },
      { why: 'only the code comes back', err: apiErrorWithCode(403, CRM_REQUIRED_CODE) },
      {
        why: 'the code comes back beside a message that says something else',
        err: apiErrorWithCode(403, CRM_REQUIRED_CODE, [CANCAN]),
      },
    ]),
  )('names the plan for the $role when $why', ({ err, opts }) => {
    expect(fn(err, opts)).toBe(PLAN_HAS_NO_CRM);
  });

  it.each(
    perRole<{ why: string; err: unknown }>([
      { why: 'only the message comes back', err: apiError(403, [CRM_REQUIRED_MESSAGE]) },
      {
        why: 'only the message comes back and the status has no code',
        err: { status: 403, serverMessages: [CRM_REQUIRED_MESSAGE] },
      },
      {
        why: 'the message comes beside another',
        err: apiError(403, [CANCAN, CRM_REQUIRED_MESSAGE]),
      },
    ]),
  )('names the plan for the $role when $why', ({ err, opts }) => {
    expect(fn(err, opts)).toBe(PLAN_HAS_NO_CRM);
  });

  it.each(
    perRole<{ why: string; err: unknown }>([
      { why: 'the code is forbidden', err: apiErrorWithCode(403, 'forbidden') },
      { why: 'the code is forbidden beside a message', err: apiErrorWithCode(403, 'forbidden', ['Forbidden']) },
      {
        why: 'the code is forbidden beside the CanCan message',
        err: apiErrorWithCode(403, 'forbidden', [CANCAN]),
      },
      { why: 'the code is one nobody has heard of', err: apiErrorWithCode(403, 'ip_blocked', [CANCAN]) },
      {
        why: 'the code is forbidden beside the text of a 422 refusal',
        err: apiErrorWithCode(403, 'forbidden', ['This booking is already paid']),
      },
    ]),
  )('keeps the generic reading for the $role when $why', ({ err, opts }) => {
    expect(fn(err, opts)).toBe(fallback);
  });

  it.each(REFUSAL_TEXTS)('names the permission, not the refusal, when the 403 carries "%s"', (text) => {
    const err = apiError(403, [text]);
    for (const { role, opts, permission } of ROLES) expect(fn(err, opts), role).toBe(permission);
  });

  it.each(
    perRole<{ why: string; err: unknown }>([
      { why: 'only the message holds the plan text', err: { status: 403, message: CRM_REQUIRED_MESSAGE } },
      {
        why: 'only the message holds the text of a 422 refusal',
        err: { status: 403, message: 'This booking is already paid' },
      },
      {
        why: 'only the message holds the text of a wrong-stage refusal',
        err: { status: 403, message: 'Only confirmed bookings can be checked in' },
      },
      {
        why: 'the diagnostic message holds the plan text',
        err: { ...apiError(403), message: CRM_REQUIRED_MESSAGE },
      },
    ]),
  )('names the $role permission when $why', ({ err, opts, permission }) => {
    expect(fn(err, opts)).toBe(permission);
  });

  describe('for anything that is not a 403, the owner flag changes nothing', () => {
    it('reads an unreachable server as unreachable', () => {
      expect(fn(apiError(0), OWNER)).toBe(UNREACHABLE);
    });

    it('reads a 404 as it always did', () => {
      expect(fn(apiError(404, ['Not Found']), OWNER)).toBe(notFound);
    });

    it('reads a 422 it tells apart as it always did', () => {
      expect(fn(apiError(422, [refusal.text]), OWNER)).toBe(refusal.key);
    });

    it.each<{ why: string; err: unknown }>([
      { why: 'a 401', err: apiError(401, ['Unauthorized']) },
      { why: 'a 401 carrying the CanCan text', err: apiError(401, [CANCAN]) },
      { why: 'a 400', err: apiError(400, ['Bad request']) },
      { why: 'a 500', err: apiError(500) },
      { why: 'a plain error', err: new Error('booking b1 not in response') },
      { why: 'a null rejection', err: null },
      { why: 'an empty rejection', err: {} },
      { why: 'a 422 nothing recognises', err: apiError(422, ['Disposition is invalid']) },
      { why: 'a 422 with no message', err: apiError(422) },
    ])('still falls back to the generic reading for $why', ({ err }) => {
      expect(fn(err, OWNER)).toBe(fallback);
    });

    it.each(REFUSAL_TEXTS)('reads a 422 carrying "%s" as it does without the flag', (text) => {
      const err = apiError(422, [text]);
      expect(fn(err, OWNER)).toBe(fn(err));
      expect(fn(err, OWNER)).not.toMatch(FORBIDDEN_KEY);
    });

    describe.each([0, 404, 422, 500])('on a %i', (status) => {
      const unchanged: Record<number, string> = {
        0: UNREACHABLE,
        404: notFound,
        422: fallback,
        500: fallback,
      };

      it.each<{ why: string; err: unknown }>([
        {
          why: 'the plan code and message come back',
          err: apiErrorWithCode(status, CRM_REQUIRED_CODE, [CRM_REQUIRED_MESSAGE]),
        },
        { why: 'only the plan code comes back', err: apiErrorWithCode(status, CRM_REQUIRED_CODE) },
        { why: 'only the plan message comes back', err: apiError(status, [CRM_REQUIRED_MESSAGE]) },
        { why: 'the CanCan message comes back', err: apiError(status, [CANCAN]) },
      ])('reads as it did when $why', ({ err }) => {
        expect(fn(err, OWNER)).toBe(unchanged[status]);
      });
    });
  });
});

describe('a 403 as the error interceptor delivers it', () => {
  const BASE = 'https://api.test';
  const url = `${BASE}/api/host/hostels/h1/bookings/b1/mark_as_confirmed`;
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** What a move rejects with when the server answers 403 with `body`, after the interceptor normalised it. */
  function refusedWith(body: unknown): ApiError {
    let caught: ApiError | undefined;
    http.post(url, {}).subscribe({ error: (e: ApiError) => (caught = e) });
    httpMock.expectOne(url).flush(body, { status: 403, statusText: 'Forbidden' });
    expect(caught?.status).toBe(403);
    return caught as ApiError;
  }

  describe.each(CLASSIFIERS)('$name', ({ fn, fallback }) => {
    it.each(
      perRole<{ why: string; body: unknown }>([
        { why: 'a CanCan refusal sent as { error }', body: { success: false, error: CANCAN } },
        { why: 'a refusal of a user who is neither host nor manager sent as { errors }', body: { errors: [CANCAN] } },
      ]),
    )('names the $role permission for $why', ({ body, opts, permission }) => {
      expect(fn(refusedWith(body), opts)).toBe(permission);
    });

    it.each(ROLES)('names the plan for the $role when the body carries crm_required', ({ opts }) => {
      const body = { success: false, code: CRM_REQUIRED_CODE, errors: [CRM_REQUIRED_MESSAGE] };
      expect(fn(refusedWith(body), opts)).toBe(PLAN_HAS_NO_CRM);
    });

    it.each(ROLES)('keeps the generic reading for the $role when the body carries forbidden', ({ opts }) => {
      const body = { success: false, code: 'forbidden', errors: ['Forbidden'] };
      expect(fn(refusedWith(body), opts)).toBe(fallback);
    });
  });
});

describe.each(CLASSIFIERS)('$name when the server answers 400 for a hostel with no live plan', ({ fn, fallback }) => {
  const SUBSCRIBE = 'You need to subscribe to avail the services';

  it.each<{ why: string; opts: MoveFailureOptions | undefined; key: string }>([
    { why: 'no options are given', opts: undefined, key: 'hostAccess.offlineStaff' },
    { why: 'the owner flag is off', opts: { owner: false }, key: 'hostAccess.offlineStaff' },
    { why: 'the owner flag is on', opts: OWNER, key: 'hostAccess.offline' },
  ])('names the plan for the right audience when $why', ({ opts, key }) => {
    expect(fn(apiError(400, [SUBSCRIBE]), opts)).toBe(key);
  });

  it('reads any other 400 as it always did', () => {
    expect(fn(apiError(400, ['Something else is wrong']), OWNER)).toBe(fallback);
  });

  it('never reads the message', () => {
    expect(fn({ status: 400, message: SUBSCRIBE }, OWNER)).toBe(fallback);
  });

  it('lets the permission refusal win over the plan one', () => {
    expect(fn(apiError(403, [CANCAN]), OWNER)).toBe('hostBookings.notAllowedOwner');
  });

  it('lets a plan without CRM win over the plan being inactive', () => {
    const err = apiError(403, [CRM_REQUIRED_MESSAGE]);
    expect(fn({ ...err, code: CRM_REQUIRED_CODE, serverMessages: [CRM_REQUIRED_MESSAGE, SUBSCRIBE] }, OWNER)).toBe(
      PLAN_HAS_NO_CRM,
    );
  });
});
