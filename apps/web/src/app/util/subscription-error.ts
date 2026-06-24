import { HttpErrorResponse } from '@angular/common/http';

/**
 * Returns true when an API error indicates the user needs an active subscription.
 * Handles:
 *   - HTTP 402 Payment Required
 *   - Rails error shapes: { errors: [...] }, { error: "..." }, { message: "..." }
 *   - Keywords: subscription, subscribe, upgrade, plan required
 */
export function isSubscriptionError(err: unknown): boolean {
  if (!(err instanceof HttpErrorResponse)) return false;
  if (err.status === 402) return true;
  const body = err.error as Record<string, unknown> | null | undefined;
  if (!body || typeof body !== 'object') return false;
  const candidates: string[] = [
    ...((Array.isArray(body['errors']) ? body['errors'] : []) as string[]),
    body['error'],
    body['message'],
  ].filter((v): v is string => typeof v === 'string');
  if (candidates.some((m) => /subscri|upgrade.*plan|plan.?required/i.test(m))) return true;
  // Pundit 403s on subscription-gated endpoints say "not authorized to access this page"
  if (err.status === 403 && candidates.some((m) => /not authorized/i.test(m))) return true;
  return false;
}
