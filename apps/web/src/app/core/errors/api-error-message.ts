import { ApiError } from '@hostelhive/data-access';

/** Longest server body we surface in a toast before truncating with an ellipsis. */
const MAX_BODY_LENGTH = 200;

/**
 * Owned toast titles by status class. Titles are ours (never echoed from the server) so the
 * surface reads consistently regardless of which endpoint or error shape produced the failure.
 */
const TITLE_NOT_ALLOWED = 'Not allowed';
const TITLE_NOT_FOUND = "Couldn't load";
const TITLE_LOAD_FAILED = "Couldn't load";
const TITLE_SAVE_FAILED = "Couldn't save changes";
const TITLE_DELETE_FAILED = "Couldn't delete";
const TITLE_SERVER = 'Something went wrong';
const TITLE_NETWORK = 'Connection problem';

/** Verbs that only read — a failure on one of these never lost the user any changes. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Generic bodies for failures with no safe server-supplied text. */
const BODY_SERVER = 'We could not reach the server. Please try again in a moment.';
const BODY_NETWORK = 'Check your internet connection and try again.';
const BODY_GENERIC = 'Please try again.';

/**
 * Extracts the human-readable messages from a Rails error envelope, handling every variant this
 * backend emits: an array of strings, a single string, a field→messages object, or a singular
 * `error` string (CanCan 403). Returns an empty array for any non-envelope body (routing 404
 * HTML, static 5xx pages, blobs) so the caller falls back to generic copy — this never throws.
 */
export function extractServerMessages(body: unknown): readonly string[] {
  if (!body || typeof body !== 'object' || body instanceof Blob) return [];

  const envelope = body as { errors?: unknown; error?: unknown };
  const fromErrors = normalizeMessages(envelope.errors);
  if (fromErrors.length) return fromErrors;
  return normalizeMessages(envelope.error);
}

/** Coerces one of the `errors`/`error` variants into a flat list of trimmed, non-empty strings. */
function normalizeMessages(value: unknown): readonly string[] {
  if (typeof value === 'string') return clean([value]);
  if (Array.isArray(value)) return clean(value.filter(isNonEmptyString));
  if (value && typeof value === 'object') {
    const flattened = Object.values(value as Record<string, unknown>)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .filter(isNonEmptyString);
    return clean(flattened);
  }
  return [];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function clean(values: readonly string[]): readonly string[] {
  return values.map((v) => v.trim()).filter((v) => v.length > 0);
}

/**
 * Maps a normalised {@link ApiError} to the title + body a toast should show. Only 4xx envelope
 * messages are echoed; 5xx, network (status 0), and non-envelope 4xx responses fall back to
 * generic copy so an internal URL or a Rails debug page can never reach the user.
 */
export function toToastCopy(e: ApiError): { title: string; message: string } {
  if (e.status === 0) return { title: TITLE_NETWORK, message: BODY_NETWORK };
  if (e.status >= 500) return { title: TITLE_SERVER, message: BODY_SERVER };

  const title = titleFor(e.status, e.method);
  const body = joinMessages(e.serverMessages ?? []);
  if (!body) return { title, message: BODY_GENERIC };
  return { title, message: truncate(body) };
}

/**
 * A read that fails hasn't lost the user any work, so titling it "Couldn't save changes" is both
 * wrong and alarming — GET/HEAD/OPTIONS get the load title instead. The method is optional on
 * {@link ApiError}, so callers that don't supply it keep the previous save-titled behaviour.
 */
function titleFor(status: number, method?: string): string {
  if (status === 403) return TITLE_NOT_ALLOWED;
  const verb = method?.toUpperCase();
  // Ahead of the 404 branch on purpose. A DELETE is neither a load nor a save, and both of
  // the other titles misdescribe it: "Couldn't save changes" on a failed removal reads as
  // though an edit was lost, and a 404 here means the row is already gone, which is a fact
  // about the delete rather than a failed read.
  if (verb === 'DELETE') return TITLE_DELETE_FAILED;
  if (status === 404) return TITLE_NOT_FOUND;
  if (verb && READ_METHODS.has(verb)) return TITLE_LOAD_FAILED;
  return TITLE_SAVE_FAILED;
}

/**
 * The server's own wording for a failure, or null when it supplied none.
 *
 * Used to fill `ApiError.message`, so any surface that renders `err.message` inline —
 * the auth forms, the subscription notices, the staff and password screens — shows
 * what the API actually said instead of Angular's "Http failure response for
 * &lt;url&gt;: 401 Unauthorized", which is a URL and a status code shown to an end user.
 */
export function serverMessageText(body: unknown): string | null {
  const messages = extractServerMessages(body);
  return messages.length ? joinMessages(messages) : null;
}

/** Joins multiple server messages as sentences so distinct errors stay legible, not run together. */
function joinMessages(messages: readonly string[]): string {
  return messages
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
    .join('\n');
}

function truncate(text: string): string {
  if (text.length <= MAX_BODY_LENGTH) return text;
  return `${text.slice(0, MAX_BODY_LENGTH).trimEnd()}…`;
}
