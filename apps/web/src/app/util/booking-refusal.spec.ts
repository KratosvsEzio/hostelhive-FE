import { ApiError } from '@hostelhive/data-access';
import { BookingRefusal, bookingRefusal } from './booking-refusal';

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

describe('bookingRefusal', () => {
  it.each<{ text: string; kind: BookingRefusal }>([
    { text: 'This hostel does not accept bookings', kind: 'bookingsClosed' },
    { text: 'This hostel is not taking bookings right now', kind: 'bookingsClosed' },
    { text: 'This booking can no longer be updated', kind: 'noLongerChangeable' },
    { text: 'This booking can no longer be cancelled', kind: 'noLongerChangeable' },
    { text: 'Bookings cannot be updated within 3 days of check-in', kind: 'withinCutoff' },
    { text: 'Bookings cannot be cancelled within 3 days of check-in', kind: 'withinCutoff' },
    { text: 'Checkin date cannot be in the past', kind: 'checkInPast' },
    { text: 'Checkout date must be after check-in date', kind: 'datesOutOfOrder' },
    { text: 'Deluxe Dorm is not available for booking', kind: 'roomNotBookable' },
  ])('recognises the backend text "$text" as $kind', ({ text, kind }) => {
    expect(bookingRefusal(apiError(422, [text]))).toBe(kind);
  });

  it('normalises case, whitespace, curly apostrophes and trailing periods', () => {
    expect(bookingRefusal(apiError(422, ['  THIS hostel  does not accept bookings.. ']))).toBe(
      'bookingsClosed',
    );
    expect(bookingRefusal(apiError(422, ['This hostel doesn’t accept bookings']))).toBe(
      'bookingsClosed',
    );
  });

  it.each<{ text: string; kind: BookingRefusal }>([
    { text: 'Sorry, we are not taking bookings at the moment', kind: 'bookingsClosed' },
    { text: 'Your booking can no longer be changed', kind: 'noLongerChangeable' },
    { text: 'Changes are locked within 2 days of checkin', kind: 'withinCutoff' },
    { text: 'Check-in date is in the past', kind: 'checkInPast' },
    { text: 'Check-out must be after check-in', kind: 'datesOutOfOrder' },
    { text: 'Room is currently not available for booking online', kind: 'roomNotBookable' },
  ])('recognises the reworded "$text" as $kind by keyword', ({ text, kind }) => {
    expect(bookingRefusal(apiError(422, [text]))).toBe(kind);
  });

  it.each<{ messages: string[]; kind: BookingRefusal; why: string }>([
    {
      why: 'closed beats every model error',
      messages: [
        'Deluxe Dorm is not available for booking',
        'Checkin date cannot be in the past',
        'This hostel is not taking bookings right now',
      ],
      kind: 'bookingsClosed',
    },
    {
      why: 'no longer changeable beats the cutoff',
      messages: [
        'Bookings cannot be cancelled within 3 days of check-in',
        'This booking can no longer be cancelled',
      ],
      kind: 'noLongerChangeable',
    },
    {
      why: 'the cutoff beats a past check-in',
      messages: ['Checkin date cannot be in the past', 'Bookings cannot be updated within 3 days of check-in'],
      kind: 'withinCutoff',
    },
    {
      why: 'the past check-in beats the date order',
      messages: ['Checkout date must be after check-in date', 'Checkin date cannot be in the past'],
      kind: 'checkInPast',
    },
    {
      why: 'the date order beats an unbookable room',
      messages: ['Single is not available for booking', 'Checkout date must be after check-in date'],
      kind: 'datesOutOfOrder',
    },
    {
      why: 'an unrelated message does not hide a recognised one',
      messages: ['Line items must include at least one room', 'Single is not available for booking'],
      kind: 'roomNotBookable',
    },
  ])('picks by priority when several messages come back: $why', ({ messages, kind }) => {
    expect(bookingRefusal(apiError(422, messages))).toBe(kind);
  });

  it('prefers an exact backend text over a keyword match of a higher-priority kind', () => {
    const err = apiError(422, [
      'Checkin date cannot be in the past',
      'Rooms not taking bookings in winter are hidden',
    ]);
    expect(bookingRefusal(err)).toBe('checkInPast');
  });

  it.each([400, 403, 404, 409, 500, 0])('returns null for status %i even with a known text', (status) => {
    expect(bookingRefusal(apiError(status, ['This hostel does not accept bookings']))).toBeNull();
  });

  it('returns null for an unrecognised 422', () => {
    expect(bookingRefusal(apiError(422, ['Line items must include at least one room']))).toBeNull();
    expect(bookingRefusal(apiError(422, ['Unprocessable Entity']))).toBeNull();
    expect(bookingRefusal(apiError(422))).toBeNull();
    expect(bookingRefusal(apiError(422, []))).toBeNull();
  });

  it('never reads the message', () => {
    expect(bookingRefusal({ status: 422, message: 'This hostel does not accept bookings' })).toBeNull();
  });

  it('ignores server messages that are not strings', () => {
    expect(
      bookingRefusal({ status: 422, serverMessages: [42, null, 'Checkin date cannot be in the past'] }),
    ).toBe('checkInPast');
    expect(bookingRefusal({ status: 422, serverMessages: [42, null] })).toBeNull();
  });

  it.each([undefined, null, 'boom', 42, new Error('This hostel does not accept bookings'), { status: '422' }])(
    'returns null for a rejection that is not an API error: %j',
    (rejection) => {
      expect(bookingRefusal(rejection)).toBeNull();
    },
  );
});
