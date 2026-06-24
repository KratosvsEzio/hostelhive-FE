// Stub fixtures for the Super-Admin console. The permission-matrix fixture is the fallback
// layout for `permissionsGrouped()`; roles + contracts + payments are all live now.
import { PermissionGroup, RoleDef } from '@hostelhive/data-access';

/** Matrix layout — sections + flags, verbatim from design-mockups/26-admin-roles.html. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'contracts',
    label: 'Contracts',
    icon: 'ti-file-dollar',
    flags: [
      { flag: 'contracts.view', label: 'View contracts & payment history' },
      { flag: 'contracts.edit', label: 'Cancel / extend contracts' },
    ],
  },
  {
    key: 'payments',
    label: 'Payments',
    icon: 'ti-credit-card',
    flags: [
      { flag: 'payments.view', label: 'View payment transactions' },
      { flag: 'payments.manage', label: 'Mark payments paid (offline)' },
      { flag: 'payments.refund', label: 'Issue refunds' },
    ],
  },
  {
    key: 'listings',
    label: 'Listings & moderation',
    icon: 'ti-checkup-list',
    flags: [
      { flag: 'listings.approve', label: 'Approve / request changes' },
      { flag: 'listings.delete', label: 'Remove / reject listings' },
    ],
  },
  {
    key: 'users',
    label: 'Users & roles',
    icon: 'ti-users-group',
    flags: [
      { flag: 'users.manage', label: 'Manage user accounts' },
      { flag: 'roles.manage', label: 'Create / edit roles & permissions' },
    ],
  },
];

/** The 8 system roles + one seeded custom role (Finance Reviewer). */
export const ROLES: RoleDef[] = [
  {
    id: 'super-admin',
    name: 'Super Admin',
    scope: 'Platform-wide',
    kind: 'system',
    description:
      'Full, unrestricted access to every module — including role management itself.',
    assigned: '2 users assigned',
    flags: 'all',
  },
  {
    id: 'admin',
    name: 'Admin',
    scope: 'Platform-wide · configurable',
    kind: 'system',
    description:
      'Elevated access to contracts, payments & moderation; role management restricted unless explicitly granted.',
    assigned: '5 users assigned',
    flags: [
      'contracts.view',
      'contracts.edit',
      'payments.view',
      'payments.manage',
      'payments.refund',
      'listings.approve',
      'listings.delete',
      'users.manage',
    ],
  },
  {
    id: 'moderator',
    name: 'Moderator',
    scope: 'Listings only',
    kind: 'system',
    description:
      'Access limited to the Review Queue and Delta Media inspection pipeline.',
    assigned: '8 users assigned',
    flags: ['listings.approve', 'listings.delete'],
  },
  {
    id: 'support',
    name: 'Support Staff',
    scope: 'Read-only + tickets',
    kind: 'system',
    description:
      'Read-only access to contracts and user records to assist with support queries.',
    assigned: '6 users assigned',
    flags: ['contracts.view', 'payments.view'],
  },
  {
    id: 'host',
    name: 'Host',
    scope: 'Own properties',
    kind: 'system',
    description: 'Standard property-owner access (Features 2, 4, 5).',
    assigned: '1,482 users',
    flags: [],
  },
  {
    id: 'manager',
    name: 'Manager',
    scope: 'Single hostel',
    kind: 'system',
    description:
      'Operates one assigned hostel on behalf of a host (Feature 8).',
    assigned: '214 users',
    flags: [],
  },
  {
    id: 'warden',
    name: 'Warden',
    scope: 'Single hostel',
    kind: 'system',
    description:
      'Operates one assigned hostel on behalf of a host (Feature 8).',
    assigned: '186 users',
    flags: [],
  },
  {
    id: 'seeker',
    name: 'Seeker',
    scope: 'Self / public',
    kind: 'system',
    description: 'Standard authenticated platform user (Feature 1).',
    assigned: '38k users',
    flags: [],
  },
  {
    id: 'finance',
    name: 'Finance Reviewer',
    scope: 'Custom role',
    kind: 'custom',
    description: 'Finance oversight — view contracts & payments only.',
    assigned: '1 user',
    flags: ['contracts.view', 'payments.view'],
  },
];
