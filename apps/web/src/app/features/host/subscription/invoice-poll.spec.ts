import { Observable, Subject, Subscription, of, throwError } from 'rxjs';
import type { ApiError, BillingInvoice } from '@hostelhive/data-access';
import { PollResult, PollTick, pollInvoice, pollUntil } from './invoice-poll';

function invoice(slug = 'open'): BillingInvoice {
  return {
    id: 'inv1',
    number: 'HH-2026-0042',
    kind: 'new',
    currency: 'PKR',
    total: '5000.00',
    period_start: '2026-10-12T00:00:00.000+05:00',
    period_end: '2026-11-12T00:00:00.000+05:00',
    expires_at: null,
    paid_at: null,
    voided_at: null,
    created_at: '2026-10-11T10:00:00.000+05:00',
    invoice_pdf_url: null,
    plan: null,
    lines: [],
    status: { id: 1, name: slug, slug, color: null },
    payments: [],
  };
}

const NETWORK: ApiError = { status: 0, code: 'network_error', message: '' };

const isPaid = (tick: PollTick) =>
  'invoice' in tick && tick.invoice.status.slug === 'paid';

describe('pollInvoice', () => {
  let ticks: PollTick[];
  let completed: boolean;
  let sub: Subscription | undefined;

  function watch(source: Observable<PollTick>): void {
    ticks = [];
    completed = false;
    sub = source.subscribe({
      next: (tick) => ticks.push(tick),
      complete: () => (completed = true),
    });
  }

  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    sub?.unsubscribe();
    sub = undefined;
    vi.useRealTimers();
  });

  it('fetches at once, then every 2500 ms', () => {
    const fetch = vi.fn(() => of(invoice()));
    watch(pollInvoice(fetch));

    vi.advanceTimersByTime(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2499);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(fetch).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(5000);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(ticks).toHaveLength(4);
    expect(ticks.every((t) => 'invoice' in t)).toBe(true);
    expect(completed).toBe(false);
  });

  it('never starts a fetch while the previous one is still in flight', () => {
    const pending: Subject<BillingInvoice>[] = [];
    const fetch = vi.fn(() => {
      const s = new Subject<BillingInvoice>();
      pending.push(s);
      return s.asObservable();
    });
    watch(pollInvoice(fetch));

    vi.advanceTimersByTime(0);
    vi.advanceTimersByTime(7500);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ticks).toHaveLength(0);

    pending[0].next(invoice());
    pending[0].complete();
    expect(ticks).toHaveLength(1);

    // The next fetch waits for the next scheduled tick rather than firing on completion.
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2500);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('completes right after emitting the tick that until() accepts', () => {
    const replies = [invoice('open'), invoice('paid')];
    const fetch = vi.fn(() => of(replies.shift() ?? invoice('open')));
    watch(pollInvoice(fetch, { until: isPaid }));

    vi.advanceTimersByTime(0);
    expect(completed).toBe(false);

    vi.advanceTimersByTime(2500);
    expect(ticks).toHaveLength(2);
    expect(isPaid(ticks[1])).toBe(true);
    expect(completed).toBe(true);

    vi.advanceTimersByTime(10_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('completes without a further tick once forMs runs out', () => {
    const fetch = vi.fn(() => of(invoice()));
    watch(pollInvoice(fetch, { forMs: 6000 }));

    vi.advanceTimersByTime(5999);
    expect(ticks).toHaveLength(3);
    expect(completed).toBe(false);

    vi.advanceTimersByTime(1);
    expect(completed).toBe(true);
    expect(ticks).toHaveLength(3);

    vi.advanceTimersByTime(10_000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('gives up after 60 seconds by default', () => {
    const fetch = vi.fn(() => of(invoice()));
    watch(pollInvoice(fetch));

    vi.advanceTimersByTime(59_999);
    expect(completed).toBe(false);

    vi.advanceTimersByTime(1);
    expect(completed).toBe(true);
    const seen = ticks.length;

    vi.advanceTimersByTime(10_000);
    expect(ticks).toHaveLength(seen);
  });

  it('drops a fetch still in flight when time runs out', () => {
    const pending = new Subject<BillingInvoice>();
    watch(pollInvoice(() => pending, { forMs: 3000 }));

    vi.advanceTimersByTime(3000);
    expect(completed).toBe(true);

    pending.next(invoice('paid'));
    expect(ticks).toHaveLength(0);
  });

  it('makes no request after unsubscribe', () => {
    const fetch = vi.fn(() => of(invoice()));
    watch(pollInvoice(fetch));

    vi.advanceTimersByTime(2500);
    expect(fetch).toHaveBeenCalledTimes(2);

    sub?.unsubscribe();
    vi.advanceTimersByTime(30_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('turns a failed fetch into an error tick and keeps polling', () => {
    let calls = 0;
    const fetch = vi.fn(() =>
      ++calls === 1 ? throwError(() => NETWORK) : of(invoice()),
    );
    watch(pollInvoice(fetch));

    vi.advanceTimersByTime(0);
    expect(ticks).toEqual([{ error: NETWORK }]);
    expect(completed).toBe(false);

    vi.advanceTimersByTime(2500);
    expect(ticks).toHaveLength(2);
    expect('invoice' in ticks[1]).toBe(true);
  });

  it('can stop on an error tick', () => {
    const notFound: ApiError = { status: 404, code: 'not_found', message: '' };
    const fetch = vi.fn(() => throwError(() => notFound));
    watch(
      pollInvoice(fetch, {
        until: (t) => 'error' in t && t.error.status === 404,
      }),
    );

    vi.advanceTimersByTime(0);
    expect(ticks).toEqual([{ error: notFound }]);
    expect(completed).toBe(true);
  });

  it('starts over on a fresh subscription', () => {
    const fetch = vi.fn(() => of(invoice()));
    const poll = pollInvoice(fetch, { forMs: 1000 });

    watch(poll);
    vi.advanceTimersByTime(1000);
    expect(completed).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);

    watch(poll);
    vi.advanceTimersByTime(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(completed).toBe(false);
  });
});

describe('pollUntil', () => {
  let results: PollResult<number>[];
  let completed: boolean;
  let sub: Subscription | undefined;

  function watch(source: Observable<PollResult<number>>): void {
    results = [];
    completed = false;
    sub = source.subscribe({
      next: (result) => results.push(result),
      complete: () => (completed = true),
    });
  }

  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    sub?.unsubscribe();
    sub = undefined;
    vi.useRealTimers();
  });

  it('fetches at once, then every 2500 ms, wrapping each value', () => {
    let n = 0;
    const fetch = vi.fn(() => of(++n));
    watch(pollUntil(fetch));

    vi.advanceTimersByTime(0);
    expect(results).toEqual([{ value: 1 }]);

    vi.advanceTimersByTime(2499);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(results).toEqual([{ value: 1 }, { value: 2 }]);
    expect(completed).toBe(false);
  });

  it('never overlaps a fetch still in flight', () => {
    const pending: Subject<number>[] = [];
    const fetch = vi.fn(() => {
      const s = new Subject<number>();
      pending.push(s);
      return s.asObservable();
    });
    watch(pollUntil(fetch, { everyMs: 1000 }));

    vi.advanceTimersByTime(4000);
    expect(fetch).toHaveBeenCalledTimes(1);

    pending[0].next(7);
    pending[0].complete();
    expect(results).toEqual([{ value: 7 }]);

    vi.advanceTimersByTime(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('completes right after emitting the result done() accepts', () => {
    let n = 0;
    const fetch = vi.fn(() => of(++n));
    watch(
      pollUntil(fetch, {
        done: (r) => 'value' in r && r.value === 2,
      }),
    );

    vi.advanceTimersByTime(2500);
    expect(results).toEqual([{ value: 1 }, { value: 2 }]);
    expect(completed).toBe(true);

    vi.advanceTimersByTime(10_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after 60 seconds by default, without a further result', () => {
    const fetch = vi.fn(() => of(1));
    watch(pollUntil(fetch));

    vi.advanceTimersByTime(59_999);
    expect(completed).toBe(false);
    const seen = results.length;

    vi.advanceTimersByTime(1);
    expect(completed).toBe(true);
    expect(results).toHaveLength(seen);

    vi.advanceTimersByTime(10_000);
    expect(fetch).toHaveBeenCalledTimes(seen);
  });

  it('honours its own window and gap', () => {
    const fetch = vi.fn(() => of(1));
    watch(pollUntil(fetch, { everyMs: 1000, forMs: 3500 }));

    vi.advanceTimersByTime(3500);
    expect(completed).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('turns a failed fetch into an error result and keeps polling', () => {
    let calls = 0;
    const fetch = vi.fn(() =>
      ++calls === 1 ? throwError(() => NETWORK) : of(5),
    );
    watch(pollUntil(fetch));

    vi.advanceTimersByTime(2500);
    expect(results).toEqual([{ error: NETWORK }, { value: 5 }]);
    expect(completed).toBe(false);
  });
});

describe('pollInvoice timing options', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes everyMs through to the poll', () => {
    const fetch = vi.fn(() => of(invoice()));
    const sub = pollInvoice(fetch, { everyMs: 1000 }).subscribe();

    vi.advanceTimersByTime(3000);
    sub.unsubscribe();

    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
