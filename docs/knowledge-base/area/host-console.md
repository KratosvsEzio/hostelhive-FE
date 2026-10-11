# Host console

The signed-in host's workspace at `/host/:hostelId/…`: overview dashboards, hostel profile, rooms, tenants, bookings, renter bills ("invoices"), utilities, expenses, mess and team. It covers the shell, navigation, per-page permission and billing-cycle gates, and the host data services. Paying for HostelHive itself is a separate area — see [host-billing-and-subscription](./host-billing-and-subscription.md).

## Where it lives
- `apps/web/src/app/features/host/host.routes.ts` — the route table and its guards (`hostRootRedirect`, `createHostelGate`, `knownHostelGate`, `bookingsGate`, `monthlyOnlyGate`).
- `apps/web/src/app/layout/host-shell/host-shell.ts` — the shell: sidebar, property switcher flyout, URL→store sync.
- `apps/web/src/app/layout/host-shell/host-nav.ts` — `hostNav`, `hostTabBar`, `tabBarSuffixes`, `splitNav`: the single source for sidebar, bottom tab bar and the mobile More page (`apps/web/src/app/features/host/more/more.ts`).
- `apps/web/src/app/layout/host-shell/host-route.ts` — `hostPagePath` (URL → page below the hostel).
- `apps/web/src/app/services/host-property-store.ts` — `HostPropertyStore`: the signed-in user's hostels, the selected id (persisted per user in localStorage `hh:host-property` as `{ owner, id }`), `activeHostel`, `isMonthlyBilled` / `isNightlyBilled`.
- `apps/web/src/app/services/host-shell-api.ts` — `GET /api/host/hostels` (`listings()`) and the manager-login endpoints.
- `apps/web/src/app/services/host-ops-api.ts` — rooms, renters, renter bills (including booking bills: `toInvoice`, `invoice`, `bookingInvoices`), utility bills.
- `apps/web/src/app/services/staff-api.ts` — staff employment records (`/api/host/hostels/:id/staffs`).
- `apps/web/src/app/services/overview-api.ts` — overview cards and the revenue / occupancy / movement charts.
- `apps/web/src/app/services/hostels-api.ts` — hostel CRUD, form options, mess (meal types, weekly menus, confirmations) and expenses.
- `apps/web/src/app/features/host/bookings/host-bookings-api.ts` — host bookings, the stay moves, `get` (one booking from the database) and `bookingsInRoom` (owned by [listing-and-booking](./listing-and-booking.md)).
- `apps/web/src/app/features/host/bookings/` — the bookings page (`bookings.ts`), its details panel (`booking-details-panel.ts`) and `booking-move-failure.ts` (refusal → translation key).
- `apps/web/src/app/features/host/rooms/room-calendar/room-stays.ts` — how a booking fills a room's nights.
- `apps/web/src/app/util/host-links.ts` — `bookingPath`, `invoicePath`.
- `apps/web/src/app/features/host/hostel-form/hostel-form.ts` — the one hostel form, used by `new-hostel/`, `hostel-profile/` and the moderator review screen.
- `apps/web/src/app/util/tenant-status.ts` — tenant status label and tone; `apps/web/src/app/util/table-configs/` — column definitions for every console table.

## How it works
- **Entering.** `/host` runs `hostRootRedirect`, which waits for `HostPropertyStore.load()` and lands on the selected (or first) hostel, or on `/host/hostels/new` when the user holds `core:Hostel:create` (`apps/web/src/app/features/host/host.routes.ts`).
- **The store belongs to the signed-in user.** `HostPropertyStore` keys on `SessionStore.user()?.id`: its `properties`, `hostels` and `loaded` read as nothing loaded the moment the user changes (same tick, so the guards refetch instead of trusting the previous user's list); an effect clears on sign-out, cancels the previous user's request on an account switch and reloads only if one was in flight; a token-only restore and a same-user refresh change nothing. A bare id saved by older builds under `hh_property` is adopted once by whoever is signed in (`apps/web/src/app/services/host-property-store.ts`). See the decision below.
- **Multi-property switching.** The URL's `:hostelId` is authoritative. `knownHostelGate` refuses an id the host does not own; `HostLayout._syncStore` copies the route id into the store; `onPropertySelect` keeps the current page and swaps the hostel segment through `hostPagePath` (`apps/web/src/app/layout/host-shell/host-shell.ts`). See the decision below.
- **Permissions per page.** Nav entries carry a `group:Subject:action` flag and are filtered by `SessionStore.hasPermission`; routes repeat the flag with `permissionGuard` (`apps/web/src/app/core/auth/guards.ts`). Map: profile `host:Hostel:show`, rooms `host:Room:index`, tenants `host:Renter:index`, team `host:Staff:index`, utilities `host:UtilityBill:index`, mess `host:WeeklyMenu:index`, expenses `host:Expense:index`, invoices `host:RenterBill:index`, subscription `core:Hostel:subscription`. Overview is ungated by design.
- **Billing-cycle split.** A hostel's `billing_frequency` (`month` / `night`) decides which half of the console exists: Bookings for nightly hostels, Tenants / Utilities / Mess for monthly ones, enforced in `hostNav`, `hostTabBar` and the two gates.
- **Deep links.** `bookings/:bookingId` (a sibling of `bookings`, because the gate and page read `hostelId` from `route.parent`) opens that booking's panel. `invoices/view/:billId` opens that bill's preview and fetches it when it is off-page. Build both with `util/host-links.ts`. List and drawer routes carry `data: { drawerHost: true }`, so `AppRouteReuseStrategy` keeps the page instead of rebuilding it; it reads route data and imports no page (`apps/web/src/app/route-reuse-strategy.ts`, `host.routes.ts`).
- **Stay flow (bookings).** The panel shows the booking's invoice: loading, none, the invoice with View invoice, or failed. One `bookingInvoices` lookup per page feeds it. Generate invoice is offered only for checked-in and checked-out bookings, and the panel keeps the bill the server returns. A checked-out or cancelled booking shows its rooms read-only under "Stayed in". Opening a booking re-reads it from the database ([index-backed reads](../decisions/api-and-data/index-backed-reads-lag-trust-db-and-local-writes.md)). Paying either the booking or its invoice offers the other ([cross-pay](../decisions/host-console/cross-pay-checkbox-ticked-by-default.md)). Refusals show translated keys from `booking-move-failure.ts`, never server text, and every call whose error shows inline (the stay moves, release, `create` for the booking drawer) opts out of the global toast.
- **Invoices.** Bills are `rental`, `utility` or `booking`; a booking bill shows a Booking badge, is "Billed to" the guest with a link to the booking, and is never editable. The page's cards, filters and Add invoice follow the hostel's billing mode ([decision](../decisions/host-console/invoices-page-follows-billing-mode.md)).
- **Rooms.** Room cards show "N free" or "Full" (capacity − the server's `current_occupancy`, which includes booking guests). Room detail lists "Guests on bookings" (`f[occupied_room_ids]`) and counts occupied as active renters plus those guests; its status pill is hidden while that count is unknown (loading or failed). The room calendar charges each room only the guests placed in it ([decision](../decisions/host-console/room-occupancy-counts-per-room-occupancies.md)).
- **Data loading.** Pages read the hostel from the store (`HostPropertyStore.selected()` / `activeHostel()`), not a second fetch; lists page server-side with `pageParams` and `f[status.slug]` filters (e.g. `apps/web/src/app/features/host/team/team.ts`).
- **Time zones.** Each hostel has an IANA `timezone`, picked with `TimezoneSelect` in the hostel form and locked for hosts once the hostel has bookings (`timezoneLocked` in `apps/web/src/app/features/host/hostel-profile/hostel-profile.ts`, which asks for one booking row). Booking dates go out as plain days and the server applies the hostel's zone. Naive wall-clock fields are string-sliced, never parsed (`toDate` in `apps/web/src/app/services/staff-api.ts`). Range filters use `dayRangeStart` / `dayRangeEnd`. Details: [dates-money-and-time-zones](./dates-money-and-time-zones.md).

## Reuse, don't rebuild
- `HostPropertyStore.activeHostel()` for currency, room types and billing cycle, and `isMonthlyBilled(id)` / `isNightlyBilled(id)` in guards (pass the route id).
- `hostNav()` for any new destination; it feeds the sidebar, the More page and, through `tabBarSuffixes`, the tab bar.
- `hostPagePath()` for any URL arithmetic below the hostel (it strips the locale prefix); `bookingPath()` / `invoicePath()` for links to one booking or bill (no locale prefix; the link directives add it).
- `bookingMoveFailureKey` / `releaseFailureKey` / `crossPayInvoiceFailureKey` (`apps/web/src/app/features/host/bookings/booking-move-failure.ts`) for any new stay-move error.
- `PAYABLE_LANES` / `INVOICEABLE_LANES` (`apps/web/src/app/features/host/bookings/booking-month.ts`) for "can this booking be paid / invoiced".
- `tenantStatusLabel` / `tenantStatusTone`, and `invoiceStatusLabel` / `invoiceStatusTone` in `apps/web/src/app/util/table-configs/invoice-table-cols.ts`.
- `dayRangeStart` / `dayRangeEnd` from `apps/web/src/app/util/date-range-filter.ts` for every date-range filter.
- `HostelForm` for anything that edits a hostel.

## Traps
- **"Invoices" are renter bills** (rent, utility, or a booking's stay; `/api/host/hostels/:id/renter_bills`, `apps/web/src/app/features/host/invoices/invoices.ts`), not HostelHive billing invoices.
- **The booking list, calendars and `…/occupancies` read the search index**, which can lag by minutes; `GET bookings/:id` reads the database. Never "refresh" after a write by re-fetching the list ([decision](../decisions/api-and-data/index-backed-reads-lag-trust-db-and-local-writes.md)).
- **Bookings has no `permissionGuard`**, while its nav entry is gated on `host:Room:index` (`apps/web/src/app/features/host/host.routes.ts` vs `apps/web/src/app/layout/host-shell/host-nav.ts`).
- **One endpoint uses a singular path.** `updateUtilityBill` calls `/api/host/hostel/:id/utility_bills/:billId`; every other call is plural, and `markInvoicePaid`'s comment says plural is what the current backend serves (`apps/web/src/app/services/host-ops-api.ts`). Nobody has checked the singular path on the wire.
- **Dead fixture code.** `HostOpsApi.utilityBatch()`, `occupancyDays()` and `utilityTypes()` have no callers and still read `apps/web/src/app/services/host-ops.fixtures.ts`. `HostelsApi.currentSubscription()` is also unused.
- **A wrong doc comment.** `HostelsApi.getById` says `GET /api/hostels/:id` but calls `/public/hostel_detail/:id` (`apps/web/src/app/services/hostels-api.ts`).
- **Two staff resources.** `StaffApi` covers employment records; `HostShellApi.addManager` / `removeManager` cover login accounts. Neither replaces the other (doc comment in `apps/web/src/app/services/staff-api.ts`).
- **`loaded` flips true on failure too**, so an empty list can mean "fetch failed". Guards let such hosts through rather than bouncing them (`apps/web/src/app/services/host-property-store.ts`).
- **`properties`, `hostels` and `loaded` are read-only computeds**, gated on the owner. Write through `load()`, `setProperty()` and `clear()` only; anything new that caches per-user host data should read through the store or follow the same owner gating.
- **The shell loads only in its constructor.** An account switch while the host shell stays mounted would leave it loading until the next guard runs; no path does that today (`/confirm_invitation` lands on `/`), but a future in-console account switch must make the shell call `load()` when `loaded()` goes false (`apps/web/src/app/layout/host-shell/host-shell.ts`).

## Decisions
- [The URL's hostel id decides the active hostel](../decisions/host-console/url-hostel-id-is-the-active-hostel.md)
- [Billing-cycle gates fail toward showing the page](../decisions/host-console/billing-cycle-gates-fail-open.md)
- [The host's hostel list and selection follow the signed-in user](../decisions/host-console/host-property-follows-the-session-user.md)
- [The Invoices page follows the hostel's billing mode](../decisions/host-console/invoices-page-follows-billing-mode.md)
- [A room is charged only the guests placed in it, and a checked-out stay frees it from today](../decisions/host-console/room-occupancy-counts-per-room-occupancies.md)
- [Paying a booking or its invoice offers the other, as a ticked checkbox](../decisions/host-console/cross-pay-checkbox-ticked-by-default.md)

## See also
- [host-billing-and-subscription](./host-billing-and-subscription.md), [auth-and-session](./auth-and-session.md) (permission flags), [app-shell-and-routing](./app-shell-and-routing.md), [listing-and-booking](./listing-and-booking.md), [dates-money-and-time-zones](./dates-money-and-time-zones.md), [ui-library](./ui-library.md)
- [API contract — Host](../../api/hostelhive-api.md). It writes the host prefix as singular `/api/host/hostel/`; the code uses plural.
- [Risk register](../../RISKS.md), [Frontend build plan](../../HostelHive-Frontend-Build-Plan.md)
