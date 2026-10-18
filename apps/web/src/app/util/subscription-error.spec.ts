import { HttpErrorResponse } from '@angular/common/http';
import { CRM_REQUIRED_CODE, CRM_REQUIRED_MESSAGE } from '@app/core/host-access/host-access';
import {
  CANCAN_403_BODY,
  CANCAN_MESSAGE,
  CRM_REQUIRED_BODY,
  RENDER_403_BODY,
  SUBSCRIBE_MESSAGE,
} from '@app/testing/backend-refusals';
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

  it('does not read a permission refusal as a subscription problem', () => {
    expect(isSubscriptionError(apiError(403, [CANCAN_MESSAGE]))).toBe(false);
  });

  it.each([
    ['the singular error', CANCAN_403_BODY],
    ['the errors list', RENDER_403_BODY],
  ])('does not read a raw permission 403 carrying %s', (_, body) => {
    expect(isSubscriptionError(new HttpErrorResponse({ status: 403, error: body }))).toBe(false);
  });

  // The subscribe text is what makes any other status a subscription problem, but never on a 403.
  it.each<{ shape: string; err: unknown }>([
    { shape: "the interceptor's", err: apiError(403, [SUBSCRIBE_MESSAGE]) },
    {
      shape: 'a raw',
      err: new HttpErrorResponse({ status: 403, error: { success: false, errors: [SUBSCRIBE_MESSAGE] } }),
    },
  ])('does not read a 403 saying to subscribe, in $shape shape', ({ err }) => {
    expect(isSubscriptionError(err)).toBe(false);
  });

  // "Upgrade to a plan" would match the plan wording on any other status; the real message would not.
  it.each<{ why: string; err: unknown }>([
    {
      why: "the interceptor's shape, upgrade wording",
      err: { ...apiError(403, ['Upgrade to a plan with CRM']), code: CRM_REQUIRED_CODE },
    },
    {
      why: 'a raw response, upgrade wording',
      err: new HttpErrorResponse({
        status: 403,
        error: { success: false, code: CRM_REQUIRED_CODE, errors: ['Upgrade to a plan with CRM'] },
      }),
    },
    {
      why: "the interceptor's shape, the real message",
      err: { ...apiError(403, [CRM_REQUIRED_MESSAGE]), code: CRM_REQUIRED_CODE },
    },
    { why: 'a raw response, the real body', err: new HttpErrorResponse({ status: 403, error: CRM_REQUIRED_BODY }) },
  ])('does not read a crm_required 403 as a subscription problem: $why', ({ err }) => {
    expect(isSubscriptionError(err)).toBe(false);
  });

  it.each([
    ['an empty body', undefined],
    ['a null body', null],
    ['a body with an empty errors list', { errors: [] }],
  ])('recognises a raw 402 with %s', (_, error) => {
    expect(isSubscriptionError(new HttpErrorResponse({ status: 402, error }))).toBe(true);
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
