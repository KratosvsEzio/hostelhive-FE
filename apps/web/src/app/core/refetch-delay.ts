import { Injectable } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { switchMap, timer } from 'rxjs';

const DELAY_MS = 1000;
const EXPIRY_MS = 2000;

@Injectable({ providedIn: 'root' })
export class RefetchDelay {
  private pending = new Map<string, number>();

  /**
   * Signal that a mutation just happened and the next GET whose URL contains
   * `listFragment` should be delayed so the backend has time to settle.
   */
  track(listFragment: string): void {
    this.pending.set(listFragment, Date.now());
  }

  /** @internal — called by the interceptor. Returns the ms to wait, 0 if none. */
  consume(url: string): number {
    for (const [fragment, ts] of this.pending) {
      if (url.includes(fragment)) {
        this.pending.delete(fragment);
        const elapsed = Date.now() - ts;
        if (elapsed < EXPIRY_MS) return Math.max(0, DELAY_MS - elapsed);
      }
    }
    return 0;
  }
}

export const refetchDelayInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') return next(req);
  const wait = inject(RefetchDelay).consume(req.url);
  return wait > 0 ? timer(wait).pipe(switchMap(() => next(req))) : next(req);
};
