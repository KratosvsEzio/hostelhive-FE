# Host billing and subscription

How a host pays HostelHive for a hostel, and how an unpaid hostel is fenced off. What is on main is the **legacy contract/product model**: a hostel holds contracts, and products ("Listing", "Featured Boosted", "Lead Radar") are bought through orders. A full rewrite to plans → subscription → invoices (Trello #93) is planned but not built. Renter rent and utility bills belong to the [host console](./host-console.md), not to this area.

## Where it lives
- `apps/web/src/app/services/subscription-store.ts` — `SubscriptionStore`: one cached contract (`contract`, `featuredUntil`, `status`) for one hostel; `isActive()`, `isLoadedFor(id)`, `load`, `refresh`, `clear`.
- `apps/web/src/app/services/subscription-api.ts` — `SubscriptionApi`. **Live:** `currentSubscription` (`GET /api/hostels/:id/current_subscription`), `paymentHistory` (`GET /api/host/hostels/:id/payments`), `createOrder` (`POST /api/hostels/:id/orders`). **In-memory fixture state machine:** `plans`, `checkout`, `activate`, `renew`, `cancel`, built on `apps/web/src/app/services/subscription.fixtures.ts`.
- `apps/web/src/app/services/products-api.ts` — `ProductsApi.list()` → `GET /public/products`.
- `apps/web/src/app/util/product-pricing.ts` — `DISCOUNT_PURCHASE_LIMIT` (3), `countPaidListingPurchases`, `hasListingDiscount`, `effectivePrice`.
- `apps/web/src/app/util/subscription-error.ts` — `isSubscriptionError(err)`.
- `apps/web/src/app/features/host/subscription/` — `subscription.routes.ts` with:
  - `''`: the `Subscription` plans & billing page
  - `current`: redirects to `''`
  - `payments`: `PaymentHistory`
  - `checkout/:productId`: `SubscriptionCheckout`
- `apps/web/src/app/layout/components/subscription-gate/subscription-gate.ts` — `<hh-subscription-gate>`, the inline paywall card.
- `apps/web/src/app/layout/components/subscription-loading/subscription-loading.ts` — the full-screen "Loading your dashboard…" overlay.
- `apps/web/src/app/layout/host-shell/host-shell.ts` and `apps/web/src/app/layout/host-shell/host-route.ts` — the shell gate and its exempt pages.
- `apps/web/src/app/features/public/onboarding/onboarding-payment/onboarding-payment.ts` — the `/host/listings/new/payment` page reached from the onboarding wizard.

## How it works
- **The shell gate.**
  - On entering a hostel, `HostLayout.runSubscriptionGate` shows `SubscriptionLoading` for at least 2 s.
  - It loads `SubscriptionStore` for the route's hostel. If `isActive()` is false, it navigates to `/host/:id/subscription`.
  - Later navigations re-check through `enforceGate`.
  - Error toasts are muted while it decides (`NotificationService.muteErrors`), because the page behind the overlay has already fired requests the API rejects.
- **What "active" means.** `currentSubscription` picks the contract whose `status.slug` is `active`, otherwise the first. It marks the contract `expired` once `subscription.active_until` is past. A failed load leaves `isActive()` false, so a network error bounces the host to the subscription page as well.
- **Exempt pages.** `opensWithoutSubscription` lets `subscription`, `profile` and `bookings` open while the plan has lapsed. See the decision below.
- **Creating a hostel.** `createHostelGate` applies the same check to `/host/hostels/new`, which sits outside the shell. A host with no hostels always passes (`apps/web/src/app/features/host/host.routes.ts`). After create, `NewHostel` lands on the subscription page (`apps/web/src/app/features/host/new-hostel/new-hostel.ts`).
- **Inline paywall.** Overview, rooms, tenants, invoices, utilities and add-bill catch a failed load with `isSubscriptionError` and render `<hh-subscription-gate>`. The booking form drawer shows a renew notice instead (`apps/web/src/app/features/host/bookings/booking-form-drawer/booking-form-drawer.ts`).
- **Buying.**
  - The plans page combines `currentSubscription`, `ProductsApi.list()` and the first page of `paymentHistory`. The listing discount applies while fewer than 3 paid "Listing" purchases are visible.
  - A product card opens `checkout/:productId`, where `pay()` calls `createOrder`, clears the store and returns to the plans page.
  - No payment gateway is wired.

> **Pending — not on main.** The billing rewrite (Trello #93) exists only as a plan, in [`docs/implement/93.md`](../../implement/93.md); none of it is implemented. It is planned against **unmerged backend PR #26** (`feature/billing-core`). That PR replaces orders, contracts and products with plans → one subscription per hostel → invoices → payment attempts, and the frontend never calculates money.
> - **The user scoped the first run to parts 0–6:**
>   - remove the order flow
>   - ISO country picker
>   - public pricing page from `GET /api/plans`
>   - billing screen from `GET /api/hostels/:id/billing`
>   - checkout with bank transfer, and Safepay wiring
>   - billing invoices
>   - grace and renewal banners
> - **Later runs:** CRM-feature lock and admin billing.
> - **Recorded blockers:**
>   - The backend does not yet permit or serialize `country_code`.
>   - There are no bank-account details for bank transfer.
>   - There is no Safepay `checkout_url` (422 "Online payment isn't available yet").
>   - There is no invoice PDF.
>   - The new CanCan permission names are unverified.
> - The plan is at phase 1a. No implementation branch exists. Every file listed above is still the legacy model.

## Reuse, don't rebuild
- `SubscriptionStore`. Call `clear()` (or `refresh(id)`) after anything that changes the plan; otherwise the shell keeps bouncing on the stale contract (comment in `apps/web/src/app/features/host/subscription/subscription-checkout/subscription-checkout.ts`).
- `isSubscriptionError` with `<hh-subscription-gate [feature]>` for a page that can be paywalled.
- `opensWithoutSubscription` for any new exemption. Do not hand-roll URL checks.

## Traps
- **Buttons that do nothing real.**
  - "Re-subscribe" and "Simulate payment success" on the plans page call `SubscriptionApi.renew()` / `activate()`. Those mutate an in-memory fixture contract that has nothing to do with the server's, then the page re-fetches the real one (`apps/web/src/app/features/host/subscription/subscription/subscription.ts`, `apps/web/src/app/features/host/subscription/subscription/subscription.html`).
  - Onboarding's `pay()` is a `setTimeout` with a TODO (`apps/web/src/app/features/public/onboarding/onboarding-payment/onboarding-payment.ts`).
- **The discount count is approximate.** It only sees the first page of 10 payments, so a long history can keep offering a spent discount (doc comment on `paymentHistory`).
- **The store holds one hostel.** `isActive()` does not say which hostel it is for. The Bookings "lapsed" banner reads `status() === 'ready' && !isActive()` without checking the id. Because `bookings` is exempt, the shell never loads the store there, so a direct visit shows no banner (`apps/web/src/app/features/host/bookings/bookings.ts`).
- **`isSubscriptionError` is broad.** It also matches a 403 "not authorized" and any message containing "subscri". A plain permission refusal can therefore render the paywall (`apps/web/src/app/util/subscription-error.ts`).
- **Feature copy is hard-coded twice.** Product feature lists are hard-coded English keyed by product name, in both `apps/web/src/app/features/host/subscription/subscription/subscription.ts` and `apps/web/src/app/features/host/subscription/subscription-checkout/subscription-checkout.ts`.
- **Subscription has no `permissionGuard`.** The nav entries are gated on `core:Hostel:subscription`, but the `subscription` route has no guard (`apps/web/src/app/features/host/host.routes.ts`).

## Decisions
- [A lapsed hostel keeps subscription, profile and bookings open](../decisions/host-billing-and-subscription/lapsed-hostel-keeps-three-pages-open.md)
- [Billing rewrite built against unmerged backend PR #26, parts 0–6 first](../decisions/host-billing-and-subscription/billing-rewrite-against-unmerged-backend.md) (Pending)

## See also
- [host-console](./host-console.md), [admin-and-moderation](./admin-and-moderation.md) (admin contracts and payments), [api-and-data](./api-and-data.md) (`ApiError`, the error interceptor), [dates-money-and-time-zones](./dates-money-and-time-zones.md)
- [Risk register](../../RISKS.md), [Frontend build plan](../../HostelHive-Frontend-Build-Plan.md)
