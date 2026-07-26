import { Route } from '@angular/router';
import { LeadWall } from './lead-wall/lead-wall';

export const AUTH_ROUTES: Route[] = [
  { path: '', component: LeadWall, title: 'Log in or sign up — HostelHive' },
];
