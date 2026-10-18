import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  AdminBillingQuery,
  AdminCurrency,
  AdminHostelBilling,
  AdminPaymentDetail,
  AdminPaymentPage,
  AdminPaymentRow,
  AdminPlan,
  AdminPlanUpdate,
  AdminStatusOption,
  BillingInvoice,
  BillingInvoicePage,
  BillingInvoiceRow,
  BillingInvoiceStatusOption,
  BillingPayment,
  HostBilling,
  SubscriptionEvent,
} from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';
import { dayRangeEnd, dayRangeStart } from '@util/date-range-filter';
import { ApiPagination, pageParams, toPageInfo } from '@util/pagination';
import { quiet } from './quiet-request';

/** Rows per page on every admin billing list. */
export const ADMIN_BILLING_PAGE_SIZE = 20;

interface PaymentsEnvelope {
  payments?: AdminPaymentRow[] | null;
  possible_statuses?: AdminStatusOption[] | null;
  pagination?: ApiPagination | null;
  success?: boolean;
}

interface PaymentDetailEnvelope {
  payment: BillingPayment;
  invoice: BillingInvoice;
  success?: boolean;
}

interface InvoicesEnvelope {
  invoices?: BillingInvoiceRow[] | null;
  possible_statuses?: BillingInvoiceStatusOption[] | null;
  pagination?: ApiPagination | null;
  success?: boolean;
}

interface InvoiceEnvelope {
  invoice: BillingInvoice;
  success?: boolean;
}

interface HostelBillingEnvelope {
  billing: HostBilling;
  billing_currency_override?: string | null;
  events?: SubscriptionEvent[] | null;
  success?: boolean;
}

interface PlansEnvelope {
  plans?: AdminPlan[] | null;
  success?: boolean;
}

interface PlanEnvelope {
  plan: AdminPlan;
  success?: boolean;
}

type QueryParams = Record<string, string | number>;

/** The filters both lists share; the invoice number goes under `numberParam`, which differs. */
function listParams(q: AdminBillingQuery, numberParam: string): QueryParams {
  const params: QueryParams = {
    ...pageParams(q.page ?? 1, q.limit ?? ADMIN_BILLING_PAGE_SIZE),
  };
  if (q.status && q.status !== 'all') params['f[status.slug]'] = q.status;
  if (q.from) params['f[created_at][gte]'] = dayRangeStart(q.from);
  if (q.to) params['f[created_at][lte]'] = dayRangeEnd(q.to);
  const hostelName = q.hostelName?.trim();
  if (hostelName) params['s[hostel.name]'] = hostelName;
  if (q.hostelId) params['f[hostel_id]'] = q.hostelId;
  if (q.method) params['f[payment_method]'] = q.method;
  if (q.currency) params['f[currency]'] = q.currency;
  const invoiceNumber = q.invoiceNumber?.trim();
  if (invoiceNumber) params[numberParam] = invoiceNumber;
  if (q.sort) params[`sort[${q.sort.field}]`] = q.sort.dir;
  return params;
}

function toHostelBilling(res: HostelBillingEnvelope): AdminHostelBilling {
  return {
    billing: res.billing,
    billing_currency_override: res.billing_currency_override ?? null,
    events: res.events ?? [],
  };
}

function toPaymentDetail(res: PaymentDetailEnvelope): AdminPaymentDetail {
  return { payment: res.payment, invoice: res.invoice };
}

/**
 * HostelHive's billing as an admin sees it: every payment and invoice, one hostel's
 * subscription, and the plan prices.
 *
 * Only unwraps envelopes: ids go back exactly as returned and no amount is ever computed.
 * Every call skips the global toast because each admin screen renders its failures inline.
 */
@Injectable({ providedIn: 'root' })
export class AdminBillingApi {
  private readonly api = inject(ApiClient);

  payments(q: AdminBillingQuery = {}): Observable<AdminPaymentPage> {
    const page = q.page ?? 1;
    return this.api
      .get<PaymentsEnvelope>(
        '/api/admin/payments',
        listParams(q, 's[invoice.number]'),
        quiet(),
      )
      .pipe(
        map((res) => {
          const rows = res.payments ?? [];
          return {
            rows,
            statuses: res.possible_statuses ?? [],
            page: toPageInfo(res.pagination, page, rows.length),
          };
        }),
      );
  }

  /** The payment with its invoice. Neither carries the hostel; that comes from the list row. */
  payment(id: string): Observable<AdminPaymentDetail> {
    return this.api
      .get<PaymentDetailEnvelope>(
        `/api/admin/payments/${id}`,
        undefined,
        quiet(),
      )
      .pipe(map(toPaymentDetail));
  }

  /**
   * Confirms a bank transfer. A 200 can still carry a failed payment when it did not match the
   * invoice, so callers read the outcome from `payment.status.slug`.
   */
  verify(id: string): Observable<AdminPaymentDetail> {
    return this.api
      .put<PaymentDetailEnvelope>(
        `/api/admin/payments/${id}/verify`,
        {},
        quiet(),
      )
      .pipe(map(toPaymentDetail));
  }

  /** Fails a bank transfer; the host is emailed `reason` and the invoice stays open. */
  reject(id: string, reason: string): Observable<AdminPaymentDetail> {
    return this.api
      .put<PaymentDetailEnvelope>(
        `/api/admin/payments/${id}/reject`,
        { reason: reason.trim() },
        quiet(),
      )
      .pipe(map(toPaymentDetail));
  }

  invoices(q: AdminBillingQuery = {}): Observable<BillingInvoicePage> {
    const page = q.page ?? 1;
    return this.api
      .get<InvoicesEnvelope>(
        '/api/admin/invoices',
        listParams(q, 'f[number]'),
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

  invoice(id: string): Observable<BillingInvoice> {
    return this.api
      .get<InvoiceEnvelope>(`/api/admin/invoices/${id}`, undefined, quiet())
      .pipe(map((res) => res.invoice));
  }

  hostelBilling(hostelId: string): Observable<AdminHostelBilling> {
    return this.api
      .get<HostelBillingEnvelope>(
        `/api/admin/hostels/${hostelId}/billing`,
        undefined,
        quiet(),
      )
      .pipe(map(toHostelBilling));
  }

  /** Gives the hostel `months` of the plan free of charge; `planId` goes back as returned. */
  grant(
    hostelId: string,
    planId: string,
    months: number,
  ): Observable<AdminHostelBilling> {
    return this.api
      .post<HostelBillingEnvelope>(
        `/api/admin/hostels/${hostelId}/grant`,
        { plan_id: planId, months },
        quiet(),
      )
      .pipe(map(toHostelBilling));
  }

  /** Overrides the currency the hostel is billed in from its next renewal; `''` clears it. */
  setBillingCurrency(
    hostelId: string,
    currency: AdminCurrency | '',
  ): Observable<AdminHostelBilling> {
    return this.api
      .put<HostelBillingEnvelope>(
        `/api/admin/hostels/${hostelId}/billing_currency`,
        { currency },
        quiet(),
      )
      .pipe(map(toHostelBilling));
  }

  /** Every plan in position order, active or not. */
  plans(): Observable<AdminPlan[]> {
    return this.api
      .get<PlansEnvelope>('/api/admin/plans', undefined, quiet())
      .pipe(map((res) => res.plans ?? []));
  }

  updatePlan(id: string, body: AdminPlanUpdate): Observable<AdminPlan> {
    return this.api
      .put<PlanEnvelope>(`/api/admin/plans/${id}`, body, quiet())
      .pipe(map((res) => res.plan));
  }
}
