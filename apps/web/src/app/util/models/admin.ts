// Admin (Feature 6) domain models — Super-Admin console.
// **Stub pending Q-API (§0)**: shapes mirror the design mockups (26/27/28) and the
// granular permission flags in '../../../../core/auth'. When the typed SDK lands, these
// interfaces stay; only the service bodies swap from `of(...)` to HttpClient calls.

import { Paginated } from './paginated';

/* ------------------------------------------------------------------ Roles (26) */

/**
 * A granular permission flag shown in the matrix. Live values come from
 * `GET /api/admin/permissions/grouped` as `"<group>.<SubjectClass>.<action>"`
 * (e.g. `core.Hostel.create`); the fixture fallback uses `"<area>.<action>"`.
 */
export type PermissionFlag = string;

/** A permission flag grouped under a matrix section, with a human label. */
export interface PermissionDef {
  flag: PermissionFlag;
  /** Human label shown in the matrix row, e.g. "Manage Attachments". */
  label: string;
  /** True for the umbrella "manage" permission — checking it cascades to every child in the group. */
  parent?: boolean;
  /** Backend permission id — collected on save into the role's `permission_ids`. */
  permissionId?: number;
}

/** A collapsible group of related flags in the matrix (Contracts, Payments, …). */
export interface PermissionGroup {
  key: string;
  label: string;
  icon: string; // Tabler icon class, e.g. 'ti-file-dollar'
  flags: PermissionDef[];
}

/** Role identifier — the 8 system roles plus any custom role ids. */
export type RoleId = string;

/**
 * A role row in the list + its assigned flags. System roles are built-in;
 * custom roles are created via the "New role" affordance.
 */
export interface RoleDef {
  id: RoleId;
  name: string;
  /** Sidebar subtitle, e.g. 'Platform-wide', 'Single hostel'. */
  scope: string;
  /** Tag shown next to the matrix heading. */
  kind: 'system' | 'custom';
  /** Longer description shown above the matrix. */
  description: string;
  /** Display count of users assigned, e.g. '1,482 users' or '2 users assigned'. */
  assigned: string;
  /** `'all'` grants every flag (super-admin); otherwise the explicit set. */
  flags: PermissionFlag[] | 'all';
  /** ISO timestamp the role was created (from the API); null for in-session custom roles. */
  createdAt?: string | null;
  /** `true` when the backend marks the role data-restricted (`is_data_restricted`). */
  dataRestricted?: boolean;
  /** Original (un-title-cased) role name from the API — sent as a plain attribute on update. */
  apiName?: string;
  /** Backend role id (hashid) — the `:id` for GET (fetch permissions) and PUT (update) /api/admin/roles/:id. */
  apiId?: string;
}

/* -------------------------------------------------------------- Contracts (27) */

// Backend contract status slug — dynamic; the filter tabs come from the API's `possible_statuses`
// (currently draft / active / expired), so this is just the slug string.
export type ContractStatus = string;
export type PaymentState = 'paid' | 'pending' | 'failed' | 'refunded';

export interface Contract {
  id: string; // display ref, e.g. 'CT-2026-0418'
  /** Real backend id (hashid string or number) — for GET /api/admin/contracts/:id (absent on fixtures). */
  contractId?: string | number;
  host: string;
  plan: string; // e.g. 'Growth · Annual'
  /** Human term range, e.g. 'Jun 8 → Jul 8 ’26'; null while pending. */
  term: string | null;
  status: ContractStatus;
  payment: PaymentState;
  amount: number; // PKR
  /** True when the contract's end date is within the next 7 days — highlights the Term cell. */
  endsSoon?: boolean;
  /** Backend hostel id — for `GET /api/hostels/:id` (the contract's hostel detail in the drawer). */
  hostelId?: number | string | null;
  /** Hostel name (the contract's property). */
  hostelName?: string | null;
  /** Backend host (user) id — for `GET /api/users/:id` (the contract's host detail in the drawer). */
  hostId?: number | string | null;
}

/** Filter chip value — a status slug from `possible_statuses`, or 'all'. */
export type ContractFilter = string;

/** A status option for the filter tabs — from `possible_statuses` in the contracts response. */
export interface ContractStatusOption {
  id: number;
  name: string;
  slug: string;
  dispositions?: { id: number; name: string; slug: string }[];
}

/** Per-status aggregate for the stat cards — from `aggs` in the contracts response. */
export interface ContractAgg {
  name: string;
  slug: string;
  count: number;
  total_amount: number;
  ending_this_month: number;
}

/** Contracts index result — a page of contracts plus the dashboard `aggs` and the tab `statuses`. */
export interface ContractsPage extends Paginated<Contract> {
  aggs: ContractAgg[];
  statuses: ContractStatusOption[];
}

/* --------------------------------------------------------------- Payments (28) */

/** A subscription payment — from `GET /api/admin/payments` (Searchkick `search_data`). */
export interface Payment {
  id: string;
  amount: number; // PKR
  currency: string; // e.g. 'PKR'
  /** Payment method, e.g. 'online', 'cash'. */
  method: string;
  /** Gateway / transaction reference; null until captured. */
  transactionId: string | null;
  /** Host name. */
  host: string;
  /** Backend host (user) id — for `GET /api/users/:id` (the drawer's host detail). */
  hostId?: number | string | null;
  /** Backend hostel id — for `GET /api/hostels/:id` (the drawer's hostel detail). */
  hostelId?: number | string | null;
  /** Hostel name — primary text in the payments table's Hostel cell (id is the secondary). */
  hostelName: string | null;
  /** Subscription product / plan name, e.g. 'Monthly'; null when absent. */
  plan: string | null;
  /** Product type, e.g. 'subscription'. */
  productType: string | null;
  /** Product billing duration in days, e.g. 30. */
  productDuration: number | null;
  /** Payment workflow status slug (e.g. pending / verified / rejected). */
  status: PaymentStatus;
  /** Display name for the status, from the API. */
  statusName: string;
  /** Linked contract id; null when absent. */
  contractId: string | null;
  /** Linked contract term, e.g. 'Jun 8 → Jul 8 ’26'; null when absent. */
  term: string | null;
  createdAt: string | null;
  paidAt: string | null;
}

/** Backend payment status slug — dynamic; the filter tabs come from `possible_statuses`. */
export type PaymentStatus = string;

/** Filter chip value — a payment status slug from `possible_statuses`, or 'all'. */
export type PaymentFilter = string;

/** A payment status option for the filter tabs — from `possible_statuses` in the response. */
export interface PaymentStatusOption {
  id: number;
  name: string;
  slug: string;
  dispositions?: { id: number; name: string; slug: string }[];
}

/** Per-status aggregate for the stat cards — from `aggs` in the payments response. */
export interface PaymentAgg {
  name: string;
  slug: string;
  count: number;
  total_amount: number;
}

/** Payments index result — a page of payments plus the dashboard `aggs` and the tab `statuses`. */
export interface PaymentsPage extends Paginated<Payment> {
  aggs: PaymentAgg[];
  statuses: PaymentStatusOption[];
}

/* -------------------------------------------------------------- Listings (admin) */

/** A hostel listing row in the admin all-listings table (`GET /api/admin/hostels`). */
export interface AdminListing {
  id: string | number;
  name: string;
  genderType: string; // 'boys' | 'girls' | 'co-living'
  propertyType: string; // 'apartment' | 'room' | 'building' | 'house'
  city: string;
  state: string;
  area: string;
  host: string;
  hostId?: string | number | null;
  statusSlug: string;
  statusName: string;
  dispositionSlug: string | null;
  dispositionName: string | null;
  createdAt: string | null;
  thumbUrl: string | null;
  startingPrice: number | null;
}

export type AdminListingFilter = string;

export interface AdminListingStatusOption {
  id: number;
  name: string;
  slug: string;
  dispositions?: { id: number; name: string; slug: string }[];
}

/** Per-status aggregate for the stat cards — from `aggs` in the hostels response. */
export interface AdminListingAgg {
  name: string;
  slug: string;
  count: number;
  dispositions: { name: string; slug: string; count: number }[];
}

export interface AdminListingsPage extends Paginated<AdminListing> {
  aggs: AdminListingAgg[];
  statuses: AdminListingStatusOption[];
}
