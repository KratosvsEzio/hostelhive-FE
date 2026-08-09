import { Route } from '@angular/router';
import { LeadWall } from './lead-wall/lead-wall';
import { ForgotPassword } from './forgot-password/forgot-password';

export const AUTH_ROUTES: Route[] = [
  { path: '', component: LeadWall, title: 'Log in or sign up — HostelHive' },
  { path: 'forgot-password', component: ForgotPassword, title: 'Reset password — HostelHive' },
];
