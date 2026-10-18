# Host billing and subscription

How a host pays HostelHive for a hostel, and how an unpaid hostel is fenced off. The billing rewrite (Trello #93, parts #94–#101) is on `main`: plans, one subscription per hostel, invoices and payment attempts, paid through Safepay. Trello #174 adds a saved card with automatic renewal (PR A) and Safepay Subscriptions with a one-time free trial (PR B). Renter rent and utility bills belong to the [host console](./host-console.md), not to this area.

## Where it lives
- `apps/web/src/app/features/host/subscription/subscription.routes.ts` — the billing screen (`/host/:id/subscription`), the payment step (`pay/:invoiceId`), invoice history and invoice detail.
- `billing-page.ts/.html` — current plan (`current-plan-card.ts`), the unpaid invoice (`payment-due.ts`), the saved card and auto-renew switch (`saved-card.ts`, block `id="saved-card"`) and one card per plan.
- `payment-step.ts/.html` — pay at Safepay (optionally saving the card), or charge the saved card without leaving.
- `payment-return.routes.ts` (mounted at `/billing/payment` in `app.routes.ts`) — Safepay's return pages. `?invoice=` goes to `payment-success.ts` / `payment-cancelled.ts`; `?card=` or `?subscription=` with no invoice goes to `billing-return.ts` (states in `billing-return-states.ts`).
- `safepay-checkout.ts` — every start that leaves for Safepay (`start`, `startCardSave`, `startSubscribe`), the per-tab return stash, `returnParam()` and `payErrorOutcome()`.
- `invoice-poll.ts` — `pollUntil()` / `pollInvoice()`: fetch now, then every 2.5 s for up to 60 s, never overlapping.
- `apps/web/src/app/services/billing-api.ts`, `host-billing-store.ts` (the console's billing for the shown hostel), `apps/web/src/app/shared/billing/billing-banner.ts` (banner and access logic) and `layout/components/billing-banner/billing-banner.ts`.
- `apps/web/src/app/layout/components/subscription-gate/subscription-gate.ts` and `apps/web/src/app/util/subscription-error.ts` — the inline paywall for a refused request.
- `apps/web/src/app/shared/notifications/notification-types.ts` — icon and label per notification type, shared by the notifications page and the bell.

## How it works
- **The server decides.** Prices, prorations, plan actions, `payment_methods` and `auto_renew` all come from `GET …/billing`; the frontend never calculates money, passes ids through as returned, and shows a 422's `errors[0]` verbatim.
- **Banners and the access lock** come from `HostBillingStore` through `bannerFor()` / `deriveAccess()`. With auto-renew on, renewal banners say the saved card will be charged instead of asking to renew, and past due offers Update card (`#saved-card`) plus Pay.
- **Saved card + auto-renew.** `auto_renew` is server-derived: true only with a saved card, no cancel at period end, and a plan Safepay does not bill. It stays false while cancelling even after a successful PUT, so the switch is bound to the server value (`linkedSignal` in `billing-page.ts`), reverted on failure, and disabled while cancelling. The switch shows only on live plans (`active` / `past-due`); the block shows for any subscription Safepay does not bill.
- **Async confirmations.** A card save and a subscription start finish on Safepay's webhook, so `?card=saved` and `?subscription=started` poll billing (2.5 s / 60 s) until the card differs from the stashed previous one, or `isSafepayBilled()` holds, then say honestly that it can take up to an hour, with Check again.
- **Paying with the saved card** asks for confirmation, then may come back `pending`; the step polls `refresh` and never shows paid until the invoice is paid. A decline shows the bank's reason with Update card and Pay with another card.
- **A re-opened checkout keeps its first `save_card` choice** on the server, so the payment step hides the save-card tick while a Safepay payment is pending. It cannot tell a pending saved-card charge from a pending checkout (both are `safepay`), so the note shows for both.
- **`isSafepayBilled(sub)`** (`billing-labels.ts`) is `billed_by === 'safepay_subscription'` and a live status (`active` / `past-due`), because `billed_by` outlives the plan. Card options are hidden on such plans.
- **Safepay Subscriptions** (Safepay bills the plan monthly instead of HostelHive invoices):
  - **Start.** Every `buy` plan card (no live plan) has a secondary button under Choose plan: "Start {n}-day free trial" when `plans[].trial_days > 0`, else "Subscribe through Safepay", with a line that Safepay asks for a Safepay login. It calls `SafepayCheckout.startSubscribe` (`POST …/subscription/safepay`, permission `core:Invoice:create`); a refusal shows in the card's checkout-error area (422 verbatim, our copy for 403). `planButton()` sets `subscribe` only for `buy`.
  - **Open invoice.** A trial or subscription does not close an unpaid invoice, so with `open_invoice` set the page confirms first; while `open_invoice.awaiting_verification` (bank transfer under review) the button is disabled.
  - **Live Safepay-billed plan** (`isSafepayBilled`; trial = `isSafepayTrial`, `safepay_status === 'TRAILING'`): the current-plan card says "Billed monthly by Safepay" and "Free trial until {current_period_end}" (or "Renews on"), never "Renews automatically". Saved card, auto-renew switch and the payment-due auto-charge line are hidden. `planButton()` turns every plan card into a disabled Current plan (own plan) or Unavailable, whatever action the server sent; the server's reason is said once above the grid (`data-testid="safepay-notice"`). Cancel and Resume stay; cancelling during a trial uses trial copy.
  - **Banners** never offer Renew for a live Safepay-billed plan: renewing, renew-due and grace-over keep their copy with Go to billing; past due reads "Safepay couldn't charge your card. Your hostel stays live until {grace}." with Go to billing. Cancel-pending keeps Resume.
- **Invoice attempts** label `initiated_by` `schedule` ("Charged automatically") and `upgrade` ("Saved card"). Notifications `card_declined` / `card_expiring` show the server's message as is, with no link (the notification carries no hostel id).
- **Inline paywall.** Pages catch a refused load with `isSubscriptionError` and render `<hh-subscription-gate>`.

## Reuse, don't rebuild
- `SafepayCheckout` for any start that leaves for Safepay; `pollUntil` for any wait on a webhook; `payErrorOutcome` for a refused start.
- `isSubscriptionError` with `<hh-subscription-gate [feature]>` for a page that can be paywalled.

## Traps
- **The router does no anchor scrolling** (`core/scroll-reset.ts`), so `billing-page.ts` scrolls to `#saved-card` itself.
- **`hh-toggle` flips itself on click** before the server answers; mirror the flip and write the server value back on error.
- **`isSubscriptionError` is broad.** It also matches a 403 "not authorized" and any message containing "subscri".
- **The billing page has no `permissionGuard`, on purpose.** The paywall card links every host there (comment in `subscription.routes.ts`).
- **Never test `billed_by` alone.** It stays `safepay_subscription` after the plan expires, until an invoice is paid; use `isSafepayBilled()`, so an expired Safepay plan gets the invoice flows back.
- **A past-due Safepay-billed plan is a dead end on the page.** Every plan is unavailable and cancel needs `active`, so the host can only wait for Safepay's retry (code-proven, not seen live).
- **Notification labels are hard-coded English** (`notification-types.ts`), as is the paywall card's benefits list.

## Decisions
- [Billing rewrite built against backend PR #26, host billing core first](../decisions/host-billing-and-subscription/billing-rewrite-against-unmerged-backend.md)
- [A lapsed hostel keeps subscription, profile and bookings open](../decisions/host-billing-and-subscription/lapsed-hostel-keeps-three-pages-open.md) (Superseded by #94)
- Run records: [`docs/implement/93.md`](../../implement/93.md) and `docs/implement/billing-frontend/94.md`–`101.md`, `174.md` (D1–D11 for the saved card).

## See also
- [host-console](./host-console.md), [admin-and-moderation](./admin-and-moderation.md) (admin billing), [api-and-data](./api-and-data.md) (`ApiError`, the error interceptor), [dates-money-and-time-zones](./dates-money-and-time-zones.md)
- [Risk register](../../RISKS.md), [Frontend build plan](../../HostelHive-Frontend-Build-Plan.md)
