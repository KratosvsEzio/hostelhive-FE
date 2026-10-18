import { Injectable, RESPONSE_INIT, inject } from '@angular/core';

/** How long a crawler is asked to wait before it retries a page the API could not serve. */
export const OUTAGE_RETRY_AFTER_SECONDS = 120;

/**
 * Whether a failed fetch means the API could not answer, rather than that it refused.
 *
 * Everything except a 4xx: a status 0 (unreachable), a 5xx, and a failure with no status at
 * all, which is the server render's `TimeoutError` after `errorInterceptor` has normalised
 * it (and a 200 that broke its own contract). A 4xx is the API's considered answer and
 * retrying will not change it. A 404 never arrives here from the listing: `getBySlug` turns
 * it into "no such listing".
 */
export function isApiOutage(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  return !(typeof status === 'number' && status >= 400 && status < 500);
}

/**
 * The HTTP response of the current server render.
 *
 * `RESPONSE_INIT` is `null` in the browser and at build time, so every method here is a
 * no-op there.
 */
@Injectable({ providedIn: 'root' })
export class SsrResponse {
  private readonly init = inject(RESPONSE_INIT, { optional: true });

  /**
   * Answers this render with a 503 and `Retry-After`, for a public page whose data the API
   * could not serve.
   *
   * Without it the page went out as a 200 carrying `robots: noindex`, and a crawler that
   * visited during an outage was told to drop a listing that still exists (Trello #154).
   * A 503 tells it to come back instead, and keeps whatever it had indexed. `no-store`
   * keeps a cache in front of the server from serving the outage page after the API is
   * back.
   */
  serviceUnavailable(): void {
    if (!this.init) return;
    const headers = new Headers(this.init.headers);
    headers.set('Retry-After', String(OUTAGE_RETRY_AFTER_SECONDS));
    headers.set('Cache-Control', 'no-store');
    this.init.status = 503;
    this.init.statusText = 'Service Unavailable';
    this.init.headers = headers;
  }
}
