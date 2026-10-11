import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Route, Router, UrlTree } from '@angular/router';
import { filter, map, take } from 'rxjs';

import { HostLayout } from '@layout/host-shell/host-shell';

import { HostBookings } from './bookings/bookings';
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
import { SessionStore, permissionGuard } from '@core/auth';
import { NotificationService } from '@core/notification.service';

import { SUBSCRIPTION_ROUTES } from './subscription/subscription.routes';

/**
 * `/host` root: wait for the hostel list to load, then land on the selected hostel's dashboard —
 * or the create-hostel page only when the host genuinely has none. Reading the store synchronously
 * (as a plain redirectTo did) sent hosts with hostels to create-new before `load()` had resolved.
 */
const hostRootRedirect: CanActivateFn = () => {
  const store = inject(HostPropertyStore);
  const session = inject(SessionStore);
  const router = inject(Router);
  const notifications = inject(NotificationService);

  const target = (): UrlTree => {
    const props = store.properties();
    if (!props.length) {
      // Only a user who may create a hostel is sent to the creation form. Permissions decide,
      // not the role: the API is the authority on what this account can actually do.
      if (!session.hasPermission('core:Hostel:create')) {
        notifications.info(
          'No hostel assigned',
          'You are not part of any hostel yet. Ask the owner to add you to theirs.',
        );
        return router.parseUrl('/');
      }
      return router.parseUrl('/host/hostels/new');
    }
    const sel = store.selected();
    const id = sel && props.some((p) => p.id === sel) ? sel : props[0].id;
    return router.parseUrl(`/host/${id}`);
  };

  // An empty cached list is not a reason to skip the fetch. `loaded` is sticky and the error
  // path sets it too, so a single failed or empty response would otherwise pin the user to
  // create-hostel for the rest of the session without ever calling the API again.
  if (store.loaded() && store.properties().length) return target();
  store.load();
  return toObservable(store.loaded).pipe(filter(Boolean), take(1), map(target));
};

/**
 * `hostels/new` is only for an account the API lets create a hostel. Whether the hostel may then
 * be used is the server's call, made on the requests themselves — this gate checks nothing else.
 *
 * Without the permission the user is routed via `/host`, so the "no hostel assigned" message
 * lives in exactly one place. The parent `roleGuard` has already established the session.
 */
const createHostelGate: CanActivateFn = () =>
  inject(SessionStore).hasPermission('core:Hostel:create') ? true : inject(Router).parseUrl('/host');

/**
 * `:hostelId` must name a hostel this host actually has.
 *
 * The segment is not just read, it is *kept*: the shell copies it into the property store,
 * which persists it to localStorage. So a URL naming a hostel that does not exist does not
 * fail once — it replaces the host's saved selection and keeps failing on every later visit,
 * across reloads, until something overwrites the key. `/host/hostels` is the easy way in
 * (a truncated `/host/hostels/new`: `hostels/new` needs both segments and `''` is
 * `pathMatch: 'full'`, so one segment falls through to here), and what it leaves behind is
 * requests like `/api/hostels/hostels/edit` from every screen that reads the stored id.
 *
 * The store's own reconciliation cannot dig out of this alone: it heals the saved id when the
 * listings arrive, but the shell's effect re-reads the URL — still naming the bad hostel — and
 * writes it straight back. Refusing entry is what breaks that loop.
 *
 * An empty list is not evidence the hostel is fake. `loaded` is set on the error path too, so
 * a flaky network would otherwise bounce a host off a perfectly good hostel; this lets those
 * through and leaves the page's own error state to speak. Unknown ids go to `/host` rather
 * than to a hostel picked here, so "which hostel, or none, or not allowed" stays in
 * {@link hostRootRedirect} alone.
 */
/** Exported for its test; the route table below is the only production caller. */
export const knownHostelGate: CanActivateFn = (route) => {
  const store = inject(HostPropertyStore);
  const router = inject(Router);
  const id = route.paramMap.get('hostelId') ?? '';

  const decide = (): boolean | UrlTree => {
    const props = store.properties();
    if (!props.length) return true;
    return props.some((p) => p.id === id) ? true : router.parseUrl('/host');
  };

  if (store.loaded() && store.properties().length) return decide();
  store.load();
  return toObservable(store.loaded).pipe(filter(Boolean), take(1), map(decide));
};

/**
 * Bookings belong to a hostel that sells nights.
 *
 * A month-billed hostel lets beds to tenants: there are no nightly bookings to list, and the
 * page's own create form would write a stay into a hostel that has no stays. The sidebar and
 * the phone's More list already leave the entry out, so what reaches here is a typed URL, a
 * bookmark, or a link shared from a hostel billed the other way — which is exactly the case
 * that would otherwise land a host on a permanently empty page and a form that cannot be
 * submitted.
 *
 * The hostel is read from the route rather than from the store's selection: this runs before
 * the shell syncs the two, so asking about "the current hostel" here can answer about the one
 * the host was looking at a moment ago. An unknown or unstated billing cycle is treated as
 * nightly and let through — see {@link HostPropertyStore.isMonthlyBilled}.
 */
/** Exported for its test; the route table below is the only production caller. */
export const bookingsGate: CanActivateFn = (route) => {
  const store = inject(HostPropertyStore);
  const router = inject(Router);
  const hostelId = route.parent?.paramMap.get('hostelId') ?? '';

  const decide = (): boolean | UrlTree =>
    store.isMonthlyBilled(hostelId) ? router.parseUrl(`/host/${hostelId}/overview`) : true;

  if (store.loaded()) return decide();
  store.load();
  return toObservable(store.loaded).pipe(filter(Boolean), take(1), map(decide));
};

/**
 * The mirror of {@link bookingsGate}, for Tenants, Utilities and Mess.
 *
 * Those pages belong to a hostel that houses people by the month. A nightly hostel has
 * guests for two days — tenancies it never signs, no meters to split between them, no
 * weekly menu to plan — so the lists are empty by construction and the forms would write
 * records nothing reads.
 *
 * Tenants is the exact counterpart of Bookings: whichever of the two a hostel's billing
 * frequency makes real, the other is the one being turned away here.
 *
 * Turned away rather than hidden, for the same reason as Bookings: the sidebar and the
 * phone's More list already drop the entry, so what arrives here is a typed URL, a
 * bookmark, or a link shared from a hostel billed the other way.
 *
 * Asks `isNightlyBilled`, **not** `!isMonthlyBilled`. A hostel whose billing cycle failed
 * to arrive is neither, and is let through — hiding a working page because a field was
 * missing is the worse failure, which is the argument `isMonthlyBilled` already makes in
 * the other direction.
 */
export const monthlyOnlyGate: CanActivateFn = (route) => {
  const store = inject(HostPropertyStore);
  const router = inject(Router);
  const hostelId = route.parent?.paramMap.get('hostelId') ?? '';

  const decide = (): boolean | UrlTree =>
    store.isNightlyBilled(hostelId) ? router.parseUrl(`/host/${hostelId}/overview`) : true;

  if (store.loaded()) return decide();
  store.load();
  return toObservable(store.loaded).pipe(filter(Boolean), take(1), map(decide));
};

/** Marks a route whose component hosts route-driven drawers; see AppRouteReuseStrategy. */
const DRAWER_HOST = { drawerHost: true };

export const HOST_ROUTES: Route[] = [
  {
    path: 'hostels/new',
    component: NewHostel,
    title: 'hostNewHostel.newHostel',
    canActivate: [createHostelGate],
  },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [hostRootRedirect],
    children: [],
  },
  {
    path: ':hostelId',
    component: HostLayout,
    canActivate: [knownHostelGate],
    children: [
      { path: 'profile', component: HostelProfile, title: 'common.hostelProfile', canActivate: [permissionGuard('host:Hostel:show')] },
      // Mobile-app "More" tab (bottom tab bar) — the destinations that don't fit in the tabs.
      { path: 'more', component: HostMore, title: 'common.more' },
      {
        path: 'team',
        canActivate: [permissionGuard('host:Staff:index')],
        children: [
          { path: '', pathMatch: 'full', component: HostTeam, title: 'common.teamAmpStaff' },
          { path: 'edit/:staffId', component: HostTeam, title: 'routeTitle.editStaff' },
        ],
      },
      {
        path: 'bookings',
        component: HostBookings,
        title: 'common.bookings',
        canActivate: [bookingsGate],
        data: DRAWER_HOST,
      },
      // A sibling rather than a child of `bookings`: bookingsGate and HostBookings read
      // `hostelId` from `route.parent`, which a child route would shift down a level.
      {
        path: 'bookings/:bookingId',
        component: HostBookings,
        title: 'common.bookings',
        canActivate: [bookingsGate],
        data: DRAWER_HOST,
      },
      {
        path: 'rooms',
        canActivate: [permissionGuard('host:Room:index')],
        children: [
          { path: '', pathMatch: 'full', component: Rooms, title: 'common.rooms', data: DRAWER_HOST },
          // Drawer routes reuse `Rooms` so the hardware/browser back button closes the
          // drawer instead of leaving the page. They must precede `:roomId`, which would
          // otherwise swallow these literal segments.
          { path: 'create', component: Rooms, title: 'hostRooms.addRoom', data: DRAWER_HOST },
          { path: 'bulk', component: Rooms, title: 'hostRooms.bulkAddRooms', data: DRAWER_HOST },
          { path: 'edit/:roomId', component: Rooms, title: 'hostRooms.editRoom', data: DRAWER_HOST },
          { path: ':roomId', component: RoomDetail, title: 'routeTitle.roomDetails' },
        ],
      },
      {
        path: 'tenants',
        canActivate: [permissionGuard('host:Renter:index'), monthlyOnlyGate],
        children: [
          { path: '', pathMatch: 'full', component: Tenants, title: 'common.tenants', data: DRAWER_HOST },
          { path: 'create', component: Tenants, title: 'hostTenants.registerTenant', data: DRAWER_HOST },
          { path: 'edit/:tenantId', component: Tenants, title: 'hostTenants.editTenant', data: DRAWER_HOST },
          { path: 'profile/:tenantId', component: TenantProfile, title: 'routeTitle.tenantProfile' },
        ],
      },
      {
        path: 'utilities',
        canActivate: [permissionGuard('host:UtilityBill:index'), monthlyOnlyGate],
        children: [
          { path: '', pathMatch: 'full', component: Utilities, title: 'common.utilities' },
          { path: 'add', component: AddBill, title: 'hostUtilities.addUtilityBill' },
          { path: 'edit/:billId', component: AddBill, title: 'routeTitle.editUtilityBill' },
        ],
      },
      {
        path: 'invoices',
        canActivate: [permissionGuard('host:RenterBill:index')],
        children: [
          { path: '', pathMatch: 'full', component: Invoices, title: 'common.invoices', data: DRAWER_HOST },
          { path: 'create', component: Invoices, title: 'routeTitle.newInvoice', data: DRAWER_HOST },
          // Same component as the list: the drawer is URL-driven so the hardware back
          // button closes it and lands on the list, matching 'create'.
          { path: 'edit/:billId', component: Invoices, title: 'routeTitle.editInvoice', data: DRAWER_HOST },
          { path: 'view/:billId', component: Invoices, title: 'hostInvoices.invoice', data: DRAWER_HOST },
        ],
      },
      {
        path: 'expenses',
        canActivate: [permissionGuard('host:Expense:index')],
        children: [
          { path: '', pathMatch: 'full', component: ExpensesList, title: 'common.expenses' },
          { path: 'new', component: AddGrocery, title: 'hostExpenses.newExpense' },
          { path: ':expenseId', component: ExpenseDetailPage, title: 'hostExpenses.expense' },
          { path: ':expenseId/edit', component: AddGrocery, title: 'routeTitle.editExpense' },
        ],
      },
      {
        path: 'mess',
        canActivate: [permissionGuard('host:WeeklyMenu:index'), monthlyOnlyGate],
        children: [
          { path: '', pathMatch: 'full', component: MessList, title: 'common.mess' },
          {
            // Reached from the mess page, where the type is a given — the form locks its
            // expense-type picker to this rather than offering a choice that would file the
            // entry away from the mess.
            path: 'add',
            component: AddGrocery,
            title: 'hostMess.addGrocery',
            data: { lockedExpenseType: 'groceries' },
          },
          { path: 'confirmations', component: MessConfirmations, title: 'hostMess.mealConfirmations' },
          { path: 'notifications', component: MessNotifications, title: 'hostMess.mealNotifications' },
        ],
      },
      {
        path: 'overview',
        children: [
          { path: '', pathMatch: 'full', component: HostOverview, title: 'common.overview' },
          { path: 'revenue',   component: RevenueDetail,   title: 'routeTitle.revenueDetail' },
          { path: 'movement',  component: MovementDetail,  title: 'common.tenantMovement' },
          { path: 'occupancy', component: OccupancyDetail, title: 'hostOverview.occupancyTrend' },
        ],
      },
      { path: 'subscription', children: SUBSCRIPTION_ROUTES },
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
    ],
  },
];
