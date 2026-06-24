import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ACCESS_TOKEN } from '@core/tokens';
import { API_CONFIG } from '@core/api-config';

/**
 * Attaches the bearer token + credentials to same-origin API calls only.
 * The token getter is provided by `@hostelhive/auth`; the refresh cookie rides
 * along via `withCredentials` (Q-AUTH default).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_CONFIG).baseUrl;
  if (!req.url.startsWith(base)) return next(req);

  const token = inject(ACCESS_TOKEN, { optional: true })?.();
  return next(
    token
      ? req.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        })
      : req.clone({ withCredentials: true }),
  );
};
