import { Route } from '@angular/router';
import { permissionGuard } from '@core/auth';
import { StaffLayout } from '@layout/staff-shell/staff-shell';
import { Queue } from '@features/moderator/queue/queue';
import { Review } from '@features/moderator/review/review';
import { Media } from '@features/moderator/media/media';
import { Audit } from '@features/moderator/audit/audit';

export const MODERATOR_ROUTES: Route[] = [
  {
    path: '',
    component: StaffLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'queue' },
      { path: 'queue', component: Queue, title: 'moderatorQueue.reviewQueue', canActivate: [permissionGuard('moderator:Hostel:index')] },
      { path: 'review/:id', component: Review, title: 'routeTitle.listingReview' },
      { path: 'media', component: Media, title: 'moderatorMedia.mediaQueue', canActivate: [permissionGuard('moderator:Attachment:index')] },
      { path: 'audit', component: Audit, title: 'moderatorAudit.auditLog' },
    ],
  },
];
