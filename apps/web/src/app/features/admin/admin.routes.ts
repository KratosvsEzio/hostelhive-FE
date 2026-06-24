import { Route } from '@angular/router';
import { StaffLayout } from '@layout/staff-shell/staff-shell';
import { AdminRoles } from '@features/admin/admin-roles/admin-roles';
import { AdminContracts } from '@features/admin/admin-contracts/admin-contracts';
import { AdminPayments } from '@features/admin/admin-payments/admin-payments';
import { AdminListings } from '@features/admin/admin-listings/admin-listings';

export const ADMIN_ROUTES: Route[] = [
  {
    path: '',
    component: StaffLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'contracts' },
      { path: 'roles', component: AdminRoles, title: 'Roles & permissions — HostelHive Admin' },
      { path: 'contracts', component: AdminContracts, title: 'Contracts — HostelHive Admin' },
      { path: 'payments', component: AdminPayments, title: 'Payments — HostelHive Admin' },
      { path: 'listings', component: AdminListings, title: 'All listings — HostelHive Admin' },
    ],
  },
];
