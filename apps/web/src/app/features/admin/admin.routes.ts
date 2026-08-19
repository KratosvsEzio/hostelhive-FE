import { Route } from '@angular/router';
import { permissionGuard } from '@core/auth';
import { StaffLayout } from '@layout/staff-shell/staff-shell';
import { AdminRoles } from '@features/admin/admin-roles/admin-roles';
import { AdminContracts } from '@features/admin/admin-contracts/admin-contracts';
import { AdminPayments } from '@features/admin/admin-payments/admin-payments';
import { AdminListings } from '@features/admin/admin-listings/admin-listings';
import { Queue } from '@features/moderator/queue/queue';
import { Review } from '@features/moderator/review/review';

export const ADMIN_ROUTES: Route[] = [
  {
    path: '',
    component: StaffLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'contracts' },
      { path: 'roles', component: AdminRoles, title: 'Roles & permissions — HostelHive Admin', canActivate: [permissionGuard('admin:Role:index')] },
      { path: 'contracts', component: AdminContracts, title: 'Contracts — HostelHive Admin', canActivate: [permissionGuard('admin:Contract:index')] },
      { path: 'payments', component: AdminPayments, title: 'Payments — HostelHive Admin', canActivate: [permissionGuard('admin:Payment:index')] },
      { path: 'listings', component: AdminListings, title: 'All listings — HostelHive Admin', canActivate: [permissionGuard('admin:Hostel:index')] },
      { path: 'queue', component: Queue, title: 'Review queue — HostelHive Admin', canActivate: [permissionGuard('moderator:Hostel:index')] },
      { path: 'review/:id', component: Review, title: 'Listing review — HostelHive Admin' },
    ],
  },
];
