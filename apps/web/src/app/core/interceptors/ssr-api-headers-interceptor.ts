import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { REQUEST_CONTEXT, inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { API_CONFIG } from '@core/api-config';
import { SsrResponse } from '@core/ssr-response';

/** Proves to the API that a `/public` call comes from our own renderer. */
export const SSR_SECRET_HEADER = 'X-SSR-Secret';

/** The visitor the renderer is calling on behalf of, so the API limits them, not the server. */
export const SSR_CLIENT_IP_HEADER = 'X-SSR-Client-IP';

/**
 * What `server.ts` hands each render through `REQUEST_CONTEXT`.
 *
 * The secret arrives here per request rather than being read from `process.env` in app code:
 * `server.ts` is the only file that reads the environment, so nothing the browser bundle is
 * built from can reach the value. In the browser, and at build time, the context is `null`.
 */
export interface SsrApiContext {
  /** The secret shared with the API, or null when the server has none. */
  readonly ssrSecret: string | null;
  /** The visitor's IP as Express resolved it under `SSR_TRUST_PROXY`, or null. */
  readonly clientIp: string | null;
}

/**
 * Marks the server's own calls to the API's `/public` routes, which the API rate-limits per
 * visitor (60/min, 2,000/day) against scraping.
 *
 * Every server render calls `/public` from the same few server IPs. Without these headers the
 * API would count every visitor as one client and throttle the whole site. With them it
 * trusts `X-SSR-Client-IP` (only because `X-SSR-Secret` matches), limits each visitor on
 * their own, and gives the renderer its own overall cap.
 *
 * **Only `/public` on our API, and only on the server.** A browser call carries the visitor's
 * own IP and needs neither header; a third-party host must never see the secret.
 *
 * **A 429 answers the page with a 503.** A rate-limited render would otherwise go out as a 200
 * carrying an error state, which a cache in front of the server could keep serving.
 * `serviceUnavailable()` sets `no-store` and `Retry-After`; the error itself is never in the
 * transfer cache, so the browser fetches the data again on hydration.
 *
 * Inside `errorInterceptor`, so it sees the raw 429 before it is normalised; outside
 * `ssrTimeoutInterceptor`, which must stay last.
 */
export const ssrApiHeadersInterceptor: HttpInterceptorFn = (req, next) => {
  const context = inject(REQUEST_CONTEXT, { optional: true }) as SsrApiContext | null;
  if (!context) return next(req);
  if (!req.url.startsWith(`${inject(API_CONFIG).baseUrl}/public/`)) return next(req);

  const ssrResponse = inject(SsrResponse);
  let headers = req.headers;
  if (context.ssrSecret) {
    headers = headers.set(SSR_SECRET_HEADER, context.ssrSecret);
    // Without the secret the API ignores the IP, so it is only worth sending alongside it.
    if (context.clientIp) headers = headers.set(SSR_CLIENT_IP_HEADER, context.clientIp);
  }

  return next(req.clone({ headers })).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 429) {
        ssrResponse.serviceUnavailable();
      }
      return throwError(() => err);
    }),
  );
};
