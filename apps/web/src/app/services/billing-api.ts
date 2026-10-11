import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  BillingInvoice,
  BillingInvoicePage,
  BillingInvoiceRow,
  BillingInvoiceStatusOption,
  HostBilling,
  PlansResponse,
  StartedPayment,
} from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';
import {
  ApiPagination,
  PAGE_SIZE,
  pageParams,
  toPageInfo,
} from '@util/pagination';

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

function quiet(): HttpContext {
  return new HttpContext().set(SUPPRESS_ERROR_TOAST, true);
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

  invoice(invoiceId: string): Observable<BillingInvoice> {
    return this.api
      .get<InvoiceEnvelope>(`/api/invoices/${invoiceId}`, undefined, quiet())
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

  /** Starts a Safepay payment for the invoice; the result carries the page to send the payer to. */
  pay(invoiceId: string): Observable<StartedPayment> {
    return this.api
      .post<PaymentEnvelope>(
        `/api/invoices/${invoiceId}/payments`,
        { payment_method: 'safepay' },
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
