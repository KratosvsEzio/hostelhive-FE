# Admin and moderation

The internal staff console: moderators review new or changed listings and their photos; admins run billing (bank-transfer verification, payments, invoices, a hostel's subscription, plan prices); super-admins manage roles and permissions and read the full listing index. Both consoles share one shell. This area does not cover how a host pays; see [host-billing-and-subscription](./host-billing-and-subscription.md).

## Where it lives
- `apps/web/src/app/features/admin/admin.routes.ts` — `/admin` children:
  - `''` → `adminLanding` (`apps/web/src/app/features/admin/admin-landing.ts`): an admin goes to `billing`; anyone else to the first of `roles`, `queue`, `listings` their flags open, else `listings`
  - `billing` — componentless, behind `roleGuard('admin')`, children in `apps/web/src/app/features/admin/billing/admin-billing.routes.ts`: `verification` (the default), `payments`, `invoices`, `plans`, `hostels/:hostelId`
  - `payments` — redirects to `billing/payments` (the legacy URL)
  - `roles`, `listings`
  - `queue` and `review/:id`, which reuse the moderator components
- `apps/web/src/app/features/admin/billing/` — the billing pages:
  - `verification/` — `AdminVerification`, the queue of transfers awaiting verification, oldest first
  - `payments/` — `AdminBillingPayments` and `AdminPaymentDrawer` (verify, reject, proof, attempts), shared by the queue
  - `invoices/` — `AdminBillingInvoices` and `AdminInvoiceDrawer` (`?invoice=` opens it, `?number=` pre-fills the search)
  - `hostel/` — `AdminHostelBilling` (plan card read-only, grant, currency override, event timeline), `GrantDialog`, `AdminBillingEvents`
  - `plans/` — `AdminPlans`, the plan price and name editor (`plan-edit.ts` holds the pure rules)
  - `shared/` — tabs, error mapper (`adminBillingError`), labels and event views, the admin attempts list, and `AdminUtcDate`
- `apps/web/src/app/services/admin-billing-api.ts` — `AdminBillingApi`, the 11 `/api/admin/...` billing calls, every one sent `quiet()` (`apps/web/src/app/services/quiet-request.ts`). Models in `apps/web/src/app/util/models/admin-billing.ts`.
- `apps/web/src/app/features/moderator/moderator.routes.ts` — `/moderator` children: `queue` (the default), `review/:id`, `media`, `audit`.
- `apps/web/src/app/layout/staff-shell/staff-shell.ts` — `StaffLayout`: sidebar plus `StaffTabBar` on phones. It picks `MOD_NAV` or `ADMIN_NAV` by URL prefix and filters entries by permission and, where a `NavEntry` has one, by `role` (Billing is `role: 'admin'`).
- `apps/web/src/app/features/admin/admin-shell/admin-shell.ts` — `AdminShell`, the per-page header wrapper around `DashboardLayout` (it binds `[label]`, which renders the page's `<h1>`).
- `apps/web/src/app/services/admin-api.ts` — `AdminApi`:
  - `roles`, `roleFlags`, `updateRolePermissions`, `permissionsGrouped`
  - `listings` (`/api/admin/hostels`); takes an optional `HttpContext`, so the hostel billing page can look a name up quietly
- `apps/web/src/app/services/moderation-api.ts` — `ModerationApi`:
  - live: `queue`, `getById` (enriched with host and amenity catalogue), `attachments`, `attachmentLabels`, `updateAttachmentLabel`, `markAsActive`, `markAttachmentAsActive`, `markAttachmentAsRejected`, `formOptions`
  - fixtures: `deltaMedia`, `dispositions`, `listings`, `audit`, `profile`
- Fixtures: `apps/web/src/app/services/admin.fixtures.ts` (`PERMISSION_GROUPS`) and `apps/web/src/app/services/moderation.fixtures.ts`.
- Tables: `apps/web/src/app/util/table-configs/admin-billing-*-cols.ts`, `apps/web/src/app/util/table-configs/admin-listings-table-cols.ts`, `apps/web/src/app/util/table-configs/queue-table-cols.ts`.

## How it works
- **Access.** Both trees sit behind `roleGuard(...STAFF_ROLES)` in `apps/web/src/app/app.routes.ts`, then per-page `permissionGuard`:
  - `admin:Payment:index`, `admin:Role:index`, `admin:Hostel:index`
  - `moderator:Hostel:index`, `moderator:Attachment:index`

  Nav entries carry the same flags.
- **Review queue → review.**
  - `Queue` pages `GET /api/moderator/hostels` and opens `../review/:id` relative to the current console (`apps/web/src/app/features/moderator/queue/queue.ts`).
  - `Review` renders the host's `<hh-hostel-form>` with `moderating` and `requireComplete` set.
  - **Update** saves through `HostelsApi.update`, then flushes pending photo rejections.
  - **Approve & publish** flushes rejections first, then calls `PUT /api/moderator/hostels/:id/mark_as_active`.
  - Source: `apps/web/src/app/features/moderator/review/review.ts`.
- **Media queue.** `Media` pages `/api/moderator/attachments`, filters server-side by label (`f[attachment_label.name]`, with `UNLABELLED = 'null'` as the search layer's "absent" sentinel), approves or rejects singly or in bulk, and re-reads every loaded page after a decision (`apps/web/src/app/features/moderator/media/media.ts`).
- **Roles.**
  - `AdminRoles` lists roles and lazily loads a role's flags.
  - Saving replaces the role's permission set: `PUT /api/admin/roles/:id` with `permission_ids`.
  - The permission catalogue falls back to `PERMISSION_GROUPS` when the API fails or returns nothing.
- **Listings.** A read-only, Searchkick-backed table, server-paged, filtering on `f[status.slug]` and sorting through `sort[<field>]`.
- **Billing access.** The backend lets only the role with slug `admin` reach `/api/admin/...` billing; `super-admin` and `support` get a 403 unless they also hold `admin`. The frontend mirrors that with `hasRole('admin')` in the nav entry, the route guard and the landing, not with permission flags.
- **Billing lists.** Payments and invoices are Searchkick lists: filters, sort and page live in the URL, and each list shows a count but never a money total. Amount sorts only once one currency is filtered. Date ranges go out as `dayRangeStart` / `dayRangeEnd`.
- **Verify and reject.** The verify outcome is read from `payment.status.slug`, not the HTTP status: a 200 can carry `failed` (the amount did not match), which the drawer shows as a danger alert with `failure_reason` verbatim. A handled row is hidden locally at once, because the index lags. A 422 (someone else got there first) is shown verbatim and the detail is re-read; the drawer stays open. One action runs at a time.
- **Grant and currency.** Both answer with the whole billing envelope. A grant then re-reads it in place (`AdminHostelBilling.reread`), because the answer's subscription is stale; see Traps.
- **Plans.** Prices are sent as the typed strings and only when changed; deactivating asks first, because renewals on an inactive plan fail silently on the backend.

## Reuse, don't rebuild
- `HostelForm` (`apps/web/src/app/features/host/hostel-form/hostel-form.ts`) for any listing edit. Do not fork a staff copy; see the decision.
- `StaffLayout`'s filtered nav; add entries to `MOD_NAV` / `ADMIN_NAV` with their flag or `role`.
- For admin billing: `AdminPaymentDrawer` (queue and payments list both open it), `InvoiceSummary` from the host billing screens, `adminBillingError` for every write, `AdminUtcDate` for every date.

## Traps
- **Approving from the admin console leaves it.** After approval, `Review` navigates to `/moderator/queue`, even when it was opened from `/admin/review/:id` (`apps/web/src/app/features/moderator/review/review.ts`).
- **Some pages are fixtures or unreachable.**
  - `/moderator/audit` renders fixture data (`ModerationApi.audit`), has no permission guard, and is in neither nav.
  - `Review.logAudit` writes hard-coded entries to an `audit` signal the template never renders.
- **Stale doc comments.** `ModerationApi`'s class comment still says "Stub pending Q-API", though most methods are live. `AdminApi`'s says "all live", though `permissionsGrouped` silently falls back to fixtures.
- **"New role" is session-only.** It adds to an in-memory `customRoles` signal and is gone on reload (`apps/web/src/app/features/admin/admin-roles/admin-roles.ts`).
- **Every photo rejection gets the same note.** It is sent as `'Rejected during listing review.'` because the confirm dialog collects no reason (`REJECTION_NOTE` in `apps/web/src/app/features/moderator/review/review.ts`).
- **`review/:id` has no `permissionGuard`** in either route table.
- **The grant answer carries the old subscription.** `POST /api/admin/hostels/:id/grant` renders the subscription the controller loaded before the grant, so its period end is the old one; the events are right. The page re-reads after a grant; do not drop that read while the backend still answers this way.
- **Billing lists can hold ghost rows.** The lists read the search index, the drawers read the DB. On the dev API the index holds 2027–2028 payments and invoices the DB no longer has, so opening one gives a 404 (a payment drawer shows the load error, an invoice drawer the not-found copy and a list refresh).
- **Hosts cannot submit a bank transfer from the app**, so the verification queue is normally empty. To exercise it, post `{payment_method: 'bank_transfer', reference}` to `/api/invoices/:id/payments` as the host on an open invoice; a second one on the same invoice is refused with a 422.
- **The staff shell is broken in RTL** (sidebar over the content on every admin page, in `ur`/`ar`); it predates the billing pages.

## Decisions
- [Moderators edit listings through the host's hostel form](../decisions/admin-and-moderation/moderators-use-the-host-hostel-form.md)
- [Admin billing shows dates in UTC](../decisions/dates-money-and-time-zones/admin-billing-dates-in-utc.md)

## See also
- [host-console](./host-console.md), [auth-and-session](./auth-and-session.md) (roles, permission flags, `permissionGuard`), [ui-library](./ui-library.md), [api-and-data](./api-and-data.md)
- [API contract — Moderator and Admin](../../api/hostelhive-api.md), [Frontend build plan](../../HostelHive-Frontend-Build-Plan.md) (it planned a separate `console` app; the code ships one `apps/web`), [Risk register](../../RISKS.md)
