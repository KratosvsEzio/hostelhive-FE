import { HttpErrorResponse } from '@angular/common/http';

/**
 * Returns true when an API error indicates the hostel needs an active subscription.
 *
 * Reads **both** error shapes. Every request goes through the error interceptor, which rethrows
 * a plain `ApiError` rather than the `HttpErrorResponse`; from it only `status` and
 * `serverMessages` are read, never the diagnostic `message`. A raw `HttpErrorResponse` is still
 * accepted, classified from its body's `errors`, `error` and `message` fields.
 *
 * Matches:
 *   - HTTP 402 Payment Required
 *   - the server's wording — "You need to subscribe to avail the services" (400), or any
 *     message about a subscription, an upgrade or a required plan
 *
 * Never matches a 403, whatever it says. A plan refusal (`crm_required`) is owned by the host
 * access lock, and a 403 with no code of the server's is a permission the signed-in user's role
 * lacks (`isPermissionRefusal`), which no subscription would grant.
 */
export function isSubscriptionError(err: unknown): boolean {
  const read = readError(err);
  if (!read || read.status === 403) return false;
  if (read.status === 402) return true;
  return read.messages.some((m) => /subscri|upgrade.*plan|plan.?required/i.test(m));
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
  // The interceptor's `ApiError`: only `serverMessages` is the server's text; `message` is a
  // diagnostic whose path alone ("…/subscription/cancel → 404") would otherwise match.
  if (err && typeof err === 'object' && typeof (err as { status?: unknown }).status === 'number') {
    const e = err as { status: number; serverMessages?: unknown };
    const messages = (Array.isArray(e.serverMessages) ? e.serverMessages : []).filter(
      (v): v is string => typeof v === 'string',
    );
    return { status: e.status, messages };
  }
  return null;
}
