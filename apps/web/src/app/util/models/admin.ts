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

/** A collapsible group of related flags in the matrix (Payments, Listings, …). */
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
