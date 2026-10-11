import { errorStatus, isBareNotFound, serverText } from '@core/errors/api-error-text';

/** Why a confirmation link failed, as far as the page needs to know. */
export type ConfirmFailureKind = 'linkInvalidOrUsed' | 'linkExpired' | 'network' | 'unknown';

const LINK_EXPIRED_TEXT = 'this confirmation link has expired';
const EXPIRED_WORD = /\bexpired\b/;
const NEGATED_EXPIRED = /\b(not|never)\s+expired\b|\bunexpired\b/;

/**
 * Classifies a failed `POST /api/user/confirm_invitation`.
 *
 * A 404 counts as a dead link only when it carries a message of its own: an empty body or the
 * bare "Not Found" that Rails' routing and public-exception handlers send says nothing about the
 * link. A 403 is an expired link only when its text says so — the same action can also send a
 * 403 after the account was confirmed, when signing in is refused. Everything else is `unknown`,
 * so the page falls back to its generic message. `message` is never read.
 */
export function classifyConfirmFailure(err: unknown): ConfirmFailureKind {
  const status = errorStatus(err);
  if (status === null) return 'unknown';
  if (status === 0) return 'network';

  const text = serverText(err);
  if (status === 404) return text && !isBareNotFound(text) ? 'linkInvalidOrUsed' : 'unknown';
  if (status === 403 && isExpired(text)) return 'linkExpired';
  return 'unknown';
}

function isExpired(text: string): boolean {
  if (text === LINK_EXPIRED_TEXT) return true;
  return EXPIRED_WORD.test(text) && !NEGATED_EXPIRED.test(text);
}
