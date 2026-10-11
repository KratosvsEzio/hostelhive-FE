/** Why a reset request failed, as far as the page needs to know. */
export type ResetFailureKind =
  | 'linkInvalid'
  | 'linkExpired'
  | 'accountNotResettable'
  | 'passwordRejected'
  | 'network'
  | 'unknown';

/** What Rails' own 404 handlers send (`{"status":404,"error":"Not Found"}`), with no word about the link. */
const BARE_NOT_FOUND_TEXT = 'not found';
const LINK_EXPIRED_TEXT = 'this reset link has expired';
const ACCOUNT_NOT_RESETTABLE_TEXT = "this account's password can't be reset with a link";

const EXPIRED_KEYWORDS = ['expired'];
const NOT_RESETTABLE_KEYWORDS = ['reset with a link', "can't be reset", 'cannot be reset'];

/**
 * Classifies a failed `PATCH /api/user/reset_password`.
 *
 * The backend sends no machine code, so its two 403s can only be told apart by their text:
 * an exact match on the normalised server messages first, then keywords. Anything that does
 * not match exactly one case is `unknown` — a confident wrong panel would strand the user.
 * A 404 counts as a dead link only when it carries a message of its own: an empty body or the
 * bare "Not Found" that Rails' routing and public-exception handlers send says nothing about the
 * link, so a misconfigured server is not mistaken for a used link. `message` is never read.
 */
export function classifyResetFailure(err: unknown): ResetFailureKind {
  const status = statusOf(err);
  if (status === null) return 'unknown';
  if (status === 0) return 'network';
  if (status === 422) return 'passwordRejected';

  const text = normalise(serverMessagesOf(err));
  if (status === 404) return text && text !== BARE_NOT_FOUND_TEXT ? 'linkInvalid' : 'unknown';
  if (status === 403) return classifyForbidden(text);
  return 'unknown';
}

function classifyForbidden(text: string): ResetFailureKind {
  if (text === LINK_EXPIRED_TEXT) return 'linkExpired';
  if (text === ACCOUNT_NOT_RESETTABLE_TEXT) return 'accountNotResettable';

  const expired = EXPIRED_KEYWORDS.some((keyword) => text.includes(keyword));
  const notResettable = NOT_RESETTABLE_KEYWORDS.some((keyword) => text.includes(keyword));
  if (expired === notResettable) return 'unknown';
  return expired ? 'linkExpired' : 'accountNotResettable';
}

function statusOf(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const { status } = err as { status?: unknown };
  return typeof status === 'number' ? status : null;
}

function serverMessagesOf(err: unknown): readonly string[] {
  const { serverMessages } = err as { serverMessages?: unknown };
  if (!Array.isArray(serverMessages)) return [];
  return serverMessages.filter((message): message is string => typeof message === 'string');
}

function normalise(messages: readonly string[]): string {
  return messages
    .join(' ')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '');
}
