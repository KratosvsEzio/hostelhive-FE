import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  BillingInvoice,
  HostBilling,
  PlansResponse,
} from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';

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

function quiet(): HttpContext {
  return new HttpContext().set(SUPPRESS_ERROR_TOAST, true);
}

/**
 * HostelHive's own billing: public plans, a hostel's billing summary, checkout and invoices.
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
}
