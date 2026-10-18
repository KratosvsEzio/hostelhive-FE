import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SafepayCheckout, payErrorOutcome } from './safepay-checkout';

/** What sits under a return page's Try again button after a refused start. */
export type RetryNote =
  | { message: string }
  | { key: 'hostPayment.startFailed' | 'hostPayment.payForbidden' };

export interface RetryState {
  /** A payment start is in flight; the button stays loading until the browser leaves. */
  starting: boolean;
  /** False once the server has said this invoice cannot be paid online, or not by this user. */
  available: boolean;
  note: RetryNote | null;
}

/** The refusals that change the page rather than the note under the button. */
export interface RetryHandlers {
  /** The invoice expired while the payer was away: offer a new plan choice, without refetching. */
  expired(message: string): void;
  /** The invoice was paid or voided meanwhile: read it again. */
  settled(): void;
  notFound(): void;
}

/**
 * Try again on a payment return page: sends the payer back to Safepay for the same invoice.
 *
 * One start in flight at a time, reset when the browser restores the page from its back-forward
 * cache. Provide it on the page component, so it lives and dies with that page.
 */
@Injectable()
export class PaymentReturnRetry {
  private readonly checkout = inject(SafepayCheckout);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _state = signal<RetryState>({
    starting: false,
    available: true,
    note: null,
  });
  readonly state = this._state.asReadonly();

  constructor() {
    this.checkout.restored$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.patch({ starting: false }));
  }

  start(invoiceId: string, handlers: RetryHandlers): void {
    if (this._state().starting || !this._state().available) return;
    this.patch({ starting: true, note: null });
    this.checkout
      .start(invoiceId, this.checkout.returnHostel(invoiceId))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (err: unknown) => this.refused(err, handlers),
      });
  }

  private refused(err: unknown, handlers: RetryHandlers): void {
    this.patch({ starting: false });
    const outcome = payErrorOutcome(err);
    switch (outcome.kind) {
      case 'expired':
        handlers.expired(outcome.message);
        return;
      case 'settled':
        handlers.settled();
        return;
      case 'notFound':
        handlers.notFound();
        return;
      case 'unpayable':
        this.patch({ available: false, note: { message: outcome.message } });
        return;
      case 'retry':
      case 'declined':
      case 'inProgress':
        this.patch({ note: { message: outcome.message } });
        return;
      case 'forbidden':
        // The server's 403 text is a generic authorization notice, so ours replaces it; a retry would only 403 again.
        this.patch({
          available: false,
          note: { key: 'hostPayment.payForbidden' },
        });
        return;
      case 'failed':
        this.patch({ note: { key: 'hostPayment.startFailed' } });
        return;
    }
  }

  private patch(change: Partial<RetryState>): void {
    this._state.update((state) => ({ ...state, ...change }));
  }
}
