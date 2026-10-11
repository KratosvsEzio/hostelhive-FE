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
import type { ApiError, BillingInvoice } from '@hostelhive/data-access';
import { BillingApi } from '@services';
import { PaymentReturnRetry } from './payment-return-retry';
import { PaymentReturnStates, ReturnView } from './payment-return-states';
import { SafepayCheckout, returnInvoiceId } from './safepay-checkout';

function viewFor(invoice: BillingInvoice): ReturnView {
  switch (invoice.status?.slug) {
    case 'open':
      return { kind: 'cancelled' };
    case 'paid':
      return { kind: 'paid' };
    case 'void':
      return { kind: 'void' };
    default:
      return { kind: 'unknown' };
  }
}

/**
 * Where Safepay sends a payer who leaves without paying: `/billing/payment/cancel?invoice=…`.
 *
 * Reads the invoice once. An open one can be paid again from here; one that was paid in the
 * meantime, or voided, shows that instead.
 */
@Component({
  selector: 'hh-payment-cancelled',
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
      (reload)="load()"
    />
  `,
})
export class PaymentCancelled {
  private readonly api = inject(BillingApi);
  private readonly checkout = inject(SafepayCheckout);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly retry = inject(PaymentReturnRetry);

  private readonly invoiceId = returnInvoiceId(
    inject(ActivatedRoute).snapshot.queryParamMap.get('invoice'),
  );

  // Read before a settled invoice clears the stash it is derived from.
  protected readonly billingLink = this.checkout.billingCommands(
    this.invoiceId,
  );

  protected readonly invoice = signal<BillingInvoice | null>(null);
  protected readonly view = signal<ReturnView>(
    this.invoiceId ? { kind: 'loading' } : { kind: 'missing' },
  );

  private request: Subscription | null = null;

  constructor() {
    this.load();
    // Back from Safepay out of the back-forward cache: the invoice may have moved on meanwhile.
    this.checkout.restored$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.view().kind !== 'expired') this.load();
      });
  }

  protected load(): void {
    const id = this.invoiceId;
    if (!id) return;
    this.request?.unsubscribe();
    if (!this.invoice()) this.view.set({ kind: 'loading' });
    this.request = this.api
      .invoice(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoice) => {
          this.invoice.set(invoice);
          const view = viewFor(invoice);
          if (view.kind === 'paid' || view.kind === 'void') {
            this.checkout.clearReturn();
          }
          this.view.set(view);
        },
        error: (err: ApiError) => this.view.set(loadFailure(err)),
      });
  }

  protected tryAgain(): void {
    const id = this.invoiceId;
    if (!id) return;
    this.retry.start(id, {
      // The expiry void may not have stuck on the server, so a refetch could offer Pay again.
      expired: (message) => this.view.set({ kind: 'expired', message }),
      settled: () => this.load(),
      notFound: () => this.view.set({ kind: 'notFound' }),
    });
  }
}

function loadFailure(err: ApiError): ReturnView {
  if (err?.status === 403) return { kind: 'forbidden' };
  if (err?.status === 404) return { kind: 'notFound' };
  return { kind: 'loadError' };
}
