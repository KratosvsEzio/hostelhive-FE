/**
 * The admin side of HostelHive's own billing: every payment and invoice across hostels, one
 * hostel's subscription and history, and the plan price list. Wire shapes field for field in
 * snake_case; amounts stay the API's decimal strings and ids stay exactly as returned.
 */

import type { PageInfo } from '@util/pagination';
import type {
  BillingInvoice,
  BillingPayment,
  BillingStatus,
  HostBilling,
} from './billing';

/** The currencies a plan can be priced in and a hostel can be billed in. */
export type AdminCurrency = 'PKR' | 'USD';

export type AdminSortDir = 'asc' | 'desc';

/** GET /api/admin/payments row = search document. amount_minor is never read. */
export interface AdminPaymentRow {
  id: string;
  hostel_id: string;
  invoice_id: string;
  payment_method: string;
  currency: string;
  /** Decimal string. */
  amount: string;
  reference: string | null;
  gateway_reference: string | null;
  failure_reason: string | null;
  verified_at: string | null;
  succeeded_at: string | null;
  created_at: string;
  verified_by: { id: string; name: string } | null;
  /** status here is a plain slug string, not an object. */
  invoice: {
    id: string;
    number: string;
    kind: string;
    status: string;
    plan: { code: string; name: string } | null;
  } | null;
  hostel: { id: string; name: string; host_id?: string | null } | null;
  status: BillingStatus & { position?: number | null };
}

/** A status the payments filter can offer, from `possible_statuses`. */
export interface AdminStatusOption {
  id: string | number;
  name: string;
  slug: string;
}

export interface AdminPaymentPage {
  rows: AdminPaymentRow[];
  statuses: AdminStatusOption[];
  page: PageInfo;
}

/** show / verify / reject. Neither half carries the hostel. */
export interface AdminPaymentDetail {
  payment: BillingPayment;
  invoice: BillingInvoice;
}

/** data.payment_id is a raw DB id: never read, render, link or send it. */
export interface SubscriptionEvent {
  id: string;
  /** Typed open, so a kind the server adds later renders as "other", not a crash. */
  kind: string;
  data: Record<string, unknown> | null;
  created_at: string;
  invoice_number: string | null;
}

/** Oldest to newest, last 100. */
export interface AdminHostelBilling {
  billing: HostBilling;
  billing_currency_override: string | null;
  events: SubscriptionEvent[];
}

export interface AdminPlan {
  id: string;
  code: string;
  name: string;
  active: boolean;
  position: number;
  features: string[];
  /** Decimal strings; a currency the plan has no price in has no key at all. */
  prices: Partial<Record<AdminCurrency, string>>;
}

/** `PUT /api/admin/plans/:id`. Prices go as typed; only the changed ones are sent. */
export interface AdminPlanUpdate {
  plan: { name: string; active: boolean };
  prices?: Partial<Record<AdminCurrency, string>>;
}

/** What an admin billing list asks for; every absent or null field is left out of the request. */
export interface AdminBillingQuery {
  page?: number;
  limit?: number;
  /** `'all'` or null asks for every status. */
  status?: string | null;
  /** `YYYY-MM-DD`, widened to the whole day when sent. */
  from?: string | null;
  to?: string | null;
  hostelName?: string | null;
  hostelId?: string | null;
  method?: string | null;
  currency?: AdminCurrency | null;
  invoiceNumber?: string | null;
  sort?: { field: string; dir: AdminSortDir } | null;
}
