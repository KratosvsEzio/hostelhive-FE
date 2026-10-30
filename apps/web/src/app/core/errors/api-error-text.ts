/**
 * Reads what a failed request said, for classifiers that pick a translated message.
 *
 * Works on anything a request can reject with: the `ApiError` the error interceptor rethrows,
 * or a stray value that is not an API error at all. `message` is never read — on an `ApiError`
 * it is a developer diagnostic, and on anything else it can be a developer string — so only the
 * status and the server's own messages count.
 */

/** What Rails' own 404 handlers send (`{"status":404,"error":"Not Found"}`), normalised. */
const BARE_NOT_FOUND_TEXT = 'not found';

/** The numeric HTTP status of a rejection, or `null` when it has none. */
export function errorStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const { status } = err as { status?: unknown };
  return typeof status === 'number' ? status : null;
}

/**
 * The server's messages as one comparable string: joined with spaces, lower-cased, curly
 * apostrophes made straight, whitespace collapsed, trimmed, and trailing periods dropped.
 * Non-string messages are ignored; an error without any yields `''`.
 */
export function serverText(err: unknown): string {
  return normalise(serverMessagesOf(err));
}

/** The rate limiter's wait in seconds (`ApiError.retryAfter`), or `null` when it gave none. */
export function retryAfterSeconds(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const { retryAfter } = err as { retryAfter?: unknown };
  return typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter
    : null;
}

/** True when the text is the bare "Not Found" Rails sends, which says nothing about the request. */
export function isBareNotFound(text: string): boolean {
  return text === BARE_NOT_FOUND_TEXT;
}

function serverMessagesOf(err: unknown): readonly string[] {
  if (typeof err !== 'object' || err === null) return [];
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
