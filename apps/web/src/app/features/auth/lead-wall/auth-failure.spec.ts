import { ApiError } from '@hostelhive/data-access';
import { AuthAction, AuthFailureKey, classifyAuthFailure } from './auth-failure';

const API_URL = 'http://localhost/api/user/sign_in';

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

interface Case {
  why: string;
  err: unknown;
  key: AuthFailureKey;
}

const NETWORK_AND_RATE: Case[] = [
  { why: 'the server is unreachable', err: apiError(0), key: 'common.cannotReachTheServer' },
  {
    why: 'the rate limiter refuses',
    err: apiError(429, ['Too many requests. Please try again later.']),
    key: 'leadWall.tooManyAttempts',
  },
];

const SIGN_IN: Case[] = [
  {
    why: 'the password is wrong',
    err: apiError(401, ['Invalid email or password']),
    key: 'leadWall.emailOrPasswordIncorrect',
  },
  {
    why: 'a 401 carries no text',
    err: apiError(401),
    key: 'leadWall.emailOrPasswordIncorrect',
  },
  {
    why: 'the email is unknown',
    err: apiError(404, ['User not found']),
    key: 'leadWall.emailOrPasswordIncorrect',
  },
  { why: 'a 404 is bare', err: apiError(404, ['Not Found']), key: 'leadWall.somethingWentWrong' },
  { why: 'a 404 has no body', err: apiError(404), key: 'leadWall.somethingWentWrong' },
  { why: 'the account has no roles', err: apiError(403), key: 'leadWall.accountCannotSignIn' },
  { why: 'the server fails', err: apiError(500), key: 'leadWall.somethingWentWrong' },
  {
    why: 'a mapper throws a plain error',
    err: new Error('Auth response did not include a token.'),
    key: 'leadWall.somethingWentWrong',
  },
  { why: 'something that is not an error is thrown', err: 'boom', key: 'leadWall.somethingWentWrong' },
];

const SIGN_UP: Case[] = [
  {
    why: 'the email is already registered',
    err: apiError(422, ['Email is already registered']),
    key: 'leadWall.emailAlreadyRegistered',
  },
  {
    why: 'Rails says the email has been taken',
    err: apiError(422, ['Email has already been taken']),
    key: 'leadWall.emailAlreadyRegistered',
  },
  {
    why: 'another field is invalid',
    err: apiError(422, ['Phone is invalid']),
    key: 'leadWall.couldNotCreateAccount',
  },
  { why: 'a 422 carries no text', err: apiError(422), key: 'leadWall.couldNotCreateAccount' },
  { why: 'the server fails', err: apiError(500), key: 'leadWall.somethingWentWrong' },
  { why: 'a 401 arrives on sign-up', err: apiError(401), key: 'leadWall.somethingWentWrong' },
  {
    why: 'a plain error is thrown',
    err: new Error('Sign-up failed'),
    key: 'leadWall.somethingWentWrong',
  },
];

const GOOGLE: Case[] = [
  {
    why: 'the popup is closed',
    err: new Error('popup_closed'),
    key: 'leadWall.googleDidNotFinish',
  },
  {
    why: 'Google rejected the token',
    err: apiError(404, ['User does not exist']),
    key: 'leadWall.googleDidNotFinish',
  },
  { why: 'the account cannot sign in', err: apiError(403), key: 'leadWall.accountCannotSignIn' },
  {
    why: 'the account could not be created',
    err: apiError(422, ['Name can not be blank']),
    key: 'leadWall.couldNotCreateAccount',
  },
  { why: 'the server fails', err: apiError(500), key: 'leadWall.somethingWentWrong' },
];

describe('classifyAuthFailure', () => {
  describe.each<AuthAction>(['signIn', 'signUp', 'google', 'verify'])('%s', (action) => {
    it.each(NETWORK_AND_RATE)('says $key when $why', ({ err, key }) => {
      expect(classifyAuthFailure(err, action)).toBe(key);
    });
  });

  describe.each<AuthAction>(['signIn', 'verify'])('%s', (action) => {
    it.each(SIGN_IN)('says $key when $why', ({ err, key }) => {
      expect(classifyAuthFailure(err, action)).toBe(key);
    });
  });

  it.each(SIGN_UP)('signUp says $key when $why', ({ err, key }) => {
    expect(classifyAuthFailure(err, 'signUp')).toBe(key);
  });

  it.each(GOOGLE)('google says $key when $why', ({ err, key }) => {
    expect(classifyAuthFailure(err, 'google')).toBe(key);
  });

  it('gives an unknown email and a wrong password the same message', () => {
    expect(classifyAuthFailure(apiError(404, ['User not found']), 'signIn')).toBe(
      classifyAuthFailure(apiError(401, ['Invalid email or password']), 'signIn'),
    );
  });

  it('never reads message, so a message that names a refusal changes nothing', () => {
    const disguised = { status: 422, message: 'Email is already registered' };
    expect(classifyAuthFailure(disguised, 'signUp')).toBe('leadWall.couldNotCreateAccount');
  });
});
