/** The eight HostelHive roles (PRD v3, Features 6 & 8). */
export type Role =
  | 'super-admin'
  | 'admin'
  | 'support'
  | 'moderator'
  | 'host'
  | 'manager'
  | 'warden'
  | 'seeker';

export const ROLES: readonly Role[] = [
  'super-admin',
  'admin',
  'support',
  'moderator',
  'host',
  'manager',
  'warden',
  'seeker',
] as const;

/** Internal staff area (`/admin/**`) — Moderator folds into the Super Admin panel (F6). */
export const STAFF_ROLES: readonly Role[] = [
  'super-admin',
  'admin',
  'support',
  'moderator',
] as const;

/** Host surface — full host plus the single-property sub-users (F8). */
export const HOST_ROLES: readonly Role[] = [
  'host',
  'manager',
  'warden',
] as const;

/** Roles scoped to exactly one `property_id` (server-enforced; FE guards mirror). */
export const PROPERTY_SCOPED_ROLES: readonly Role[] = [
  'manager',
  'warden',
] as const;

/**
 * Granular permission flag, e.g. `contracts.view`, `payments.refund`, `roles.manage`.
 * The authoritative list + role→flag mapping is confirmed under Q-API/F6 (§0).
 */
export type Permission = string;

/** Known flags referenced by the FE today (extend as the contract lands). */
export const PERMISSIONS = {
  contractsView: 'contracts.view',
  contractsManage: 'contracts.manage',
  paymentsView: 'payments.view',
  paymentsRefund: 'payments.refund',
  rolesManage: 'roles.manage',
  listingsModerate: 'listings.moderate',
  teamManage: 'team.manage',
} as const satisfies Record<string, Permission>;
