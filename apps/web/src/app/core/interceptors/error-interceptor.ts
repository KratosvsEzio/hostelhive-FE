import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiError } from '@hostelhive/data-access';
import { extractServerMessages } from '@core/errors/api-error-message';
import {
  API_ERROR_NOTIFIER,
  SUPPRESS_ERROR_TOAST,
  UNAUTHORIZED_HANDLER,
} from '@core/tokens';

/**
 * Normalises every failure to `ApiError`, routes 401s to the auth handler, and surfaces the rest
 * to the app-wide notifier so no failure passes silently. This is a thin router: message copy and
 * formatting live in `@core/errors/api-error-message`. The error is still re-thrown, so a feature
 * can also render its own inline state — the notifier is an additive safety net.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const onUnauthorized = inject(UNAUTHORIZED_HANDLER, { optional: true });
  const notify = inject(API_ERROR_NOTIFIER, { optional: true });
  const suppressToast = req.context.get(SUPPRESS_ERROR_TOAST);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const apiError = normalize(err, req.method);
      if (apiError.status === 401) {
        onUnauthorized?.();
      } else if (!suppressToast && shouldNotify(apiError.status)) {
        notify?.(apiError);
      }
      return throwError(() => apiError);
    }),
  );
};

/** Every failure except an unset status and 401 warrants a notification. */
function shouldNotify(status: number): boolean {
  return status >= 500 || status === 0 || (status >= 400 && status !== 401);
}

function normalize(err: HttpErrorResponse, method: string): ApiError {
  const serverMessages = extractServerMessages(err.error);
  return {
    status: err.status,
    code: err.status === 0 ? 'network_error' : 'unknown_error',
    message: err.message,
    serverMessages: serverMessages.length ? serverMessages : undefined,
    method: method.toUpperCase(),
  };
}
