import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiError } from '@hostelhive/data-access';
import { API_ERROR_NOTIFIER, UNAUTHORIZED_HANDLER } from '@core/tokens';

/**
 * Normalises every failure to `ApiError`, routes 401s to the auth handler, and surfaces
 * *unexpected* failures (5xx / network) to the app-wide notifier so they never pass silently.
 * The error is still re-thrown, so a feature can also render its own inline state — the
 * notifier is an additive safety net, not a replacement for per-feature handling.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const onUnauthorized = inject(UNAUTHORIZED_HANDLER, { optional: true });
  const notify = inject(API_ERROR_NOTIFIER, { optional: true });
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const apiError = normalize(err);
      if (apiError.status === 401) onUnauthorized?.();
      else if (apiError.status >= 500 || apiError.status === 0)
        notify?.(apiError);
      return throwError(() => apiError);
    }),
  );
};

function normalize(err: HttpErrorResponse): ApiError {
  const body = (err.error ?? {}) as {
    code?: string;
    message?: string;
    errors?: string[];
    details?: Record<string, string[]>;
  };
  // Rails endpoints return human-readable messages in an `errors` array
  // (e.g. ["Invalid email or password"]); surface them as the message.
  const fromErrors =
    Array.isArray(body.errors) && body.errors.length
      ? body.errors.join(' ')
      : undefined;
  return {
    status: err.status,
    code: body.code ?? (err.status === 0 ? 'network_error' : 'unknown_error'),
    message:
      body.message ?? fromErrors ?? err.message ?? 'Something went wrong.',
    details: body.details,
  };
}
