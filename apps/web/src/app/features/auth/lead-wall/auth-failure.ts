import { errorStatus, isBareNotFound, serverText } from '@core/errors/api-error-text';

/** Which lead-wall request failed; each one has its own set of refusals. */
export type AuthAction = 'signIn' | 'signUp' | 'google' | 'verify';

/** The translation key the lead wall shows for a failed request. */
export type AuthFailureKey =
  | 'common.cannotReachTheServer'
  | 'leadWall.emailOrPasswordIncorrect'
  | 'leadWall.emailAlreadyRegistered'
  | 'leadWall.couldNotCreateAccount'
  | 'leadWall.accountCannotSignIn'
  | 'leadWall.googleDidNotFinish'
  | 'leadWall.tooManyAttempts'
  | 'leadWall.somethingWentWrong';

/** What sign-up's 422 says when the email belongs to an existing account, normalised. */
const EMAIL_TAKEN_TEXTS = ['already registered', 'has already been taken'];

/**
 * Picks the message for a failed sign-in, sign-up, Google login or post-verification sign-in.
 *
 * An unknown email (404 with a message of its own) and a wrong password (401) get the same
 * message, so the wall never tells a stranger which addresses have accounts. A bare 404 is a
 * routing failure, not an answer about the email. Google's popup rejects with a plain error
 * that has no status at all, which still means Google did not finish. Anything unrecognised
 * falls back to the generic message. `message` is never read.
 */
export function classifyAuthFailure(err: unknown, action: AuthAction): AuthFailureKey {
  const status = errorStatus(err);
  if (status === 0) return 'common.cannotReachTheServer';
  if (status === 429) return 'leadWall.tooManyAttempts';

  switch (action) {
    case 'signIn':
    case 'verify':
      return signInFailure(err, status);
    case 'signUp':
      return signUpFailure(err, status);
    case 'google':
      return googleFailure(status);
  }
}

function signInFailure(err: unknown, status: number | null): AuthFailureKey {
  if (status === 401) return 'leadWall.emailOrPasswordIncorrect';
  if (status === 403) return 'leadWall.accountCannotSignIn';
  if (status === 404) {
    const text = serverText(err);
    if (text && !isBareNotFound(text)) return 'leadWall.emailOrPasswordIncorrect';
  }
  return 'leadWall.somethingWentWrong';
}

function signUpFailure(err: unknown, status: number | null): AuthFailureKey {
  if (status !== 422) return 'leadWall.somethingWentWrong';
  const text = serverText(err);
  return EMAIL_TAKEN_TEXTS.some((taken) => text.includes(taken))
    ? 'leadWall.emailAlreadyRegistered'
    : 'leadWall.couldNotCreateAccount';
}

function googleFailure(status: number | null): AuthFailureKey {
  if (status === null || status === 404) return 'leadWall.googleDidNotFinish';
  if (status === 403) return 'leadWall.accountCannotSignIn';
  if (status === 422) return 'leadWall.couldNotCreateAccount';
  return 'leadWall.somethingWentWrong';
}
