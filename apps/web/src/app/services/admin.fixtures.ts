// Stub fixture for the Super-Admin console: the permission-matrix fallback layout for
// `permissionsGrouped()`, used when the live catalog is unavailable.
import { PermissionGroup } from '@hostelhive/data-access';

/** Matrix layout — sections + flags, from design-mockups/26-admin-roles.html (Contracts retired). */
export const PERMISSION_GROUPS: PermissionGroup[] = [
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
