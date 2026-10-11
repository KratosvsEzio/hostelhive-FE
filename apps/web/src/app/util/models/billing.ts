/**
 * HostelHive's own billing (plans, subscription, invoices), not the renter bills under the host
 * console's "Invoices". Wire shapes field for field in snake_case, as `hostel.ts` does, and every
 * amount stays the API's decimal string: it is only ever formatted, never used in arithmetic.
 */

import type { PageInfo } from '@util/pagination';

/** A status colour as the search index returns it; the detail payload may send a plain string. */
export interface BillingStatusColor {
  id?: string | number | null;
  primary?: string | null;
  secondary?: string | null;
  tertiary?: string | null;
}

/** A status object as the API returns it. Branch on `slug`; `name` is display text. */
export interface BillingStatus {
  id: string | number;
  name: string;
  slug: string;
  /** Not rendered anywhere; the pill tone comes from `slug`. */
  color?: BillingStatusColor | string | null;
}

/** What the plan's button does for this hostel, decided by the server. */
export type PlanAction =
  | 'buy'
  | 'upgrade'
  | 'renew'
  | 'current'
  | 'downgrade'
  | 'unavailable';

/** Why an invoice was issued. */
export type BillingInvoiceKind = 'new' | 'renewal' | 'upgrade';

/** A plan as `GET /api/plans` lists it. */
export interface PublicPlan {
  /** Obfuscated id; sent back as `plan_id` exactly as returned. */
  id: string;
  code: string;
  name: string;
  /** Add-ons only (`boost`, `crm`). Listing is part of every plan and never appears here. */
  features: string[];
  interval: string;
  currency: string;
  /** Decimal string, or null when the plan has no price in `currency`. */
  price: string | null;
}

/** `GET /api/plans`: the currency the server picked from the country, and its plans. */
export interface PlansResponse {
  currency: string;
  /** Upper-cased country the server priced for, or null when it had none. */
  country: string | null;
  plans: PublicPlan[];
}

/** A plan on the billing screen, with the action the server allows for this hostel. */
export interface BillingPlan extends PublicPlan {
  /** A {@link PlanAction}, typed open so one the server adds later renders as unknown, not a crash. */
  action: string;
  /** Decimal string. For `current` it is the renewal price, which the screen does not show. */
  amount_due_now: string | null;
  /** Only on `unavailable`: the server's English explanation, shown as returned. */
  reason?: string;
  /** Only on `downgrade`: whether this plan is already scheduled for the next renewal. */
  scheduled?: boolean;
}

/** The plan a subscription or invoice refers to. */
export interface BillingPlanRef {
  id: string;
  code: string;
  name: string;
  features: string[];
}

export interface BillingSubscription {
  id: string;
  status: BillingStatus;
  currency: string;
  plan: BillingPlanRef;
  current_period_start: string | null;
  current_period_end: string | null;
  /** While past due, Listing and CRM stay on until this instant. */
  grace_until: string | null;
  scheduled_plan: Pick<BillingPlanRef, 'id' | 'code' | 'name'> | null;
  cancel_at_period_end: boolean;
}

/** The unpaid invoice summarised on the billing payload. It carries no plan or lines. */
export interface OpenInvoice {
  id: string;
  number: string;
  /** A {@link BillingInvoiceKind}; typed open, an unknown kind shows the period alone. */
  kind: string;
  /** Decimal string. */
  total: string;
  currency: string;
  period_start: string | null;
  period_end: string | null;
  expires_at: string | null;
  /** A bank transfer against it is waiting for the team to confirm. */
  awaiting_verification: boolean;
}

/** `GET /api/hostels/:id/billing`, unwrapped from its `billing` envelope. */
export interface HostBilling {
  currency: string;
  country_code: string | null;
  payment_methods: string[];
  /** Null when the hostel has no subscription, or one with no plan yet. */
  subscription: BillingSubscription | null;
  /** What is switched on right now (`listing`, `boost`, `crm`); past due drops `boost`. */
  features: string[];
  open_invoice: OpenInvoice | null;
  plans: BillingPlan[];
}

export interface BillingInvoiceLine {
  description: string;
  /** Decimal string. */
  amount: string;
}

/** A full invoice, as checkout and `GET /api/invoices/:id` return it. */
export interface BillingInvoice {
  id: string;
  number: string;
  /** A {@link BillingInvoiceKind}; typed open, an unknown kind shows the period alone. */
  kind: string;
  currency: string;
  /** Decimal string. */
  total: string;
  period_start: string | null;
  period_end: string | null;
  expires_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string;
  invoice_pdf_url: string | null;
  plan: BillingPlanRef | null;
  lines: BillingInvoiceLine[];
  /** Slugs `open`, `paid`, `void`. */
  status: BillingStatus;
  /** Every attempt to pay this invoice, oldest first; the last one is the latest. */
  payments: BillingPayment[];
}

/** A status the history list can filter by, from `possible_statuses`. */
export interface BillingInvoiceStatusOption {
  id: string | number;
  name: string;
  slug: string;
}

/**
 * One invoice as `GET /api/hostels/:id/invoices` lists it: the search index document, not the
 * detail serializer. It carries no payments and no plan features; `total_minor` is never read.
 */
export interface BillingInvoiceRow {
  id: string;
  number: string;
  hostel_id?: string;
  /** A {@link BillingInvoiceKind}; typed open, an unknown kind shows a dash. */
  kind: string;
  currency: string;
  /** Decimal string. */
  total: string;
  period_start: string | null;
  period_end: string | null;
  expires_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string;
  invoice_pdf_url: string | null;
  /** Slugs `open`, `paid`, `void`. */
  status: BillingStatus & { position?: number | null };
  plan: { id: string; code: string; name: string } | null;
  hostel?: { id: string; name: string } | null;
  lines: BillingInvoiceLine[];
}

/** One page of a hostel's billing history, with the statuses its filter offers. */
export interface BillingInvoicePage {
  rows: BillingInvoiceRow[];
  statuses: BillingInvoiceStatusOption[];
  page: PageInfo;
}

/** One attempt to pay an invoice. */
export interface BillingPayment {
  id: string;
  /** Slugs `pending`, `awaiting-verification`, `succeeded`, `failed`. */
  status: BillingStatus;
  /** `safepay` or `bank_transfer`, as returned. */
  payment_method: string;
  /** Decimal string. */
  amount: string;
  currency: string;
  reference: string | null;
  /** The provider's own reference; never shown. */
  gateway_reference: string | null;
  /** Internal wording; never shown, only matched to pick a notice. */
  failure_reason: string | null;
  proof_url: string | null;
  verified_at: string | null;
  succeeded_at: string | null;
  created_at: string;
  invoice_id: string;
}

/** `POST /api/invoices/:id/payments`, unwrapped from its envelope. */
export interface StartedPayment {
  payment: BillingPayment;
  /** Where to send the payer; null when the provider gave no page to send them to. */
  checkout_url: string | null;
  invoice: BillingInvoice;
}
