import { errorStatus, isBareNotFound, serverText } from '@core/errors/api-error-text';

/** Why a reset-link request failed, as far as the page needs to know. */
export type ForgotFailureKind =
  | 'noAccount'
  | 'alreadySent'
  | 'tooManyRequests'
  | 'network'
  | 'unknown';

/** What Rails sends for a 422 with no message of its own, normalised. */
const BARE_UNPROCESSABLE_TEXTS = ['unprocessable entity', 'unprocessable content'];

/**
 * Classifies a failed `POST /api/user/forgot_password`.
 *
 * The action has exactly one 422 — a link was already sent and is still live — so any 422 that
 * carries a message of its own is `alreadySent`, whatever its wording. A 404 says there is no
 * such account only when it carries a message of its own: an empty body or the bare "Not Found"
 * that Rails' routing and public-exception handlers send says nothing about the email. The same
 * goes for a bare "Unprocessable Entity". Everything else is `unknown`, so the page falls back to
 * its generic message. `message` is never read.
 */
export function classifyForgotFailure(err: unknown): ForgotFailureKind {
  const status = errorStatus(err);
  if (status === null) return 'unknown';
  if (status === 0) return 'network';
  if (status === 429) return 'tooManyRequests';

  const text = serverText(err);
  if (status === 404) return text && !isBareNotFound(text) ? 'noAccount' : 'unknown';
  if (status === 422) return text && !isBareUnprocessable(text) ? 'alreadySent' : 'unknown';
  return 'unknown';
}

function isBareUnprocessable(text: string): boolean {
  return BARE_UNPROCESSABLE_TEXTS.includes(text);
}
