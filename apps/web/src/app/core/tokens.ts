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
 * Invoked by the error interceptor for *unexpected* failures (5xx and network/timeout) so the
 * app can surface a non-blocking notification (e.g. a toast) for any API call — current or
 * future — without per-call code. Optional: when no app provides it, errors simply propagate
 * to the caller as before. Validation errors (4xx) and 401 are intentionally NOT routed here —
 * those are handled inline by the calling feature and by {@link UNAUTHORIZED_HANDLER}.
 */
export const API_ERROR_NOTIFIER = new InjectionToken<(error: ApiError) => void>(
  'hh.apiErrorNotifier',
);
