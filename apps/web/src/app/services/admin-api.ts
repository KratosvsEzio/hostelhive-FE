import { format, getYear, parseISO } from 'date-fns';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { ApiClient } from '@core/api-resource';
import {
  AdminListing,
  AdminListingAgg,
  AdminListingFilter,
  AdminListingStatusOption,
  AdminListingsPage,
  Contract,
  ContractAgg,
  ContractFilter,
  ContractStatus,
  ContractStatusOption,
  ContractsPage,
  Payment,
  PaymentAgg,
  PaymentFilter,
  PaymentState,
  PaymentStatusOption,
  PaymentsPage,
  PermissionFlag,
  PermissionGroup,
  RoleDef,
} from '@hostelhive/data-access';
import { PERMISSION_GROUPS } from './admin.fixtures';

/**
 * Super-Admin (Feature 6) API — all live: `roles()` + `permissionsGrouped()`,
 * `contracts()` / `getContract()` (`GET /api/admin/contracts[/:id]`), and `payments()`.
 * The `authInterceptor` attaches the admin's bearer token to every call.
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly api = inject(ApiClient);

  /* ----------------------------------------------------------------- roles (26) */

  /**
   * Roles + the live permission catalog for the matrix. `GET /api/admin/roles` provides the role
   * list (`{ success, roles: ApiAdminRole[] }`), and `permissionsGrouped()` provides the matrix
   * sections. The `authInterceptor` attaches the admin's bearer token to both.
   *
   * NOTE: the roles payload carries only id/name/slug/description/is_data_restricted/created_at —
   * no per-role permissions, user counts, or system/custom flag — so each role's `flags` is empty
   * until a per-role endpoint lands.
   */
  roles(): Observable<{ roles: RoleDef[]; groups: PermissionGroup[] }> {
    return forkJoin({
      roles: this.api
        .get<AdminRolesResponse>('/api/admin/roles')
        .pipe(map((res) => extractRoles(res).map((r) => toRoleDef(r)))),
      groups: this.permissionsGrouped(),
    });
  }

  /** A single role's assigned permissions as matrix flag keys — `GET /api/admin/roles/:id`.
   *  Loaded lazily by the matrix when a role is selected (the role list omits permissions). */
  roleFlags(apiId: string): Observable<PermissionFlag[]> {
    return this.api
      .get<RoleDetailResponse>(`/api/admin/roles/${apiId}`)
      .pipe(map(rolePermissionFlags));
  }

  /**
   * Replace a role's permission set — `PUT /api/admin/roles/:id` (the RESTful member route from
   * `resources :roles`; `load_and_authorize_resource` loads the role by the URL id). Body is
   * `{ role: { name, description, permission_ids } }`; permissions are set to exactly
   * `permissionIds` (a full replace, not a merge). `apiId` is the backend hashid (same id the
   * lazy GET /api/admin/roles/:id permission fetch uses).
   */
  updateRolePermissions(
    role: RoleDef,
    permissionIds: number[],
  ): Observable<unknown> {
    return this.api.put(`/api/admin/roles/${role.apiId}`, {
      role: {
        name: role.apiName ?? role.name,
        description: role.description || null,
        permission_ids: permissionIds,
      },
    });
  }

  /**
   * Permission catalog for the matrix, from `GET /api/admin/permissions/grouped` →
   * `{ grouped_permissions: { <group>: { <SubjectClass>: { parent, children } } } }`. Each
   * (group, subject) becomes one matrix section. Falls back to the fixture layout if the
   * endpoint is unavailable, so the page still renders.
   */
  permissionsGrouped(): Observable<PermissionGroup[]> {
    return this.api
      .get<GroupedPermissionsResponse>('/api/admin/permissions/grouped')
      .pipe(
        map(toPermissionGroups),
        map((groups) => (groups.length ? groups : PERMISSION_GROUPS)),
        catchError(() => of(PERMISSION_GROUPS)),
      );
  }

  /* ------------------------------------------------------------- contracts (27) */

  /**
   * Contracts table — `GET /api/admin/contracts` (index, Searchkick-backed). Paginated server-side
   * (`page` + `limit`); the response carries a `pagination` envelope (total_count / total_pages). A
   * status filter is pushed to the server as `f[status.slug]=<slug>`. The list has no payment
   * object, so the payment state is derived from the disposition; the detail (`getContract`) has
   * the real one.
   */
  contracts(
    filter: ContractFilter = 'all',
    page = 1,
    search?: { hostelName?: string; hostelId?: string },
    dateRange?: { endFrom?: string; endTo?: string },
    sort?: { field: string; dir: 'asc' | 'desc' },
  ): Observable<ContractsPage> {
    const params: Record<string, string | number> = {
      page,
      limit: CONTRACTS_PAGE_SIZE,
    };
    if (filter !== 'all') params['f[status.slug]'] = filter;
    // Sort by an API property — `sort[price]` (Amount).
    if (sort) params[`sort[${sort.field}]`] = sort.dir;
    // Hostel search: full-text `s[hostel.name]` for the name, exact `f[hostel_id]` for the id.
    if (search?.hostelName) params['s[hostel.name]'] = search.hostelName;
    if (search?.hostelId) params['f[hostel_id]'] = search.hostelId;
    // End-date range (inclusive). Upper bound spans the whole "to" day so it isn't excluded.
    if (dateRange?.endFrom) params['f[end_date][gte]'] = dateRange.endFrom;
    if (dateRange?.endTo)
      params['f[end_date][lte]'] = `${dateRange.endTo}T23:59:59.999Z`;
    return this.api
      .get<AdminContractsResponse>('/api/admin/contracts', params)
      .pipe(
        map((res) => ({
          items: (res.contracts ?? []).map((c) => toContract(c)),
          total: res.pagination?.total_count ?? res.contracts?.length ?? 0,
          page: res.pagination?.current_page ?? page,
          pageSize: CONTRACTS_PAGE_SIZE,
          totalPages: res.pagination?.total_pages,
          aggs: res.aggs ?? [],
          statuses: res.possible_statuses ?? [],
        })),
      );
  }

  /** Full contract detail — `GET /api/admin/contracts/:id` (show, AMS ContractSerializer). */
  getContract(id: string | number): Observable<Contract> {
    return this.api
      .get<AdminContractResponse>(`/api/admin/contracts/${id}`)
      .pipe(
        map((res) => {
          const c = res.contract;
          if (!c) throw new Error(`Contract ${id} not found`);
          return toContract(c);
        }),
      );
  }

  /* -------------------------------------------------------------- listings (29) */

  /**
   * All-listings table — `GET /api/admin/hostels` (Searchkick-backed). Paginated server-side
   * (`page` + `limit`); the response carries a `pagination` envelope and optionally
   * `possible_statuses` for filter chips. Status filter → `f[status.slug]`; full-text name
   * search → `s[name]`; sort → `sort[created_at]` / `sort[starting_price]`.
   */
  listings(
    filter: AdminListingFilter = 'all',
    page = 1,
    search?: { name?: string; id?: string },
    sort?: { field: string; dir: 'asc' | 'desc' },
    dispositionSlug?: string | null,
  ): Observable<AdminListingsPage> {
    const params: Record<string, string | number> = {
      page,
      limit: LISTINGS_PAGE_SIZE,
    };
    if (dispositionSlug) {
      params['f[disposition.slug]'] = dispositionSlug;
    } else if (filter !== 'all') {
      params['f[status.slug]'] = filter;
    }
    if (search?.name) params['s[name]'] = search.name;
    if (search?.id) params['f[id]'] = search.id;
    if (sort) params[`sort[${sort.field}]`] = sort.dir;
    return this.api
      .get<AdminHostelsResponse>('/api/admin/hostels', params)
      .pipe(
        map((res) => ({
          items: (res.hostels ?? []).map(toAdminListing),
          total: res.pagination?.total_count ?? res.hostels?.length ?? 0,
          page: res.pagination?.current_page ?? page,
          pageSize: LISTINGS_PAGE_SIZE,
          totalPages: res.pagination?.total_pages,
          aggs: res.aggs ?? [],
          statuses: res.possible_statuses ?? [],
        })),
      );
  }

  /* -------------------------------------------------------------- payments (28) */

  /**
   * Subscription payments — `GET /api/admin/payments` (Searchkick-backed). Paginated server-side
   * (`page` + `limit`); the response carries a `pagination` envelope plus per-status `aggs` (stat
   * cards) and `possible_statuses` (filter tabs). A status filter is pushed as `f[status.slug]`,
   * the hostel search as `s[hostel.name]` / `f[hostel_id]`, and the created-date range as
   * `f[created_at][gte]` / `f[created_at][lte]`. The `authInterceptor` attaches the admin token.
   */
  payments(
    filter: PaymentFilter = 'all',
    page = 1,
    sort?: { field: string; dir: 'asc' | 'desc' },
    search?: { hostelName?: string; hostelId?: string },
    dateRange?: { createdFrom?: string; createdTo?: string },
  ): Observable<PaymentsPage> {
    const params: Record<string, string | number> = {
      page,
      limit: PAYMENTS_PAGE_SIZE,
    };
    if (filter !== 'all') params['f[status.slug]'] = filter;
    // Sort by an API property — `sort[amount]`, `sort[created_at]`, `sort[paid_at]`.
    if (sort) params[`sort[${sort.field}]`] = sort.dir;
    // Hostel search: full-text `s[hostel.name]` for the name, exact `f[hostel_id]` for the id.
    if (search?.hostelName) params['s[hostel.name]'] = search.hostelName;
    if (search?.hostelId) params['f[hostel_id]'] = search.hostelId;
    // Created-date range (inclusive). Upper bound spans the whole "to" day so it isn't excluded.
    if (dateRange?.createdFrom)
      params['f[created_at][gte]'] = dateRange.createdFrom;
    if (dateRange?.createdTo)
      params['f[created_at][lte]'] = `${dateRange.createdTo}T23:59:59.999Z`;
    return this.api
      .get<AdminPaymentsResponse>('/api/admin/payments', params)
      .pipe(
        map((res) => ({
          items: (res.payments ?? []).map(toPayment),
          total: res.pagination?.total_count ?? res.payments?.length ?? 0,
          page: res.pagination?.current_page ?? page,
          pageSize: PAYMENTS_PAGE_SIZE,
          totalPages: res.pagination?.total_pages,
          aggs: res.aggs ?? [],
          statuses: res.possible_statuses ?? [],
        })),
      );
  }
}

/** A payment record from `GET /api/admin/payments` (ES `search_data`). */
interface ApiPayment {
  id: number | string;
  amount?: number | null;
  transaction_id?: string | null;
  hostel_id?: number | string | null;
  payment_method?: string | null;
  currency?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
  host?: { id?: number | string; name?: string } | null;
  hostel?: { id?: number | string; name?: string } | null;
  status?: { id?: number | string; slug?: string; name?: string } | null;
  disposition?: { slug?: string; name?: string } | null;
  product?: {
    id?: number | string;
    name?: string;
    product_type?: string;
    price?: number;
    currency?: string;
    duration?: number;
  } | null;
  contract?: {
    id?: number | string;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
}

/** `GET /api/admin/payments` → `{ success, payments, aggs, possible_statuses, pagination }`. */
interface AdminPaymentsResponse {
  success?: boolean;
  payments?: ApiPayment[];
  aggs?: PaymentAgg[];
  possible_statuses?: PaymentStatusOption[];
  pagination?: {
    current_page?: number;
    next_page?: number | null;
    prev_page?: number | null;
    total_pages?: number;
    total_count?: number;
  };
}

const PAYMENT_STATES: readonly PaymentState[] = [
  'paid',
  'pending',
  'failed',
  'refunded',
];
const PAYMENTS_PAGE_SIZE = 10;

/** Map a backend payment onto the FE `Payment` model. The status stays a dynamic slug (+ its
 *  display name); product type/name + host + hostel ids power the payment detail drawer. */
function toPayment(p: ApiPayment): Payment {
  return {
    id: String(p.id),
    amount: p.amount ?? 0,
    currency: p.currency ?? 'PKR',
    method: p.payment_method ?? '',
    transactionId: p.transaction_id ?? null,
    host: p.host?.name ?? '—',
    hostId: p.host?.id ?? undefined,
    hostelId: p.hostel_id ?? p.hostel?.id ?? undefined,
    hostelName: p.hostel?.name ?? null,
    plan: p.product?.name ?? null,
    productType: p.product?.product_type ?? null,
    productDuration: p.product?.duration ?? null,
    status: p.status?.slug ?? 'pending',
    statusName: p.status?.name ?? 'Pending',
    contractId: p.contract?.id != null ? String(p.contract.id) : null,
    term: termLabel(p.contract?.start_date, p.contract?.end_date),
    createdAt: p.created_at ?? null,
    paidAt: p.paid_at ?? null,
  };
}

/** A role record from `GET /api/admin/roles` (the fields the endpoint returns). */
interface ApiAdminRole {
  id?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  is_data_restricted?: boolean;
  created_at?: string;
  _score?: number | null;
}

/** `GET /api/admin/roles` → `{ success: boolean; roles: ApiAdminRole[] }`. */
interface AdminRolesResponse {
  success?: boolean;
  roles?: ApiAdminRole[];
}

function extractRoles(
  res: AdminRolesResponse | ApiAdminRole[] | null | undefined,
): ApiAdminRole[] {
  if (Array.isArray(res)) return res; // tolerate a bare array
  return res?.roles ?? [];
}

/** A permission entry inside `GET /api/admin/roles/:id` → `role.permissions[]`. */
interface RoleDetailPermission {
  id: number | string;
  action: string;
  subject_class: string;
  permission_group: string;
  parent_permission_id?: number | null;
}
/** `GET /api/admin/roles/:id` → `{ success, role: { …, permissions: [] } }`. */
interface RoleDetailResponse {
  success?: boolean;
  role?: {
    id?: string;
    name?: string;
    slug?: string;
    permissions?: RoleDetailPermission[];
  };
}

/** Map a role's assigned permissions to matrix flag keys (`<group>.<Subject>.<action>`). */
function rolePermissionFlags(
  res: RoleDetailResponse | null | undefined,
): PermissionFlag[] {
  return (res?.role?.permissions ?? []).map(
    (p) => `${p.permission_group}.${p.subject_class}.${p.action}`,
  );
}

/** Map a backend role (from the list) onto the FE `RoleDef`. Permissions load lazily on select. */
function toRoleDef(r: ApiAdminRole): RoleDef {
  const slug = String(r.slug ?? r.id ?? '').toLowerCase();
  return {
    id: slug || String(r.id ?? 'role'),
    apiId: r.id, // backend hashid — for the lazy GET /api/admin/roles/:id permission fetch
    name: titleCase(r.name ?? slug),
    scope: slug, // fallback subtitle used when there's no created_at (e.g. custom roles)
    kind: 'system', // no system/custom flag in the payload — treat backend roles as system
    description: r.description ?? '',
    assigned: '', // no assigned-users count in the payload
    flags: [], // loaded lazily on selection via roleFlags()
    createdAt: r.created_at ?? null,
    dataRestricted: !!r.is_data_restricted,
    apiName: r.name ?? slug, // original name — sent as a plain attribute on PUT /api/admin/roles/:id
  };
}

/** "care-taker" / "care taker" → "Care Taker". */
function titleCase(s: string): string {
  return s
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* --------------------------------------------------- permissions (grouped) */

/** A permission record from `GET /api/admin/permissions/grouped`. */
interface ApiPermission {
  id: number;
  name: string;
  subject_class: string;
  action: string;
  parent_permission_id: number | null;
  is_external?: boolean;
  permission_group?: string;
}
/** Each subject-class node nests an umbrella `parent` ("manage") + granular `children`. */
interface ApiPermissionNode {
  parent: ApiPermission;
  children?: ApiPermission[];
}
/** `{ grouped_permissions: { <group>: { <SubjectClass>: ApiPermissionNode } } }`. */
interface GroupedPermissionsResponse {
  grouped_permissions?: Record<string, Record<string, ApiPermissionNode>>;
}

/** Tabler icon per subject class (matrix section icon); a neutral dot as the fallback. */
const SUBJECT_ICONS: Record<string, string> = {
  Attachment: 'ti-paperclip',
  User: 'ti-user',
  Tenant: 'ti-user-circle',
  Hostel: 'ti-building',
  Product: 'ti-package',
  OfferCategory: 'ti-tag',
  AuthenticationToken: 'ti-key',
  Role: 'ti-shield-lock',
  Permission: 'ti-lock-check',
  Contract: 'ti-file-text',
  Payment: 'ti-credit-card',
  Room: 'ti-door',
  Renter: 'ti-users',
};

/** Flatten `grouped_permissions` into matrix sections — one per (group, subject class). */
function toPermissionGroups(
  res: GroupedPermissionsResponse | null | undefined,
): PermissionGroup[] {
  const gp = res?.grouped_permissions;
  if (!gp) return [];
  const out: PermissionGroup[] = [];
  for (const [group, subjects] of Object.entries(gp)) {
    for (const [subject, node] of Object.entries(subjects ?? {})) {
      const perms = [node?.parent, ...(node?.children ?? [])].filter(
        (p): p is ApiPermission => !!p,
      );
      if (!perms.length) continue;
      out.push({
        key: `${group}:${subject}`,
        label: `${titleCase(group)} · ${titleCase(subject)}`,
        icon: SUBJECT_ICONS[subject] ?? 'ti-point',
        // Unique + readable flag key: `<group>.<SubjectClass>.<action>`. The umbrella
        // "manage" permission (no parent_permission_id) is flagged so the matrix cascades it.
        flags: perms.map((p) => ({
          flag: `${group}.${p.subject_class}.${p.action}`,
          label: p.name,
          parent: p.parent_permission_id == null,
          permissionId: p.id,
        })),
      });
    }
  }
  return out;
}

/* ----------------------------------------------------- contracts (admin API) */

/** Shared nested ref in the contract payloads (status / disposition). */
interface ApiContractRef {
  id?: string | number;
  name?: string;
  slug?: string | null;
}

/** Embedded product in a contract payload. */
interface ApiContractProduct {
  id?: string | number;
  name?: string | null;
  product_type?: string | null;
  price?: number | null;
  currency?: string | null;
  duration?: number | null;
}

/**
 * Embedded payment in a contract payload — now present on the list too, not just the detail.
 * The status slug is nested under `status.name.slug` (the serializer puts the whole status object
 * in `status.name`); some payloads expose it directly as `status.slug`, so we tolerate both.
 */
interface ApiContractPayment {
  id?: string | number;
  payment_method?: string | null;
  amount?: number | string | null;
  paid_at?: string | null;
  status?: {
    id?: number;
    slug?: string | null;
    name?: { slug?: string | null } | string | null;
  } | null;
}

/** ES `_source` item from `GET /api/admin/contracts` (ContractIndex search_data). */
interface ApiContractListItem {
  id: string | number;
  hostel_id?: string | number | null;
  contract_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  price?: number | string | null;
  created_at?: string | null;
  host?: { id?: string | number; name?: string } | null;
  hostel?: { id?: string | number; name?: string } | null;
  status?: ApiContractRef | null;
  disposition?: ApiContractRef | null;
  product?: ApiContractProduct | null;
  payment?: ApiContractPayment | null;
  _score?: number | null;
}

/** AMS `ContractSerializer` item from `GET /api/admin/contracts/:id` (adds `updated_at`). */
interface ApiContractDetail extends ApiContractListItem {
  updated_at?: string | null;
}

interface AdminContractsResponse {
  success?: boolean;
  contracts?: ApiContractListItem[];
  aggs?: ContractAgg[];
  possible_statuses?: ContractStatusOption[];
  pagination?: {
    current_page?: number;
    next_page?: number | null;
    prev_page?: number | null;
    total_pages?: number;
    total_count?: number;
  };
}
interface AdminContractResponse {
  success?: boolean;
  contract?: ApiContractDetail;
}

const CONTRACTS_PAGE_SIZE = 10;

/** Map a backend contract (list or detail) onto the FE `Contract`. Both shapes now carry a
 *  `payment` object, so the payment state comes from the real record (see `paymentState`). */
function toContract(c: ApiContractListItem): Contract {
  return {
    id: contractRef(c.id, c.created_at),
    contractId: c.id,
    host: c.host?.name ?? '—',
    plan: planLabel(c.product, c.contract_type),
    term: termLabel(c.start_date, c.end_date),
    status: mapContractStatus(c.status?.slug),
    payment: paymentState(c),
    amount: Number(c.price ?? c.product?.price ?? 0),
    endsSoon: endsSoon(c.end_date),
    hostelId: c.hostel_id ?? c.hostel?.id ?? undefined,
    hostelName: c.hostel?.name ?? null,
    hostId: c.host?.id ?? undefined,
  };
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
/** True when the contract's end date is within the next 7 days (drives the red Term highlight). */
function endsSoon(endIso?: string | null): boolean {
  if (!endIso) return false;
  const end = new Date(endIso).getTime();
  if (Number.isNaN(end)) return false;
  const diff = end - Date.now();
  return diff >= 0 && diff < SEVEN_DAYS_MS;
}

/** Payment state — prefer the real payment record's status slug (now on the list); when it's
 *  absent or unrecognised, fall back to deriving it from the contract disposition. */
function paymentState(c: ApiContractListItem): PaymentState {
  const slug = paymentSlugOf(c.payment)?.toLowerCase();
  if (slug && (PAYMENT_STATES as readonly string[]).includes(slug))
    return slug as PaymentState;
  return derivePayment(c.disposition?.slug);
}

/** Extract a payment's status slug, tolerating the `status.name.slug` nesting (the serializer
 *  nests the whole status object under `name`) as well as a direct `status.slug`. */
function paymentSlugOf(p?: ApiContractPayment | null): string | undefined {
  const st = p?.status;
  if (!st) return undefined;
  if (st.slug) return st.slug;
  if (st.name && typeof st.name === 'object' && st.name.slug)
    return st.name.slug;
  return undefined;
}

/** Display ref — 'CT-2026-0016' for numeric ids (zero-padded), 'CT-2026-zhErLb' for hashids. */
function contractRef(id: string | number, createdAt?: string | null): string {
  let year: number;
  try { year = createdAt ? getYear(parseISO(createdAt)) : new Date().getFullYear(); }
  catch { year = new Date().getFullYear(); }
  const idStr = String(id);
  const tail = /^\d+$/.test(idStr) ? idStr.padStart(4, '0') : idStr;
  return `CT-${year}-${tail}`;
}

/** Plan label — the product name already encodes the cadence (e.g. 'Monthly'); falls back to
 *  the contract_type slug. (`product.duration` is in days, so it isn't used here.) */
function planLabel(
  product?: ApiContractProduct | null,
  contractType?: string | null,
): string {
  return product?.name || (contractType ? titleCase(contractType) : '—');
}

function fmtDay(iso?: string | null): string | null {
  if (!iso) return null;
  try { return format(parseISO(iso), "MMM d"); } catch { return null; }
}

/** ‘Jan 12 → Jan 12 ‘27’; null when either bound is missing (renders as ‘— pending —‘). */
function termLabel(start?: string | null, end?: string | null): string | null {
  const s = fmtDay(start);
  const e = fmtDay(end);
  if (!s || !e) return null;
  let endYr: string;
  try { endYr = format(parseISO(end as string), "yy"); } catch { return null; }
  return `${s} → ${e} ‘${endYr}`;
}

/** The view `ContractStatus` is just the backend status slug (draft / active / expired / …),
 *  matching `possible_statuses`. The "awaiting payment" nuance lives in the disposition (derivePayment). */
function mapContractStatus(statusSlug?: string | null): ContractStatus {
  return (statusSlug ?? 'draft').toLowerCase();
}

/** The list endpoint carries no payment object — derive the state from the contract's disposition. */
function derivePayment(dispositionSlug?: string | null): PaymentState {
  switch ((dispositionSlug ?? '').toLowerCase()) {
    case 'payment-confirmed':
    case 'completed':
      return 'paid';
    case 'full-refund':
    case 'partial-refund':
      return 'refunded';
    default:
      return 'pending'; // 'awaiting-payment' (draft) and anything unknown
  }
}

/* ------------------------------------------------- listings (admin hostels API) */

/** ES `_source` item from `GET /api/admin/hostels` (HostelIndex search_data). */
interface ApiAdminHostel {
  id: string | number;
  name?: string | null;
  gender_type?: string | null;
  property_type?: string | null;
  city?: string | null;
  state?: string | null;
  area?: string | null;
  starting_price?: number | null;
  created_at?: string | null;
  host?: { id?: string | number; name?: string } | null;
  status?: { id?: number; slug?: string; name?: string } | null;
  disposition?: {
    id?: number;
    slug?: string;
    name?: string;
    status?: { slug?: string } | null;
  } | null;
  attachments?: {
    url?: string | null;
    is_primary?: boolean;
    variants?: Record<string, string> | null;
  }[] | null;
  _score?: number | null;
}

/** `GET /api/admin/hostels` → `{ success, hostels, aggs, possible_statuses, pagination }`. */
interface AdminHostelsResponse {
  success?: boolean;
  hostels?: ApiAdminHostel[];
  aggs?: AdminListingAgg[];
  possible_statuses?: AdminListingStatusOption[];
  pagination?: {
    current_page?: number;
    next_page?: number | null;
    prev_page?: number | null;
    total_pages?: number;
    total_count?: number;
  };
}

const LISTINGS_PAGE_SIZE = 15;

function toAdminListing(h: ApiAdminHostel): AdminListing {
  return {
    id: h.id,
    name: h.name ?? '—',
    genderType: h.gender_type ?? '',
    propertyType: h.property_type ?? '',
    city: h.city ?? '',
    state: h.state ?? '',
    area: h.area ?? '',
    host: h.host?.name ?? '—',
    hostId: h.host?.id ?? null,
    statusSlug: h.status?.slug ?? '',
    statusName: h.status?.name ?? '',
    dispositionSlug: h.disposition?.slug ?? null,
    dispositionName: h.disposition?.name ?? null,
    createdAt: h.created_at ?? null,
    thumbUrl: resolveThumb(h.attachments),
    startingPrice: h.starting_price ?? null,
  };
}

/** First available thumbnail URL — primary attachment preferred, then first, then variant. */
function resolveThumb(
  attachments?: ApiAdminHostel['attachments'],
): string | null {
  if (!attachments?.length) return null;
  const a = attachments.find((x) => x.is_primary) ?? attachments[0];
  if (a.url) return a.url;
  if (a.variants) {
    const v =
      a.variants['thumb'] ??
      a.variants['small'] ??
      a.variants['medium'] ??
      Object.values(a.variants).find(Boolean);
    if (v) return v;
  }
  return null;
}
