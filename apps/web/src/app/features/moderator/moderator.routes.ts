import { Route } from '@angular/router';
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
      { path: 'queue', component: Queue, title: 'Review queue — HostelHive' },
      { path: 'review/:id', component: Review, title: 'Listing review — HostelHive' },
      { path: 'media', component: Media, title: 'Media queue — HostelHive' },
      { path: 'audit', component: Audit, title: 'Audit log — HostelHive' },
    ],
  },
];
