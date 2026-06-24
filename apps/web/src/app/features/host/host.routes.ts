import { inject } from '@angular/core';
import { Route } from '@angular/router';
import { HostLayout } from '@layout/host-shell/host-shell';
import { HostOverview } from './overview/overview';
import { HostelProfile } from './hostel-profile/hostel-profile';
import { HostSettings } from './settings/settings';
import { HostTeam } from './team/team';
import { Rooms } from './rooms/rooms';
import { Tenants } from './tenants/tenants';
import { TenantProfile } from './tenants/tenant-profile/tenant-profile';
import { Utilities } from './utilities/utilities';
import { AddBill } from './utilities/add-bill/add-bill';
import { Invoices } from './invoices/invoices';
import { Analytics } from './analytics/analytics';
import { RevenueDetail } from './overview/revenue-detail/revenue-detail';
import { MovementDetail } from './overview/movement-detail/movement-detail';
import { OccupancyDetail } from './overview/occupancy-detail/occupancy-detail';
import { NewHostel } from './new-hostel/new-hostel';
import { SUBSCRIPTION_ROUTES } from './subscription/subscription.routes';
import { HostPropertyStore } from '@services';

export const HOST_ROUTES: Route[] = [
  { path: 'hostels/new', component: NewHostel, title: 'New hostel — HostelHive' },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: () => {
      const id = inject(HostPropertyStore).selected();
      return id ? `/host/${id}` : '/host/hostels/new';
    },
  },
  {
    path: ':hostelId',
    component: HostLayout,
    children: [
      { path: '',          pathMatch: 'full', component: HostOverview,  title: 'Host · Overview' },
      { path: 'profile',   component: HostelProfile, title: 'Hostel profile — HostelHive' },
      { path: 'settings',  component: HostSettings,  title: 'Settings — HostelHive' },
      { path: 'team',      component: HostTeam,      title: 'Team & staff — HostelHive' },
      { path: 'rooms',     component: Rooms,         title: 'Rooms — HostelHive' },
      {
        path: 'tenants',
        children: [
          { path: '', pathMatch: 'full', component: Tenants,     title: 'Tenants — HostelHive' },
          { path: 'create',            component: Tenants,       title: 'Check in tenant — HostelHive' },
          { path: 'edit/:tenantId',    component: Tenants,       title: 'Edit tenant — HostelHive' },
          { path: 'profile/:tenantId', component: TenantProfile, title: 'Tenant Profile — HostelHive' },
        ],
      },
      {
        path: 'utilities',
        children: [
          { path: '',    pathMatch: 'full', component: Utilities, title: 'Utilities — HostelHive' },
          { path: 'add', component: AddBill, title: 'Add utility bill — HostelHive' },
        ],
      },
      { path: 'invoices',  component: Invoices,      title: 'Invoices — HostelHive' },
      { path: 'analytics', component: Analytics,     title: 'Analytics — HostelHive' },
      { path: 'revenue',   component: RevenueDetail,  title: 'Revenue detail — HostelHive' },
      { path: 'movement',  component: MovementDetail, title: 'Tenant movement — HostelHive' },
      { path: 'occupancy', component: OccupancyDetail, title: 'Occupancy trend — HostelHive' },
      { path: 'subscription', children: SUBSCRIPTION_ROUTES },
    ],
  },
];
