import { Route } from '@angular/router';
import { permissionGuard } from '@core/auth';
import { StaffLayout } from '@layout/staff-shell/staff-shell';
import { AdminRoles } from '@features/admin/admin-roles/admin-roles';
import { AdminPayments } from '@features/admin/admin-payments/admin-payments';
import { AdminListings } from '@features/admin/admin-listings/admin-listings';
import { Queue } from '@features/moderator/queue/queue';
import { Review } from '@features/moderator/review/review';

export const ADMIN_ROUTES: Route[] = [
  {
    path: '',
    component: StaffLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'payments' },
      { path: 'roles', component: AdminRoles, title: 'adminAdminRoles.rolesPermissions', canActivate: [permissionGuard('admin:Role:index')] },
      { path: 'payments', component: AdminPayments, title: 'adminAdminPayments.payments', canActivate: [permissionGuard('admin:Payment:index')] },
      { path: 'listings', component: AdminListings, title: 'adminAdminListings.allListings', canActivate: [permissionGuard('admin:Hostel:index')] },
      { path: 'queue', component: Queue, title: 'moderatorQueue.reviewQueue', canActivate: [permissionGuard('moderator:Hostel:index')] },
      { path: 'review/:id', component: Review, title: 'routeTitle.listingReview' },
    ],
  },
];
