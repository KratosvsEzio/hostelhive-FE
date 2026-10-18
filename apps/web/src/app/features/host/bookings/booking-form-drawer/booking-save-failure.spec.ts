import { ApiError } from '@hostelhive/data-access';
import { CRM_REQUIRED_MESSAGE } from '@core/host-access/host-access';
import {
  CANCAN_403_BODY,
  CANCAN_MESSAGE,
  CRM_MESSAGE_ONLY_BODY,
  CRM_REQUIRED_BODY,
  RATE_LIMITED_BODY,
  RENDER_403_BODY,
  interceptedError,
} from '@app/testing/backend-refusals';
import { bookingSaveFailureKey } from './booking-save-failure';

const API_URL = 'http://localhost/api/host/hostels/h1/bookings';
const POST_BOOKINGS = { method: 'POST', url: 'https://api.test/api/host/hostels/h1/bookings' };

const NOT_ALLOWED = 'hostBookings.notAllowed';
const NOT_ALLOWED_OWNER = 'hostBookings.notAllowedOwner';
const CRM_REQUIRED = 'hostBookings.crmRequired';
const COULD_NOT_SAVE = 'hostBookings.couldNotSaveBooking';

const ROLES = [
  { role: 'staff', opts: { owner: false } },
  { role: 'owner', opts: { owner: true } },
] as const;

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
      why: 'a 403 carries no server code, so the role lacks the permission',
      err: apiError(403, ['You are not authorized']),
      key: 'hostBookings.notAllowed',
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

  describe('a 403 with no server code', () => {
    it.each([
      { why: 'a CanCan text', err: apiError(403, [CANCAN_MESSAGE]) },
      { why: 'no text at all', err: apiError(403) },
    ])('reads as a refused action for staff when no role is given, with $why', ({ err }) => {
      expect(bookingSaveFailureKey(err)).toBe(NOT_ALLOWED);
    });

    it.each([
      { owner: true, key: NOT_ALLOWED_OWNER },
      { owner: false, key: NOT_ALLOWED },
    ])('is worded as $key when owner is $owner', ({ owner, key }) => {
      expect(bookingSaveFailureKey(apiError(403, [CANCAN_MESSAGE]), { owner })).toBe(key);
    });

    it.each(ROLES)('is not read as a booking refusal by its text, for $role', ({ opts }) => {
      const err = apiError(403, ['Checkin date cannot be in the past']);
      expect(bookingSaveFailureKey(err, opts)).toBe(opts.owner ? NOT_ALLOWED_OWNER : NOT_ALLOWED);
    });
  });

  describe('a plan without CRM', () => {
    it.each(ROLES)('is recognised by its message alone, for $role', ({ opts }) => {
      expect(bookingSaveFailureKey(apiError(403, [CRM_REQUIRED_MESSAGE]), opts)).toBe(CRM_REQUIRED);
      expect(bookingSaveFailureKey(apiError(403, ['Other', CRM_REQUIRED_MESSAGE]), opts)).toBe(CRM_REQUIRED);
    });

    it.each(ROLES)('is recognised by its code, whatever the text says, for $role', ({ opts }) => {
      expect(bookingSaveFailureKey(apiError(403, undefined, 'crm_required'), opts)).toBe(CRM_REQUIRED);
      expect(bookingSaveFailureKey(apiError(403, [CANCAN_MESSAGE], 'crm_required'), opts)).toBe(CRM_REQUIRED);
    });
  });

  describe('a 403 with a code of the server', () => {
    it.each([
      { why: 'no text', err: apiError(403, undefined, 'forbidden') },
      { why: 'its own text', err: apiError(403, ['Forbidden'], 'forbidden') },
      { why: 'a CanCan text', err: apiError(403, [CANCAN_MESSAGE], 'forbidden') },
    ])('stays the generic message for both roles, with $why', ({ err }) => {
      for (const { opts } of ROLES) expect(bookingSaveFailureKey(err, opts)).toBe(COULD_NOT_SAVE);
    });
  });

  it.each([
    { why: 'the server cannot be reached', err: apiError(0), key: 'common.cannotReachTheServer' },
    {
      why: 'a booking is refused',
      err: apiError(422, ['Checkin date cannot be in the past']),
      key: 'hostBookings.checkInCannotBeInPast',
    },
    { why: 'the server fails', err: apiError(500), key: COULD_NOT_SAVE },
  ])('words $why the same for an owner as for staff', ({ err, key }) => {
    expect(bookingSaveFailureKey(err, { owner: true })).toBe(key);
    expect(bookingSaveFailureKey(err, { owner: false })).toBe(key);
  });

  describe("on the backend's real bodies, through the error interceptor", () => {
    it.each([
      { name: 'a CanCan refusal', body: CANCAN_403_BODY, staff: NOT_ALLOWED, owner: NOT_ALLOWED_OWNER },
      { name: 'a render_403 refusal', body: RENDER_403_BODY, staff: NOT_ALLOWED, owner: NOT_ALLOWED_OWNER },
      { name: 'a plan without CRM', body: CRM_REQUIRED_BODY, staff: CRM_REQUIRED, owner: CRM_REQUIRED },
      {
        name: 'a plan without CRM, message only',
        body: CRM_MESSAGE_ONLY_BODY,
        staff: CRM_REQUIRED,
        owner: CRM_REQUIRED,
      },
      { name: 'a throttled client', body: RATE_LIMITED_BODY, staff: COULD_NOT_SAVE, owner: COULD_NOT_SAVE },
    ])('reads $name as $staff for staff and $owner for the owner', ({ body, staff, owner }) => {
      const err = interceptedError(403, body, POST_BOOKINGS);
      expect(bookingSaveFailureKey(err, { owner: false })).toBe(staff);
      expect(bookingSaveFailureKey(err, { owner: true })).toBe(owner);
    });
  });
});
