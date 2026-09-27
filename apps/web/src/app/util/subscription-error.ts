import { HttpErrorResponse } from '@angular/common/http';

/**
 * Returns true when an API error indicates the hostel needs an active subscription.
 *
 * Reads **both** error shapes. Every request goes through the error interceptor, which rethrows
 * a plain `ApiError` (`status`, `message`, `serverMessages`) rather than the
 * `HttpErrorResponse` — and this used to accept only the latter, so it answered `false` for
 * every real failure and no subscription gate in the host console ever showed. A lapsed hostel
 * got a generic error instead (Trello #81: now that expiry runs on a schedule, that is common).
 *
 * Matches:
 *   - HTTP 402 Payment Required
 *   - the server's wording — "You need to subscribe to avail the services" (400), or any
 *     message about a subscription, an upgrade or a required plan
 *   - Pundit 403s on subscription-gated endpoints ("not authorized to access this page")
 */
export function isSubscriptionError(err: unknown): boolean {
  const read = readError(err);
  if (!read) return false;
  if (read.status === 402) return true;
  if (read.messages.some((m) => /subscri|upgrade.*plan|plan.?required/i.test(m))) return true;
  return read.status === 403 && read.messages.some((m) => /not authorized/i.test(m));
}

function readError(err: unknown): { status: number; messages: string[] } | null {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as Record<string, unknown> | null | undefined;
    const messages =
      body && typeof body === 'object'
        ? [...((Array.isArray(body['errors']) ? body['errors'] : []) as unknown[]), body['error'], body['message']]
        : [];
    return { status: err.status, messages: messages.filter((v): v is string => typeof v === 'string') };
  }
  // The interceptor's `ApiError`.
  if (err && typeof err === 'object' && typeof (err as { status?: unknown }).status === 'number') {
    const e = err as { status: number; message?: unknown; serverMessages?: unknown };
    const messages = [
      ...(Array.isArray(e.serverMessages) ? e.serverMessages : []),
      e.message,
    ].filter((v): v is string => typeof v === 'string');
    return { status: e.status, messages };
  }
  return null;
}
