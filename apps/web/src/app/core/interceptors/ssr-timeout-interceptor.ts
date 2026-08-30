import { HttpInterceptorFn } from '@angular/common/http';
import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { timeout } from 'rxjs';

/**
 * How long one request may hold up a server-side render.
 *
 * Angular gives a render nine seconds to stabilise before it gives up and serialises whatever
 * it has, so this has to fail comfortably inside that — with enough left to render the page
 * around the hole. Five seconds is already far longer than any healthy response; anything
 * still outstanding at that point is not slow, it is gone.
 */
export const SSR_REQUEST_TIMEOUT_MS = 5_000;

/**
 * Stops a dead backend from hanging server-side rendering.
 *
 * An unreachable host does not refuse a connection — it drops the packets, and the request
 * sits there until the OS gives up minutes later. Angular's `PendingTasks` counts that request
 * as work in progress, so the render never stabilises: every public page burns the full nine
 * seconds and then serialises half-drawn. A slow backend becomes a slow *site* rather than a
 * site with an error state, which is the wrong failure to have.
 *
 * **Server only.** A browser has other ways to say "still loading" — a spinner, a skeleton,
 * a user who can wait or navigate away — and cutting a slow request short there would turn
 * patience into an error nobody asked for. The server has no such luxury: it is holding a
 * response open, and there is a deadline.
 *
 * Last in the chain, closest to the backend, for two reasons: it then measures the network
 * wait rather than anything the interceptors above it add, and its `TimeoutError` surfaces
 * through `errorInterceptor` on the way back out, arriving at components as the same
 * normalised `ApiError` any other failure would.
 *
 * `timeout()` cancels the underlying request through subscription teardown. `AuthService`
 * warns against exactly that and uses `Promise.race` instead — but its reason does not apply
 * here. There, the response was still wanted after the wait was capped; here, a request that
 * has missed the render is of no use to anyone, and holding the socket open on a server
 * rendering the next page is a cost with no benefit.
 *
 * Nothing is cached from a timeout: Angular's transfer cache only carries successful
 * responses, so the browser re-fetches on hydration and the page fills in as normal.
 */
export const ssrTimeoutInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isPlatformServer(inject(PLATFORM_ID))) return next(req);
  return next(req).pipe(timeout(SSR_REQUEST_TIMEOUT_MS));
};
