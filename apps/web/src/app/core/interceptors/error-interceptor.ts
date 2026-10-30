import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiError } from '@hostelhive/data-access';
import { extractServerMessages } from '@core/errors/api-error-message';
import { API_CONFIG } from '@core/api-config';
import { classifyHostAccess } from '@core/host-access/host-access';
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
      const apiError = normalize(err, req.method, req.url);
      if (apiError.status === 401) {
        // Scoped deliberately, matching authInterceptor. This handler clears the session,
        // so an unscoped version let a 401 from a third-party host (ipapi.co, behind the
        // phone input) sign the user out of HostelHive.
        const ours = req.url.startsWith(base);
        const isCredentialCheck = CREDENTIAL_PATHS.some((p) => req.url.includes(p));
        if (ours && !isCredentialCheck) {
          onUnauthorized?.(sentBearer(req.headers.get('Authorization')));
        }
      } else if (
        !suppressToast &&
        shouldNotify(apiError.status) &&
        !isHostAccessRead(req.method, req.url, apiError)
      ) {
        notify?.(apiError);
      }
      return throwError(() => apiError);
    }),
  );
};

/**
 * The token a request was sent with, read from the header `authInterceptor` (which runs before
 * this one) set — so a 401 names the token it rejected, not whoever is signed in by the time it
 * arrives. `null` when the request carried no bearer.
 */
function sentBearer(header: string | null): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length) || null;
}

/** Every failure except an unset status and 401 warrants a notification. */
function shouldNotify(status: number): boolean {
  return status >= 500 || status === 0 || (status >= 400 && status !== 401);
}

/**
 * A read the host API refused for want of a live plan or of CRM. The console shows that refusal as
 * a banner or a locked screen, so a toast would repeat it; a refused write still toasts, because
 * that is the user's own action failing.
 */
function isHostAccessRead(method: string, url: string, e: ApiError): boolean {
  return method.toUpperCase() === 'GET' && classifyHostAccess(url, e) !== null;
}

/**
 * The machine code the backend put on the error envelope, e.g. `crm_required` on the host
 * area's 403 (`{ code, errors, success: false }`). Null when the body carries none.
 */
function serverCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const code = (body as { code?: unknown }).code;
  return typeof code === 'string' && code ? code : null;
}

/**
 * The wait, in seconds, that the rate limiter put on a 429 body (`retry_after`). Null unless it
 * is a positive finite number.
 */
function retryAfterOf(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null;
  const seconds = (body as { retry_after?: unknown }).retry_after;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * The request's path alone, without the origin or the query string: the origin is the internal
 * API host and a query can carry tokens, so neither belongs in a diagnostic.
 */
function requestPath(url: string): string {
  try {
    return new URL(url, 'http://x').pathname;
  } catch {
    return url.split(/[?#]/)[0].replace(/^[a-z][a-z\d+.-]*:\/\/[^/]*/i, '') || '/';
  }
}

/**
 * What failed, for a developer: `GET /api/hostels/1 → 404`. A failure that never produced a
 * response (the server-side `TimeoutError`) has no status, so its name stands in.
 */
function diagnostic(err: unknown, method: string, url: string): string {
  const status = (err as { status?: unknown } | null)?.status;
  const name = (err as { name?: unknown } | null)?.name;
  const outcome =
    typeof status === 'number' ? String(status) : typeof name === 'string' && name ? name : 'error';
  return `${method} ${requestPath(url)} → ${outcome}`;
}

function normalize(err: HttpErrorResponse, method: string, url: string): ApiError {
  const serverMessages = extractServerMessages(err.error);
  const retryAfter = retryAfterOf(err.error);
  const verb = method.toUpperCase();
  return {
    ...(retryAfter === null ? {} : { retryAfter }),
    status: err.status,
    // The server's code wins: it is the only thing that tells a "your plan has no CRM" 403
    // apart from any other refusal. Overwriting it here is why `crm_required` never reached
    // a screen. Without one, fall back to a code derived from the status.
    code: serverCode(err.error) ?? (err.status === 0 ? 'network_error' : 'unknown_error'),
    // Diagnostic only, and never shown: display copy comes from `serverMessages` through the
    // classifiers and `toToastCopy`. Angular's own message is avoided because it carries the
    // API origin and the full query, and the server's text because it would look renderable.
    message: diagnostic(err, verb, url),
    serverMessages: serverMessages.length ? serverMessages : undefined,
    method: verb,
  };
}
