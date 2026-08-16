import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiError } from '@hostelhive/data-access';
import {
  extractServerMessages,
  serverMessageText,
} from '@core/errors/api-error-message';
import { API_CONFIG } from '@core/api-config';
import {
  API_ERROR_NOTIFIER,
  SUPPRESS_ERROR_TOAST,
  UNAUTHORIZED_HANDLER,
} from '@core/tokens';

/**
 * Endpoints where a 401 means "those credentials were wrong", not "your session expired".
 * Signing the user out here would let a mistyped password on the login form destroy the
 * session they already had in another tab.
 */
const CREDENTIAL_PATHS = [
  '/api/user/sign_in',
  '/api/user/sign_up',
  '/api/user/google_login',
  '/api/user/confirm_invitation',
];

/**
 * Normalises every failure to `ApiError`, routes 401s to the auth handler, and surfaces the rest
 * to the app-wide notifier so no failure passes silently. This is a thin router: message copy and
 * formatting live in `@core/errors/api-error-message`. The error is still re-thrown, so a feature
 * can also render its own inline state — the notifier is an additive safety net.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const onUnauthorized = inject(UNAUTHORIZED_HANDLER, { optional: true });
  const notify = inject(API_ERROR_NOTIFIER, { optional: true });
  const base = inject(API_CONFIG).baseUrl;
  const suppressToast = req.context.get(SUPPRESS_ERROR_TOAST);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const apiError = normalize(err, req.method);
      if (apiError.status === 401) {
        // Scoped deliberately, matching authInterceptor. This handler clears the session,
        // so an unscoped version let a 401 from a third-party host (ipapi.co, behind the
        // phone input) sign the user out of HostelHive.
        const ours = req.url.startsWith(base);
        const isCredentialCheck = CREDENTIAL_PATHS.some((p) => req.url.includes(p));
        if (ours && !isCredentialCheck) onUnauthorized?.();
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
    // The server's wording wins over Angular's. `err.message` is
    // "Http failure response for http://…/api/user/sign_in: 401 Unauthorized" — a URL
    // and a status code — and several screens render `err.message` inline, so that
    // string was reaching users verbatim while the response carried a perfectly good
    // "Invalid email or password" alongside it. Falling back to `err.message` keeps
    // network failures (status 0, empty body) describable.
    message: serverMessageText(err.error) ?? err.message,
    serverMessages: serverMessages.length ? serverMessages : undefined,
    method: method.toUpperCase(),
  };
}
