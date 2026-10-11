import { ApiError } from '@hostelhive/data-access';
import { extractServerMessages } from '@core/errors/api-error-message';
import { classifyResetFailure, ResetFailureKind } from './reset-failure';

const API_URL = 'http://localhost/api/user/reset_password';

/** An error shaped the way the error interceptor rethrows it. */
function apiError(status: number, serverMessages?: readonly string[]): ApiError {
  return {
    status,
    code: status === 0 ? 'network_error' : 'unknown_error',
    message: serverMessages?.join(' ') ?? `Http failure response for ${API_URL}: ${status}`,
    serverMessages,
    method: 'PATCH',
  };
}

describe('classifyResetFailure', () => {
  it.each<{ status: number; messages?: string[]; kind: ResetFailureKind; why: string }>([
    {
      why: 'the backend says the link is invalid or used',
      status: 404,
      messages: ['This reset link is invalid or has already been used'],
      kind: 'linkInvalid',
    },
    {
      why: 'a 404 envelope is reworded',
      status: 404,
      messages: ['Token not found'],
      kind: 'linkInvalid',
    },
    {
      why: 'a 404 carries no envelope, as a routing 404 does',
      status: 404,
      kind: 'unknown',
    },
    {
      why: 'a 404 says only "Not Found", in any casing or with a period',
      status: 404,
      messages: ['not found.'],
      kind: 'unknown',
    },
    {
      why: 'the backend says the link has expired',
      status: 403,
      messages: ['This reset link has expired'],
      kind: 'linkExpired',
    },
    {
      why: 'the expired text has a trailing period, other casing and extra spaces',
      status: 403,
      messages: ['  This Reset  link has EXPIRED.  '],
      kind: 'linkExpired',
    },
    {
      why: 'the expired text is reworded but still says expired',
      status: 403,
      messages: ['Your link expired'],
      kind: 'linkExpired',
    },
    {
      why: 'the backend says the account cannot reset by link',
      status: 403,
      messages: ["This account's password can't be reset with a link"],
      kind: 'accountNotResettable',
    },
    {
      why: 'the account text uses curly apostrophes',
      status: 403,
      messages: ['This account’s password can’t be reset with a link.'],
      kind: 'accountNotResettable',
    },
    {
      why: 'the account text is reworded with "cannot be reset"',
      status: 403,
      messages: ['Staff passwords cannot be reset here'],
      kind: 'accountNotResettable',
    },
    {
      why: 'the account text is reworded with "reset with a link"',
      status: 403,
      messages: ['Moderators may not reset with a link'],
      kind: 'accountNotResettable',
    },
    {
      why: 'a 403 matches neither case',
      status: 403,
      messages: ['Forbidden'],
      kind: 'unknown',
    },
    {
      why: 'a 403 matches both cases at once',
      status: 403,
      messages: ['This reset link has expired', "This account's password can't be reset with a link"],
      kind: 'unknown',
    },
    {
      why: 'a 403 carries no envelope',
      status: 403,
      kind: 'unknown',
    },
    {
      why: 'the backend rejects the new password',
      status: 422,
      messages: ["New password can't be blank"],
      kind: 'passwordRejected',
    },
    {
      why: 'a model validation rejects the new password',
      status: 422,
      messages: ['Password is too long'],
      kind: 'passwordRejected',
    },
    { why: 'the server cannot be reached', status: 0, kind: 'network' },
    { why: 'the server fails', status: 500, kind: 'unknown' },
    {
      why: 'an unexpected status carries an envelope',
      status: 400,
      messages: ['This reset link has expired'],
      kind: 'unknown',
    },
  ])('returns $kind when $why', ({ status, messages, kind }) => {
    expect(classifyResetFailure(apiError(status, messages))).toBe(kind);
  });

  it('returns unknown for the 404 body Rails sends for an unknown route, read as the interceptor reads it', () => {
    const serverMessages = extractServerMessages({ status: 404, error: 'Not Found' });
    expect(serverMessages).toEqual(['Not Found']);
    expect(classifyResetFailure(apiError(404, serverMessages))).toBe('unknown');
  });

  it('classifies on the joined messages when the envelope carries several', () => {
    const err = apiError(403, ['Request refused:', 'the reset link has expired']);
    expect(classifyResetFailure(err)).toBe('linkExpired');
  });

  it('never reads the message, so server text there cannot pick a panel', () => {
    const err = { status: 403, message: 'This reset link has expired' };
    expect(classifyResetFailure(err)).toBe('unknown');
  });

  it.each([undefined, null, 'boom', 42, new Error('This reset link has expired'), { status: '404' }])(
    'returns unknown for a rejection that is not an API error: %j',
    (rejection) => {
      expect(classifyResetFailure(rejection)).toBe('unknown');
    },
  );

  it('ignores server messages that are not strings', () => {
    const err = { status: 403, serverMessages: [42, null, 'This reset link has expired'] };
    expect(classifyResetFailure(err)).toBe('linkExpired');
  });
});
