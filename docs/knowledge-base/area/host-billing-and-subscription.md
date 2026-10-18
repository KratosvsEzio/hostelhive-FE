# Host billing and subscription

How a host pays HostelHive for a hostel, and how an unpaid hostel is fenced off. Billing is midway through a rewrite (Trello #93, in eight frontend parts). Part 1 (#94, PR #68) removed the legacy order, contract and product flow. What is on `main` now is a placeholder billing page and the server's own refusals; the new plans, checkout and invoices are not built yet. Renter rent and utility bills belong to the [host console](./host-console.md), not to this area.

## Where it lives
- `apps/web/src/app/features/host/subscription/subscription.routes.ts` — one route, `''`, the billing page at `/host/:id/subscription`. The old plan, checkout and payment-history URLs are gone and fall through to the app's catch-all.
- `apps/web/src/app/features/host/subscription/subscription-placeholder.ts` — `SubscriptionPlaceholder`: an empty state saying billing is moving, with "Contact us" and a link back to the hostel's overview. It loads no data.
- `apps/web/src/app/layout/components/subscription-gate/subscription-gate.ts` — `<hh-subscription-gate>`, the inline paywall card. Its button links to the billing page of the selected hostel.
- `apps/web/src/app/util/subscription-error.ts` — `isSubscriptionError(err)`: whether an API error means "this hostel needs a plan" (a 402, or the 400 "You need to subscribe…"). It is never true for a 403.
- `apps/web/src/app/core/interceptors/host-access-interceptor.ts` and `apps/web/src/app/core/host-access/host-access.ts` (`classifyHostAccess`) — record the plan refusals the server sends; `apps/web/src/app/layout/components/access-lock/access-lock.ts` — `<hh-access-lock>`, which the host shell shows instead of a locked section.
- `apps/web/src/app/features/host/host.routes.ts` — `createHostelGate` on `/host/hostels/new`.
- `apps/web/src/app/features/host/new-hostel/new-hostel.ts` and `apps/web/src/app/features/public/onboarding/onboarding-wizard/onboarding-wizard.ts` (`landOnBilling`) — where a host lands after creating a hostel.

## How it works
- **The server decides access.** Nothing checks the plan before a request, and entering a hostel never bounces to the billing page. A hostel without a usable plan gets refusals from the API on the requests themselves:
  - a 400 "You need to subscribe to avail the services" (no live plan);
  - a 403 with `code: 'crm_required'` (a plan without CRM);
  - in principle a 402.
- **The plan lock owns the first two.** `hostAccessInterceptor` records them per hostel, and the host shell swaps a CRM section's `<router-outlet>` for `<hh-access-lock>` (`lock` in `apps/web/src/app/layout/host-shell/host-shell.ts`), which destroys the page and any open drawer.
- **A 403 with no server code is a permission refusal, not a plan one, unless its message is the CRM one** (`isPermissionRefusal`; never compare `code` yourself). The backend runs its plan checks before CanCan, so a CanCan "You are not authorized…" arrives only when the plan is live and includes CRM (Trello #193). The lock never records it; the page explains it (see [host-console](./host-console.md)).
- **Inline paywall, a backstop.** Overview, rooms, tenants, invoices, utilities and add-bill catch a failed load with `isSubscriptionError` and render `<hh-subscription-gate>`; the booking form drawer shows a renew notice (`apps/web/src/app/features/host/bookings/booking-form-drawer/booking-form-drawer.ts`). Since the lock replaces these pages first on the same refusals, both surfaces rarely show; retiring or translating them is Trello #199.
- **Creating a hostel.** `createHostelGate` checks only the `core:Hostel:create` permission; without it the host goes to `/host`. Whether the new hostel may then be used is again the server's call.
- **After create.** Both the console's new-hostel form and the become-a-host wizard reload the hostel list, then land on `/host/:id/subscription`. The reload comes first because `knownHostelGate` trusts a loaded list, and a stale one would send the host back to a hostel they already had.
- **No nav entry.** The host sidebar and "More" page have no billing link; the paywall card, the booking drawer's notice and the post-create landing are the ways in.

## The rewrite (Trello #93)
- **Backend:** merged. Billing core (`azeem-hamza/hostelhive` PR #26, 2026-10-04) and Safepay (PR #27, 2026-10-10) replace orders, contracts and products with plans → one subscription per hostel → invoices → payment attempts. Amounts arrive as decimal strings with a `currency`, and the frontend never calculates money.
- **Frontend:** part 1/8 (#94) is on `main`. Parts 2–8 are open Trello cards: the pricing page and billing screen, the payment step (Safepay redirect, bank transfer), invoices and the PDF receipt, plan changes, grace and renewal banners with the CRM lock, admin billing, and the booking confirmation PDF field.
- The plan and its run records are in [`docs/implement/93.md`](../../implement/93.md) and [`docs/implement/billing-frontend/94.md`](../../implement/billing-frontend/94.md).

## Reuse, don't rebuild
- `isSubscriptionError` with `<hh-subscription-gate [feature]>` for a page that can be paywalled. Check `isPermissionRefusal` alongside it (`apps/web/src/app/core/host-access/host-access.ts`).
- `isCrmRequired` (same file) for "this plan has no CRM"; never match its message yourself.

## Traps
- **Two classifiers answer "is this a plan refusal".** `classifyHostAccess` (the lock) and `isSubscriptionError` (the page) drifted once: the page read a CanCan permission 403 as a lapsed plan and showed owners a "subscribe" paywall for a hostel that was paid up (Trello #193). A new plan refusal must be taught to both, and a spec must feed the backend's real body through the real interceptors.
- **`isSubscriptionError` still matches any non-403 failure whose text matches `subscri`, `upgrade.*plan` or `plan.?required`** (`apps/web/src/app/util/subscription-error.ts`). So a 422 saying "plan required" would open the paywall or the drawer's renew notice. Nothing sends one today.
- **The billing page has no `permissionGuard`, on purpose.** The paywall card links every host there, and a guard would turn that link into `/forbidden` for staff who lack the permission (comment in `subscription.routes.ts`).
- **The paywall card and the drawer's renew notice are hard-coded English** (`BENEFITS` in `subscription-gate.ts`; `booking-form-drawer.html`). Trello #199.

## Decisions
- [Billing rewrite built against backend PR #26, host billing core first](../decisions/host-billing-and-subscription/billing-rewrite-against-unmerged-backend.md)
- [A lapsed hostel keeps subscription, profile and bookings open](../decisions/host-billing-and-subscription/lapsed-hostel-keeps-three-pages-open.md) (Superseded by #94: the client-side gate it tuned is removed)

## See also
- [host-console](./host-console.md), [admin-and-moderation](./admin-and-moderation.md) (admin billing: verification, payments, invoices, grants, plan prices), [api-and-data](./api-and-data.md) (`ApiError`, the error interceptor), [dates-money-and-time-zones](./dates-money-and-time-zones.md)
- [Risk register](../../RISKS.md), [Frontend build plan](../../HostelHive-Frontend-Build-Plan.md)
