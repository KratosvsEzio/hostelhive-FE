# Host billing and subscription

How a host pays HostelHive for a hostel, and how an unpaid hostel is fenced off. Billing is midway through a rewrite (Trello #93, in eight frontend parts). Part 1 (#94, PR #68) removed the legacy order, contract and product flow. What is on `main` now is a placeholder billing page and the server's own refusals; the new plans, checkout and invoices are not built yet. Renter rent and utility bills belong to the [host console](./host-console.md), not to this area.

## Where it lives
- `apps/web/src/app/features/host/subscription/subscription.routes.ts` — one route, `''`, the billing page at `/host/:id/subscription`. The old plan, checkout and payment-history URLs are gone and fall through to the app's catch-all.
- `apps/web/src/app/features/host/subscription/subscription-placeholder.ts` — `SubscriptionPlaceholder`: an empty state saying billing is moving, with "Contact us" and a link back to the hostel's overview. It loads no data.
- `apps/web/src/app/layout/components/subscription-gate/subscription-gate.ts` — `<hh-subscription-gate>`, the inline paywall card. Its button links to the billing page of the selected hostel.
- `apps/web/src/app/util/subscription-error.ts` — `isSubscriptionError(err)`: whether an API error means "this hostel needs a plan".
- `apps/web/src/app/features/host/host.routes.ts` — `createHostelGate` on `/host/hostels/new`.
- `apps/web/src/app/features/host/new-hostel/new-hostel.ts` and `apps/web/src/app/features/public/onboarding/onboarding-wizard/onboarding-wizard.ts` (`landOnBilling`) — where a host lands after creating a hostel.

## How it works
- **The server decides access.** There is no client-side subscription gate any more: no store, no loading overlay, no bounce to the billing page on entering a hostel. A hostel without a plan gets refusals from the API on the requests themselves (402, 400 "You need to subscribe to avail the services", or a 403 on a plan-gated endpoint).
- **Inline paywall.** Overview, rooms, tenants, invoices, utilities and add-bill catch a failed load with `isSubscriptionError` and render `<hh-subscription-gate>`. The booking form drawer shows a renew notice instead, because a lapse stops new bookings but not the stays already made (`apps/web/src/app/features/host/bookings/booking-form-drawer/booking-form-drawer.ts`).
- **Creating a hostel.** `createHostelGate` checks only the `core:Hostel:create` permission; without it the host goes to `/host`. Whether the new hostel may then be used is again the server's call.
- **After create.** Both the console's new-hostel form and the become-a-host wizard reload the hostel list, then land on `/host/:id/subscription`. The reload comes first because `knownHostelGate` trusts a loaded list, and a stale one would send the host back to a hostel they already had.
- **No nav entry.** The host sidebar and "More" page have no billing link; the paywall card, the booking drawer's notice and the post-create landing are the ways in.

## The rewrite (Trello #93)
- **Backend:** merged. Billing core (`azeem-hamza/hostelhive` PR #26, 2026-10-04) and Safepay (PR #27, 2026-10-10) replace orders, contracts and products with plans → one subscription per hostel → invoices → payment attempts. Amounts arrive as decimal strings with a `currency`, and the frontend never calculates money.
- **Frontend:** part 1/8 (#94) is on `main`. Parts 2–8 are open Trello cards: the pricing page and billing screen, the payment step (Safepay redirect, bank transfer), invoices and the PDF receipt, plan changes, grace and renewal banners with the CRM lock, admin billing, and the booking confirmation PDF field.
- The plan and its run records are in [`docs/implement/93.md`](../../implement/93.md) and [`docs/implement/billing-frontend/94.md`](../../implement/billing-frontend/94.md).

## Reuse, don't rebuild
- `isSubscriptionError` with `<hh-subscription-gate [feature]>` for a page that can be paywalled.

## Traps
- **`isSubscriptionError` is broad.** It also matches a 403 "not authorized" and any message containing "subscri". A plain permission refusal can therefore render the paywall (`apps/web/src/app/util/subscription-error.ts`).
- **The billing page has no `permissionGuard`, on purpose.** The paywall card links every host there, and a guard would turn that link into `/forbidden` for staff who lack the permission (comment in `subscription.routes.ts`).
- **The paywall card's benefits list is hard-coded English** (`BENEFITS` in `subscription-gate.ts`).

## Decisions
- [Billing rewrite built against backend PR #26, host billing core first](../decisions/host-billing-and-subscription/billing-rewrite-against-unmerged-backend.md)
- [A lapsed hostel keeps subscription, profile and bookings open](../decisions/host-billing-and-subscription/lapsed-hostel-keeps-three-pages-open.md) (Superseded by #94: the client-side gate it tuned is removed)

## See also
- [host-console](./host-console.md), [admin-and-moderation](./admin-and-moderation.md) (admin payments), [api-and-data](./api-and-data.md) (`ApiError`, the error interceptor), [dates-money-and-time-zones](./dates-money-and-time-zones.md)
- [Risk register](../../RISKS.md), [Frontend build plan](../../HostelHive-Frontend-Build-Plan.md)
