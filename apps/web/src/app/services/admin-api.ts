import { ApiPagination, toPageInfo } from '@util/pagination';
import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { ApiClient } from '@core/api-resource';
import {
  AdminListing,
  AdminListingAgg,
  AdminListingFilter,
  AdminListingStatusOption,
  AdminListingsPage,
  PermissionFlag,
  PermissionGroup,
  RoleDef,
} from '@hostelhive/data-access';
import { primaryFirst } from '@util/primary-photo';
import { usableVariant } from '@util/attachment-url';
import { PERMISSION_GROUPS } from './admin.fixtures';

/**
 * Super-Admin (Feature 6) API — all live: `roles()` + `permissionsGrouped()` and `listings()`.
 * Billing lives in `AdminBillingApi`.
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
    context?: HttpContext,
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
      .get<AdminHostelsResponse>('/api/admin/hostels', params, context)
      .pipe(
        map((res) => {
          const rows = res.hostels ?? [];
          const info = toPageInfo(res.pagination, page, rows.length);
          return {
            items: rows.map(toAdminListing),
            total: info.total,
            page: info.page,
            pageSize: LISTINGS_PAGE_SIZE,
            totalPages: info.totalPages,
            aggs: res.aggs ?? [],
            statuses: res.possible_statuses ?? [],
          };
        }),
      );
  }
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
  pagination?: ApiPagination;
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
  const a = primaryFirst(attachments)[0];
  if (a.url) return a.url;
  // The backend's variant addresses are malformed — see `usableVariant`. A sibling's `url` is
  // the reference for what a well-formed one looks like on this payload.
  return usableVariant(a.variants, attachments.find((x) => x.url)?.url);
}
