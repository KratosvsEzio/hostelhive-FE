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

/** One generic poll result: the value as fetched, or the error that fetch failed with. */
export type PollResult<T> = { value: T } | { error: ApiError };

export interface PollUntilOptions<T> {
  /** Gap between fetches, in ms. */
  everyMs?: number;
  /** How long to keep polling before giving up, in ms. */
  forMs?: number;
  /** True for the result that settles it; polling completes right after emitting that result. */
  done?: (result: PollResult<T>) => boolean;
}

/**
 * Fetches straight away, then every `everyMs`, until `done` accepts a result or `forMs` runs out.
 *
 * A failed fetch is emitted as an `{ error }` result rather than ending the stream, so a
 * transient error keeps polling. A slow fetch is never overlapped: ticks that fall while one
 * is in flight are skipped. Completing with no terminal result means the time ran out; to check
 * again, subscribe again.
 */
export function pollUntil<T>(
  fetch: () => Observable<T>,
  opts: PollUntilOptions<T> = {},
): Observable<PollResult<T>> {
  const { everyMs = 2500, forMs = 60_000, done = () => false } = opts;

  return timer(0, everyMs).pipe(
    exhaustMap(() =>
      defer(fetch).pipe(
        map((value): PollResult<T> => ({ value })),
        catchError((error: ApiError) => of<PollResult<T>>({ error })),
      ),
    ),
    takeWhile((result) => !done(result), true),
    takeUntil(timer(forMs)),
  );
}

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

function toTick(result: PollResult<BillingInvoice>): PollTick {
  return 'error' in result ? result : { invoice: result.value };
}

/** {@link pollUntil} for an invoice, with its results shaped as `{ invoice }` ticks. */
export function pollInvoice(
  fetch: () => Observable<BillingInvoice>,
  opts: PollInvoiceOptions = {},
): Observable<PollTick> {
  const { until = () => false, ...timing } = opts;
  return pollUntil(fetch, {
    ...timing,
    done: (result) => until(toTick(result)),
  }).pipe(map(toTick));
}
