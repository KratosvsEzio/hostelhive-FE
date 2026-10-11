import {
  Observable,
  catchError,
  defer,
  exhaustMap,
  map,
  of,
  takeUntil,
  takeWhile,
  timer,
} from 'rxjs';
import type { ApiError, BillingInvoice } from '@hostelhive/data-access';

/** One poll result: the invoice as fetched, or the error that fetch failed with. */
export type PollTick = { invoice: BillingInvoice } | { error: ApiError };

export interface PollInvoiceOptions {
  /** Gap between fetches, in ms. */
  everyMs?: number;
  /** How long to keep polling before giving up, in ms. */
  forMs?: number;
  /** True for the tick that settles it; polling completes right after emitting that tick. */
  until?: (tick: PollTick) => boolean;
}

/**
 * Fetches an invoice straight away, then every `everyMs`, until `until` accepts a tick or
 * `forMs` runs out.
 *
 * A failed fetch is emitted as an `{ error }` tick rather than ending the stream, so a
 * transient error keeps polling. A slow fetch is never overlapped: ticks that fall while one
 * is in flight are skipped. Completing with no terminal tick means the time ran out; to check
 * again, subscribe again.
 */
export function pollInvoice(
  fetch: () => Observable<BillingInvoice>,
  opts: PollInvoiceOptions = {},
): Observable<PollTick> {
  const { everyMs = 2500, forMs = 60_000, until = () => false } = opts;

  return timer(0, everyMs).pipe(
    exhaustMap(() =>
      defer(fetch).pipe(
        map((invoice): PollTick => ({ invoice })),
        catchError((error: ApiError) => of<PollTick>({ error })),
      ),
    ),
    takeWhile((tick) => !until(tick), true),
    takeUntil(timer(forMs)),
  );
}
