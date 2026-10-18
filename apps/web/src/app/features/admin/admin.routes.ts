import { Route } from '@angular/router';
import { permissionGuard, roleGuard } from '@core/auth';
import { StaffLayout } from '@layout/staff-shell/staff-shell';
import { AdminRoles } from '@features/admin/admin-roles/admin-roles';
import { AdminListings } from '@features/admin/admin-listings/admin-listings';
import { adminLanding } from '@features/admin/admin-landing';
import { ADMIN_BILLING_ROUTES } from '@features/admin/billing/admin-billing.routes';
import { Queue } from '@features/moderator/queue/queue';
import { Review } from '@features/moderator/review/review';

export const ADMIN_ROUTES: Route[] = [
  {
    path: '',
    component: StaffLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: adminLanding },
      { path: 'billing', canActivate: [roleGuard('admin')], children: ADMIN_BILLING_ROUTES },
      { path: 'payments', pathMatch: 'full', redirectTo: 'billing/payments' },
      { path: 'roles', component: AdminRoles, title: 'adminAdminRoles.rolesPermissions', canActivate: [permissionGuard('admin:Role:index')] },
      { path: 'listings', component: AdminListings, title: 'adminAdminListings.allListings', canActivate: [permissionGuard('admin:Hostel:index')] },
      { path: 'queue', component: Queue, title: 'moderatorQueue.reviewQueue', canActivate: [permissionGuard('moderator:Hostel:index')] },
      { path: 'review/:id', component: Review, title: 'routeTitle.listingReview' },
    ],
  },
];
