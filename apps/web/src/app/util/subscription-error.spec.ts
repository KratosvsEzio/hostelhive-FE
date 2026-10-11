import { HttpErrorResponse } from '@angular/common/http';
import { isSubscriptionError } from './subscription-error';

describe('isSubscriptionError', () => {
  /** What the error interceptor actually rethrows — the shape every page receives. */
  const apiError = (status: number, serverMessages: string[], message = `GET /api/x → ${status}`) => ({
    status,
    code: 'unknown_error',
    message,
    serverMessages,
    method: 'GET',
  });

  it("recognises a lapsed hostel's 400 in the interceptor's shape", () => {
    expect(isSubscriptionError(apiError(400, ['You need to subscribe to avail the services']))).toBe(true);
  });

  it('recognises a 402 whatever it says', () => {
    expect(isSubscriptionError(apiError(402, []))).toBe(true);
  });

  it('still reads a raw HttpErrorResponse', () => {
    const raw = new HttpErrorResponse({ status: 400, error: { errors: ['You need to subscribe to avail the services'] } });
    expect(isSubscriptionError(raw)).toBe(true);
  });

  it('reads a Pundit 403 on a gated endpoint', () => {
    expect(isSubscriptionError(apiError(403, ['You are not authorized to access this page']))).toBe(true);
  });

  it('leaves every other failure alone', () => {
    expect(isSubscriptionError(apiError(422, ['Guest phone can\'t be blank']))).toBe(false);
    expect(isSubscriptionError(apiError(500, []))).toBe(false);
    expect(isSubscriptionError(apiError(403, ['Forbidden']))).toBe(false);
    expect(isSubscriptionError(null)).toBe(false);
    expect(isSubscriptionError('nope')).toBe(false);
  });

  // The URL names "subscription", but the server said nothing about a plan.
  it.each([
    'Http failure response for http://x/api/hostels/1/subscription/cancel: 404',
    'POST /api/hostels/1/subscription/cancel → 404',
  ])('does not classify a 404 from its message alone: %s', (message) => {
    expect(isSubscriptionError(apiError(404, [], message))).toBe(false);
  });

  it('does not read the unauthorized wording from the message of a bare 403', () => {
    expect(isSubscriptionError(apiError(403, [], 'You are not authorized to access this page'))).toBe(false);
  });
});
