import { HttpContextToken } from '@angular/common/http';
import { InjectionToken } from '@angular/core';
import { ApiError } from '@hostelhive/data-access';

/**
 * Returns the current access token (or `null` when signed out).
 * Provided by `@hostelhive/auth` so `data-access` stays decoupled from the session store.
 */
export const ACCESS_TOKEN = new InjectionToken<() => string | null>(
  'hh.accessToken',
);

/**
 * Invoked by the auth interceptor on a 401 from the API — e.g. clear the session and
 * open the Lead Wall, or (post Q-AUTH) trigger a silent refresh + retry.
 * Provided by `@hostelhive/auth`.
 */
export const UNAUTHORIZED_HANDLER = new InjectionToken<() => void>(
  'hh.unauthorizedHandler',
);

/**
 * Invoked by the error interceptor to surface a non-blocking notification (e.g. a toast) for any
 * failed API call without per-call code. It fires for 5xx, network/timeout, and 4xx failures
 * other than 401 — 401 is routed only to {@link UNAUTHORIZED_HANDLER}, and any request that opts
 * out via {@link SUPPRESS_ERROR_TOAST} is skipped. Optional: when no app provides it, errors
 * simply propagate to the caller as before.
 */
export const API_ERROR_NOTIFIER = new InjectionToken<(error: ApiError) => void>(
  'hh.apiErrorNotifier',
);

/**
 * Per-request opt-out from the global error toast. Set on requests whose surface already renders
 * the error inline (e.g. the auth forms) so the failure isn't announced twice. The error is still
 * normalised and re-thrown; only the {@link API_ERROR_NOTIFIER} call is suppressed.
 */
export const SUPPRESS_ERROR_TOAST = new HttpContextToken<boolean>(() => false);
