import { ApiError } from '@hostelhive/data-access';
import { AccountConfirmedNotSignedIn } from '@core/auth';
import { extractServerMessages } from '@core/errors/api-error-message';
import { classifyConfirmFailure, ConfirmFailureKind } from './confirm-failure';

const API_URL = 'http://localhost/api/user/confirm_invitation';
const USED_TEXT = 'This confirmation link is invalid or has already been used';
const EXPIRED_TEXT = 'This confirmation link has expired';

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

describe('classifyConfirmFailure', () => {
  it.each<{ status: number; messages?: string[]; kind: ConfirmFailureKind; why: string }>([
    {
      why: 'the backend says the link is invalid or used',
      status: 404,
      messages: [USED_TEXT],
      kind: 'linkInvalidOrUsed',
    },
    {
      why: 'a 404 envelope is reworded',
      status: 404,
      messages: ['Invitation not found'],
      kind: 'linkInvalidOrUsed',
    },
    { why: 'a 404 says only "Not Found"', status: 404, messages: ['Not Found'], kind: 'unknown' },
    {
      why: 'a 404 says only "not found." in other casing',
      status: 404,
      messages: ['not found.'],
      kind: 'unknown',
    },
    { why: 'a 404 carries no envelope', status: 404, kind: 'unknown' },
    {
      why: 'the backend says the link has expired',
      status: 403,
      messages: [EXPIRED_TEXT],
      kind: 'linkExpired',
    },
    {
      why: 'the expired text has a trailing period, other casing and extra spaces',
      status: 403,
      messages: ['  This Confirmation  link has EXPIRED.  '],
      kind: 'linkExpired',
    },
    {
      why: 'the expired text is reworded but still says expired',
      status: 403,
      messages: ['Your invite expired'],
      kind: 'linkExpired',
    },
    {
      why: 'a 403 refuses sign-in after the account was confirmed',
      status: 403,
      messages: ['User have no roles and not allowed to sign in'],
      kind: 'unknown',
    },
    { why: 'a 403 carries no envelope', status: 403, kind: 'unknown' },
    { why: 'a 403 says the link is not expired', status: 403, messages: ['Link not expired'], kind: 'unknown' },
    { why: 'a 403 says the link never expired', status: 403, messages: ['This link never expired'], kind: 'unknown' },
    { why: 'a 403 says the link is unexpired', status: 403, messages: ['unexpired'], kind: 'unknown' },
    { why: 'a 403 only contains "expired" inside another word', status: 403, messages: ['Token nonexpiredness'], kind: 'unknown' },
    { why: 'the server cannot be reached', status: 0, kind: 'network' },
    { why: 'a 400 carries the expired text', status: 400, messages: [EXPIRED_TEXT], kind: 'unknown' },
    { why: 'a 422 carries the expired text', status: 422, messages: [EXPIRED_TEXT], kind: 'unknown' },
    { why: 'a 500 carries the expired text', status: 500, messages: [EXPIRED_TEXT], kind: 'unknown' },
    { why: 'a 404 carries the expired text', status: 404, messages: [EXPIRED_TEXT], kind: 'linkInvalidOrUsed' },
  ])('returns $kind when $why', ({ status, messages, kind }) => {
    expect(classifyConfirmFailure(apiError(status, messages))).toBe(kind);
  });

  it('returns unknown for the 404 body Rails sends for an unknown route, read as the interceptor reads it', () => {
    const serverMessages = extractServerMessages({ status: 404, error: 'Not Found' });
    expect(serverMessages).toEqual(['Not Found']);
    expect(classifyConfirmFailure(apiError(404, serverMessages))).toBe('unknown');
  });

  it('classifies on the joined messages when the envelope carries several', () => {
    const err = apiError(403, ['Request refused:', 'the link has expired']);
    expect(classifyConfirmFailure(err)).toBe('linkExpired');
  });

  it('never reads the message, so server text there cannot pick a message', () => {
    expect(classifyConfirmFailure({ status: 403, message: EXPIRED_TEXT })).toBe('unknown');
    expect(classifyConfirmFailure({ status: 404, message: USED_TEXT })).toBe('unknown');
  });

  it.each([undefined, null, 'boom', 42, new Error(EXPIRED_TEXT), { status: '404' }])(
    'returns unknown for a rejection that is not an API error: %j',
    (rejection) => {
      expect(classifyConfirmFailure(rejection)).toBe('unknown');
    },
  );

  it('ignores server messages that are not strings', () => {
    const err = { status: 403, serverMessages: [42, null, EXPIRED_TEXT] };
    expect(classifyConfirmFailure(err)).toBe('linkExpired');
  });

  it('returns unknown when the only server messages are not strings', () => {
    expect(classifyConfirmFailure({ status: 404, serverMessages: [42, null] })).toBe('unknown');
  });

  it('returns unknown for a confirmed account whose sign-in failed with an expired 403', () => {
    const err = new AccountConfirmedNotSignedIn(apiError(403, [EXPIRED_TEXT]));
    expect(classifyConfirmFailure(err)).toBe('unknown');
  });
});
