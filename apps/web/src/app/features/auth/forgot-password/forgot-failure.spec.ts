import { ApiError } from '@hostelhive/data-access';
import { extractServerMessages } from '@core/errors/api-error-message';
import { classifyForgotFailure, ForgotFailureKind } from './forgot-failure';

const API_URL = 'http://localhost/api/user/forgot_password';
const ALREADY_SENT_TEXT = 'Otp already has been shared on your email. Retry after 10 minutes';
const NO_ACCOUNT_TEXT = 'User does not exist';
const TOO_MANY_TEXT = 'Too many requests. Please try again later.';

/** An error shaped the way the error interceptor rethrows it. */
function apiError(status: number, serverMessages?: readonly string[]): ApiError {
  return {
    status,
    code: status === 0 ? 'network_error' : 'unknown_error',
    message: serverMessages?.join(' ') ?? `Http failure response for ${API_URL}: ${status}`,
    serverMessages,
    method: 'POST',
  };
}

describe('classifyForgotFailure', () => {
  it.each<{
    status: number;
    messages?: string[];
    kind: ForgotFailureKind;
    why: string;
  }>([
    {
      why: 'the backend says a link was already shared',
      status: 422,
      messages: [ALREADY_SENT_TEXT],
      kind: 'alreadySent',
    },
    {
      why: 'the already-sent 422 is reworded',
      status: 422,
      messages: ['A reset link was already sent'],
      kind: 'alreadySent',
    },
    {
      why: 'a 422 says only "Unprocessable Entity"',
      status: 422,
      messages: ['Unprocessable Entity'],
      kind: 'unknown',
    },
    {
      why: 'a 422 says only "unprocessable content." in other casing',
      status: 422,
      messages: ['  Unprocessable  CONTENT. '],
      kind: 'unknown',
    },
    { why: 'a 422 carries no envelope', status: 422, kind: 'unknown' },
    {
      why: 'a 404 says there is no such user',
      status: 404,
      messages: [NO_ACCOUNT_TEXT],
      kind: 'noAccount',
    },
    {
      why: 'a 404 says only "Not Found"',
      status: 404,
      messages: ['Not Found'],
      kind: 'unknown',
    },
    { why: 'a 404 carries no envelope', status: 404, kind: 'unknown' },
    {
      why: 'the rate limit is hit',
      status: 429,
      messages: [TOO_MANY_TEXT],
      kind: 'tooManyRequests',
    },
    {
      why: 'the rate limit is hit with no envelope',
      status: 429,
      kind: 'tooManyRequests',
    },
    { why: 'the server cannot be reached', status: 0, kind: 'network' },
    { why: 'a 500 carries no envelope', status: 500, kind: 'unknown' },
    {
      why: 'a 500 carries the already-sent text',
      status: 500,
      messages: [ALREADY_SENT_TEXT],
      kind: 'unknown',
    },
    {
      why: 'a 400 carries the already-sent text',
      status: 400,
      messages: [ALREADY_SENT_TEXT],
      kind: 'unknown',
    },
    {
      why: 'a 403 carries the no-account text',
      status: 403,
      messages: [NO_ACCOUNT_TEXT],
      kind: 'unknown',
    },
  ])('returns $kind when $why', ({ status, messages, kind }) => {
    expect(classifyForgotFailure(apiError(status, messages))).toBe(kind);
  });

  it('returns unknown for the 404 body Rails sends for an unknown route, read as the interceptor reads it', () => {
    const serverMessages = extractServerMessages({
      status: 404,
      error: 'Not Found',
    });
    expect(serverMessages).toEqual(['Not Found']);
    expect(classifyForgotFailure(apiError(404, serverMessages))).toBe('unknown');
  });

  it('never reads the message, so server text there cannot pick a message', () => {
    expect(classifyForgotFailure({ status: 422, message: ALREADY_SENT_TEXT })).toBe('unknown');
    expect(classifyForgotFailure({ status: 404, message: NO_ACCOUNT_TEXT })).toBe('unknown');
  });

  it.each([undefined, null, 'boom', 42, new Error(ALREADY_SENT_TEXT), { status: '422' }])(
    'returns unknown for a rejection that is not an API error: %j',
    (rejection) => {
      expect(classifyForgotFailure(rejection)).toBe('unknown');
    },
  );

  it('ignores server messages that are not strings', () => {
    const err = { status: 422, serverMessages: [42, null, ALREADY_SENT_TEXT] };
    expect(classifyForgotFailure(err)).toBe('alreadySent');
  });

  it('returns unknown when the only server messages are not strings', () => {
    expect(classifyForgotFailure({ status: 422, serverMessages: [42, null] })).toBe('unknown');
    expect(classifyForgotFailure({ status: 404, serverMessages: [42, null] })).toBe('unknown');
  });
});
