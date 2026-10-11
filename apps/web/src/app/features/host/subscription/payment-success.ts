import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import type { BillingInvoice } from '@hostelhive/data-access';
import { BillingApi } from '@services';
import { isNetworkError } from '@util/network-error';
import { latestAttemptNotice } from '@app/shared/billing/billing-labels';
import { PollTick, pollInvoice } from './invoice-poll';
import { PaymentReturnRetry } from './payment-return-retry';
import { PaymentReturnStates, ReturnView } from './payment-return-states';
import { SafepayCheckout } from './safepay-checkout';

/** The latest attempt on this invoice is a Safepay payment that failed. */
function lastSafepayFailed(invoice: BillingInvoice): boolean {
  const latest = invoice.payments?.[invoice.payments.length - 1];
  return (
    latest?.payment_method === 'safepay' && latest.status?.slug === 'failed'
  );
}

/** The state a poll tick settles the page in, or null while it is still confirming. */
function settledView(tick: PollTick): ReturnView | null {
  if ('error' in tick) {
    if (tick.error?.status === 403) return { kind: 'forbidden' };
    if (tick.error?.status === 404) return { kind: 'notFound' };
    return null;
  }
  const { invoice } = tick;
  switch (invoice.status?.slug) {
    case 'paid':
      return { kind: 'paid' };
    case 'void':
      return { kind: 'voidAfterPay' };
  }
  if (lastSafepayFailed(invoice)) {
    const notice = latestAttemptNotice(invoice);
    return {
      kind: 'failed',
      charged: notice?.key === 'hostPayment.chargedNotApplied',
    };
  }
  return null;
}

/**
 * Where Safepay sends a payer after they pay: `/billing/payment/success?invoice=…`.
 *
 * Arriving here proves nothing, so the page polls the invoice until the server says how it
 * ended, and claims success only once the invoice itself reads paid. When the server has not
 * decided within the poll's window, it says so and offers to check again.
 */
@Component({
  selector: 'hh-payment-success',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PaymentReturnStates],
  providers: [PaymentReturnRetry],
  template: `
    <hh-payment-return-states
      [view]="view()"
      [invoice]="invoice()"
      [billingLink]="billingLink"
      [retry]="retry.state()"
      (tryAgain)="tryAgain()"
      (checkAgain)="check()"
    />
  `,
})
export class PaymentSuccess {
  private readonly api = inject(BillingApi);
  private readonly checkout = inject(SafepayCheckout);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly retry = inject(PaymentReturnRetry);

  private readonly invoiceId =
    inject(ActivatedRoute).snapshot.queryParamMap.get('invoice')?.trim() ||
    null;

  // Read before a settled invoice clears the stash it is derived from.
  protected readonly billingLink = this.checkout.billingCommands(
    this.invoiceId,
  );

  protected readonly invoice = signal<BillingInvoice | null>(null);
  protected readonly view = signal<ReturnView>(
    this.invoiceId ? { kind: 'confirming' } : { kind: 'missing' },
  );

  private poll: Subscription | null = null;

  constructor() {
    this.check();
    // Back from Safepay out of the back-forward cache: the attempt may have settled meanwhile.
    this.checkout.restored$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.view().kind !== 'expired') this.check();
      });
  }

  /** Polls the invoice until it settles or the window runs out; called again by Check again. */
  protected check(): void {
    const id = this.invoiceId;
    if (!id) return;
    this.poll?.unsubscribe();
    this.view.set({ kind: 'confirming' });

    let last: PollTick | null = null;
    let settled = false;
    this.poll = pollInvoice(() => this.api.refreshInvoicePayments(id), {
      until: (tick) => settledView(tick) !== null,
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tick) => {
          last = tick;
          if ('invoice' in tick) this.invoice.set(tick.invoice);
          const view = settledView(tick);
          if (!view) return;
          settled = true;
          this.settle(view);
        },
        complete: () => {
          if (settled) return;
          this.view.set({ kind: 'slow', network: lastFailedOffline(last) });
        },
      });
  }

  protected tryAgain(): void {
    const id = this.invoiceId;
    if (!id) return;
    this.retry.start(id, {
      expired: (message) => this.view.set({ kind: 'expired', message }),
      settled: () => this.check(),
      notFound: () => this.view.set({ kind: 'notFound' }),
    });
  }

  private settle(view: ReturnView): void {
    if (view.kind === 'paid' || view.kind === 'voidAfterPay') {
      this.checkout.clearReturn();
    }
    this.view.set(view);
  }
}

/** The poll's last check never reached the server. */
function lastFailedOffline(tick: PollTick | null): boolean {
  return !!tick && 'error' in tick && isNetworkError(tick.error);
}
