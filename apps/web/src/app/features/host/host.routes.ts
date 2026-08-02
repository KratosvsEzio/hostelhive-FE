import { inject } from '@angular/core';
import { Route } from '@angular/router';

import { HostLayout } from '@layout/host-shell/host-shell';

import { Rooms } from './rooms/rooms';
import { HostMore } from './more/more';
import { HostTeam } from './team/team';
import { Tenants } from './tenants/tenants';
import { MessList } from './mess/mess-list';
import { Invoices } from './invoices/invoices';
import { AddGrocery } from './mess/add-grocery';
import { ExpensesList } from './expenses/expenses-list';
import { ExpenseDetailPage } from './expenses/expense-detail';
import { MessConfirmations } from './mess/mess-confirmations';
import { MessNotifications } from './mess/mess-notifications';
import { Analytics } from './analytics/analytics';
import { Utilities } from './utilities/utilities';
import { HostOverview } from './overview/overview';
import { NewHostel } from './new-hostel/new-hostel';
import { AddBill } from './utilities/add-bill/add-bill';
import { RoomDetail } from './rooms/room-detail/room-detail';
import { HostelProfile } from './hostel-profile/hostel-profile';
import { TenantProfile } from './tenants/tenant-profile/tenant-profile';
import { RevenueDetail } from './overview/revenue-detail/revenue-detail';
import { MovementDetail } from './overview/movement-detail/movement-detail';
import { OccupancyDetail } from './overview/occupancy-detail/occupancy-detail';

import { HostPropertyStore } from '@services';

import { SUBSCRIPTION_ROUTES } from './subscription/subscription.routes';

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
      { path: 'profile', component: HostelProfile, title: 'Hostel profile — HostelHive' },
      // Mobile-app "More" tab (bottom tab bar) — the destinations that don't fit in the tabs.
      { path: 'more', component: HostMore, title: 'More — HostelHive' },
      { path: 'team', component: HostTeam, title: 'Team & staff — HostelHive' },
      {
        path: 'rooms',
        children: [
          { path: '', pathMatch: 'full', component: Rooms, title: 'Rooms — HostelHive' },
          { path: ':roomId', component: RoomDetail, title: 'Room details — HostelHive' },
        ],
      },
      {
        path: 'tenants',
        children: [
          { path: '', pathMatch: 'full', component: Tenants, title: 'Tenants — HostelHive' },
          { path: 'create', component: Tenants, title: 'Check in tenant — HostelHive' },
          { path: 'edit/:tenantId', component: Tenants, title: 'Edit tenant — HostelHive' },
          { path: 'profile/:tenantId', component: TenantProfile, title: 'Tenant Profile — HostelHive' },
        ],
      },
      {
        path: 'utilities',
        children: [
          { path: '', pathMatch: 'full', component: Utilities, title: 'Utilities — HostelHive' },
          { path: 'add', component: AddBill, title: 'Add utility bill — HostelHive' },
          { path: 'edit/:billId', component: AddBill, title: 'Edit utility bill — HostelHive' },
        ],
      },
      { path: 'invoices', component: Invoices, title: 'Invoices — HostelHive' },
      {
        path: 'expenses',
        children: [
          { path: '', pathMatch: 'full', component: ExpensesList, title: 'Expenses — HostelHive' },
          { path: 'new', component: AddGrocery, title: 'New expense — HostelHive' },
          { path: ':expenseId', component: ExpenseDetailPage, title: 'Expense — HostelHive' },
          { path: ':expenseId/edit', component: AddGrocery, title: 'Edit expense — HostelHive' },
        ],
      },
      { path: 'analytics', component: Analytics, title: 'Analytics — HostelHive' },
      {
        path: 'mess',
        children: [
          { path: '', pathMatch: 'full', component: MessList, title: 'Mess — HostelHive' },
          { path: 'add', component: AddGrocery, title: 'Add grocery — HostelHive' },
          { path: 'confirmations', component: MessConfirmations, title: 'Meal confirmations — HostelHive' },
          { path: 'notifications', component: MessNotifications, title: 'Meal notifications — HostelHive' },
        ],
      },
      {
        path: 'overview',
        children: [
          { path: '', pathMatch: 'full', component: HostOverview, title: 'Host · Overview' },
          { path: 'revenue',   component: RevenueDetail,   title: 'Revenue detail — HostelHive' },
          { path: 'movement',  component: MovementDetail,  title: 'Tenant movement — HostelHive' },
          { path: 'occupancy', component: OccupancyDetail, title: 'Occupancy trend — HostelHive' },
        ],
      },
      { path: 'subscription', children: SUBSCRIPTION_ROUTES },
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
    ],
  },
];
