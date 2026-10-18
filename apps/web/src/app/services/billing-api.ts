import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  BillingInvoice,
  BillingInvoicePage,
  BillingInvoiceRow,
  BillingInvoiceStatusOption,
  HostBilling,
  PlansResponse,
  SafepayStart,
  StartedPayment,
} from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';
import {
  ApiPagination,
  PAGE_SIZE,
  pageParams,
  toPageInfo,
} from '@util/pagination';
import { quiet } from './quiet-request';

interface PlansEnvelope extends Partial<PlansResponse> {
  success?: boolean;
}

interface BillingEnvelope {
  billing: HostBilling;
  success?: boolean;
}

interface InvoiceEnvelope {
  invoice: BillingInvoice;
  success?: boolean;
}

interface InvoicesEnvelope {
  invoices?: BillingInvoiceRow[] | null;
  possible_statuses?: BillingInvoiceStatusOption[] | null;
  pagination?: ApiPagination | null;
  success?: boolean;
}

interface PaymentEnvelope extends StartedPayment {
  success?: boolean;
}

interface CardEnvelope {
  checkout_url?: string | null;
  success?: boolean;
}

interface SafepayStartEnvelope extends Partial<SafepayStart> {
  success?: boolean;
}

/**
 * HostelHive's own billing: public plans, a hostel's billing summary, checkout, invoices and payments.
 *
 * The server owns every price, proration and action, so this service only unwraps envelopes.
 * Every call skips the global toast because each screen renders its failures inline,
 * including the 403 and 422 messages a toast would only repeat.
 */
@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly api = inject(ApiClient);

  /** Public plan list. Without a country the server falls back to its own detection, then USD. */
  plans(country?: string): Observable<PlansResponse> {
    const params = country ? { country } : undefined;
    return this.api.get<PlansEnvelope>('/api/plans', params, quiet()).pipe(
      map((res) => ({
        currency: res.currency ?? '',
        country: res.country ?? null,
        plans: res.plans ?? [],
      })),
    );
  }

  billing(hostelId: string): Observable<HostBilling> {
    return this.api
      .get<BillingEnvelope>(
        `/api/hostels/${hostelId}/billing`,
        undefined,
        quiet(),
      )
      .pipe(map((res) => res.billing));
  }

  /** Issues (or reuses) the invoice for `planId`; `planId` is the plan's id exactly as returned. */
  checkout(hostelId: string, planId: string): Observable<BillingInvoice> {
    return this.api
      .post<InvoiceEnvelope>(
        `/api/hostels/${hostelId}/checkout`,
        { plan_id: planId },
        quiet(),
      )
      .pipe(map((res) => res.invoice));
  }

  /** Switches to the cheaper `planId` at renewal, replacing any switch already scheduled. */
  scheduleDowngrade(hostelId: string, planId: string): Observable<HostBilling> {
    return this.api
      .post<BillingEnvelope>(
        `/api/hostels/${hostelId}/subscription/schedule_downgrade`,
        { plan_id: planId },
        quiet(),
      )
      .pipe(map((res) => res.billing));
  }

  unscheduleDowngrade(hostelId: string): Observable<HostBilling> {
    return this.api
      .delete<BillingEnvelope>(
        `/api/hostels/${hostelId}/subscription/schedule_downgrade`,
        undefined,
        quiet(),
      )
      .pipe(map((res) => res.billing));
  }

  /** Ends the subscription at the close of the current period; nothing is refunded. */
  cancelSubscription(hostelId: string): Observable<HostBilling> {
    return this.api
      .post<BillingEnvelope>(
        `/api/hostels/${hostelId}/subscription/cancel`,
        {},
        quiet(),
      )
      .pipe(map((res) => res.billing));
  }

  resumeSubscription(hostelId: string): Observable<HostBilling> {
    return this.api
      .delete<BillingEnvelope>(
        `/api/hostels/${hostelId}/subscription/cancel`,
        undefined,
        quiet(),
      )
      .pipe(map((res) => res.billing));
  }

  invoice(invoiceId: string): Observable<BillingInvoice> {
    return this.api
      .get<InvoiceEnvelope>(`/api/invoices/${invoiceId}`, undefined, quiet())
      .pipe(map((res) => res.invoice));
  }

  /**
   * The invoice after the server has asked Safepay about its pending payment, for a payer
   * waiting on a late webhook. The server checks Safepay at most every few seconds and answers
   * with the invoice unchanged when Safepay can't be reached, so it is safe to poll.
   */
  refreshInvoicePayments(invoiceId: string): Observable<BillingInvoice> {
    return this.api
      .post<InvoiceEnvelope>(
        `/api/invoices/${invoiceId}/payments/refresh`,
        {},
        quiet(),
      )
      .pipe(map((res) => res.invoice));
  }

  /**
   * One page of the hostel's invoices, newest first as the server sorts them. A `status` of
   * `'all'`, empty or absent asks for every status.
   */
  invoices(
    hostelId: string,
    opts: { status?: string | null; page?: number; limit?: number } = {},
  ): Observable<BillingInvoicePage> {
    const page = opts.page ?? 1;
    const params: Record<string, string | number> = {
      ...pageParams(page, opts.limit ?? PAGE_SIZE),
    };
    if (opts.status && opts.status !== 'all') {
      params['f[status.slug]'] = opts.status;
    }
    return this.api
      .get<InvoicesEnvelope>(
        `/api/hostels/${hostelId}/invoices`,
        params,
        quiet(),
      )
      .pipe(
        map((res) => {
          const rows = res.invoices ?? [];
          return {
            rows,
            statuses: res.possible_statuses ?? [],
            page: toPageInfo(res.pagination, page, rows.length),
          };
        }),
      );
  }

  /**
   * Starts a Safepay payment for the invoice; the result carries the page to send the payer to.
   * With `saveCard`, Safepay also keeps the card for automatic renewal.
   */
  pay(
    invoiceId: string,
    opts: { saveCard?: boolean } = {},
  ): Observable<StartedPayment> {
    return this.startPayment(invoiceId, {
      payment_method: 'safepay',
      ...(opts.saveCard ? { save_card: true } : {}),
    });
  }

  /**
   * Charges the saved card for the invoice, with no page to leave for. The payment may come back
   * still pending; a declined card fails with a 422 that carries the bank's reason.
   */
  payWithSavedCard(invoiceId: string): Observable<StartedPayment> {
    return this.startPayment(invoiceId, { payment_method: 'saved_card' });
  }

  /** Starts saving or replacing the card at Safepay; the card shows in billing once Safepay confirms it. */
  saveCard(hostelId: string): Observable<{ checkout_url: string | null }> {
    return this.api
      .post<CardEnvelope>(
        `/api/hostels/${hostelId}/subscription/card`,
        {},
        quiet(),
      )
      .pipe(map((res) => ({ checkout_url: res.checkout_url ?? null })));
  }

  /** Forgets the saved card, which also turns automatic renewal off. */
  removeCard(hostelId: string): Observable<HostBilling> {
    return this.api
      .delete<BillingEnvelope>(
        `/api/hostels/${hostelId}/subscription/card`,
        undefined,
        quiet(),
      )
      .pipe(map((res) => res.billing));
  }

  /** Turns automatic renewal on or off; the billing it answers with says what the server decided. */
  setAutoRenew(hostelId: string, enabled: boolean): Observable<HostBilling> {
    return this.api
      .put<BillingEnvelope>(
        `/api/hostels/${hostelId}/subscription/auto_renew`,
        { enabled },
        quiet(),
      )
      .pipe(map((res) => res.billing));
  }

  /** Starts a Safepay Subscription for `planId`; the plan goes live only once Safepay confirms it. */
  subscribeWithSafepay(
    hostelId: string,
    planId: string,
  ): Observable<SafepayStart> {
    return this.api
      .post<SafepayStartEnvelope>(
        `/api/hostels/${hostelId}/subscription/safepay`,
        { plan_id: planId },
        quiet(),
      )
      .pipe(
        map((res) => ({
          checkout_url: res.checkout_url ?? null,
          trial_days: res.trial_days ?? null,
        })),
      );
  }

  private startPayment(
    invoiceId: string,
    body: Record<string, unknown>,
  ): Observable<StartedPayment> {
    return this.api
      .post<PaymentEnvelope>(
        `/api/invoices/${invoiceId}/payments`,
        body,
        quiet(),
      )
      .pipe(
        map((res) => ({
          payment: res.payment,
          checkout_url: res.checkout_url ?? null,
          invoice: res.invoice,
        })),
      );
  }
}
