# Admin and moderation

The internal staff console: moderators review new or changed listings and their photos, and super-admins manage roles and permissions and read payments and the full listing index. Both consoles share one shell. This area does not cover how a host pays; see [host-billing-and-subscription](./host-billing-and-subscription.md).

## Where it lives
- `apps/web/src/app/features/admin/admin.routes.ts` — `/admin` children:
  - `payments` (the default)
  - `roles`
  - `listings`
  - `queue` and `review/:id`, which reuse the moderator components
- `apps/web/src/app/features/moderator/moderator.routes.ts` — `/moderator` children: `queue` (the default), `review/:id`, `media`, `audit`.
- `apps/web/src/app/layout/staff-shell/staff-shell.ts` — `StaffLayout`: sidebar plus `StaffTabBar` on phones. It picks `MOD_NAV` or `ADMIN_NAV` by URL prefix and filters entries by permission.
- `apps/web/src/app/features/admin/admin-shell/admin-shell.ts` — `AdminShell`, the per-page header wrapper around `DashboardLayout`.
- `apps/web/src/app/features/admin/data/drawer-detail.ts` — `loadDetail` / `resolveHostelImages` for the payment detail drawer.
- `apps/web/src/app/services/admin-api.ts` — `AdminApi`:
  - `roles`, `roleFlags`, `updateRolePermissions`, `permissionsGrouped`
  - `listings` (`/api/admin/hostels`)
  - `payments`
- `apps/web/src/app/services/moderation-api.ts` — `ModerationApi`:
  - live: `queue`, `getById` (enriched with host and amenity catalogue), `attachments`, `attachmentLabels`, `updateAttachmentLabel`, `markAsActive`, `markAttachmentAsActive`, `markAttachmentAsRejected`, `formOptions`
  - fixtures: `deltaMedia`, `dispositions`, `listings`, `audit`, `profile`
- `apps/web/src/app/services/users-api.ts` — `GET` / `PATCH /api/users/:id`, used to resolve a payment's host.
- Fixtures: `apps/web/src/app/services/admin.fixtures.ts` (`PERMISSION_GROUPS`, `ROLES`) and `apps/web/src/app/services/moderation.fixtures.ts`.
- Tables: `apps/web/src/app/util/table-configs/admin-payments-table-cols.ts`, `apps/web/src/app/util/table-configs/admin-listings-table-cols.ts`, `apps/web/src/app/util/table-configs/queue-table-cols.ts`.

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
- **Payments, listings.** These are read-only, Searchkick-backed tables. They are server-paged and filter on `f[status.slug]`, with sorting through `sort[<field>]` and detail drawers.

## Reuse, don't rebuild
- `HostelForm` (`apps/web/src/app/features/host/hostel-form/hostel-form.ts`) for any listing edit. Do not fork a staff copy; see the decision.
- `loadDetail` for any on-demand drawer sub-fetch.
- `StaffLayout`'s permission-filtered nav; add entries to `MOD_NAV` / `ADMIN_NAV` with their flag.

## Traps
- **Approving from the admin console leaves it.** After approval, `Review` navigates to `/moderator/queue`, even when it was opened from `/admin/review/:id` (`apps/web/src/app/features/moderator/review/review.ts`).
- **Some pages are fixtures or unreachable.**
  - `/moderator/audit` renders fixture data (`ModerationApi.audit`), has no permission guard, and is in neither nav.
  - `Review.logAudit` writes hard-coded entries to an `audit` signal the template never renders.
- **Stale doc comments.** `ModerationApi`'s class comment still says "Stub pending Q-API", though most methods are live. `AdminApi`'s says "all live", though `permissionsGrouped` silently falls back to fixtures.
- **"New role" is session-only.** It adds to an in-memory `customRoles` signal and is gone on reload (`apps/web/src/app/features/admin/admin-roles/admin-roles.ts`).
- **Every photo rejection gets the same note.** It is sent as `'Rejected during listing review.'` because the confirm dialog collects no reason (`REJECTION_NOTE` in `apps/web/src/app/features/moderator/review/review.ts`).
- **`review/:id` has no `permissionGuard`** in either route table, and `/admin` lands on `payments`. An admin without `admin:Payment:index` lands on `/forbidden`.
- **Payments is the last screen of the legacy billing model.** The admin Contracts screen was removed by #94 (PR #68); Trello #93 part 8 plans to replace Payments with verification queues and subscription and invoice lists. See [host-billing-and-subscription](./host-billing-and-subscription.md).

## Decisions
- [Moderators edit listings through the host's hostel form](../decisions/admin-and-moderation/moderators-use-the-host-hostel-form.md)

## See also
- [host-console](./host-console.md), [auth-and-session](./auth-and-session.md) (roles, permission flags, `permissionGuard`), [ui-library](./ui-library.md), [api-and-data](./api-and-data.md)
- [API contract — Moderator and Admin](../../api/hostelhive-api.md), [Frontend build plan](../../HostelHive-Frontend-Build-Plan.md) (it planned a separate `console` app; the code ships one `apps/web`), [Risk register](../../RISKS.md)
