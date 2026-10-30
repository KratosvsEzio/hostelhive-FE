# A lapsed hostel keeps Subscription, Profile and Bookings open; every other console page bounces to Subscription

**Status:** Superseded — by #94 (PR #68), which removed the client-side subscription gate this list tuned. The server alone now decides what a lapsed hostel can do; see the area file.
**Area:** [host-billing-and-subscription](../../area/host-billing-and-subscription.md)

## Context
The host console is paywalled. The shell sends any hostel without an active contract to `/host/:id/subscription`. Since Trello #81, expiry runs on a schedule, so lapsed hostels are common. Two problems came with that:
- A blanket bounce left an expired host circling. The paywall's own "complete hostel profile first" link landed back on the paywall.
- A lapse stops *new* bookings on the server, not the stays already booked.

## Decision
`OPEN_WHILE_LAPSED = ['subscription', 'profile', 'bookings']`, matched on the first page segment below the hostel by `opensWithoutSubscription`. So `subscription/checkout/:productId` is covered too.
- `subscription` is where the host pays.
- `profile` holds the hostel details a plan is bought against.
- `bookings` stays open because the server keeps listing, confirming, checking in and out, cancelling and settling existing bookings. A guest arriving tomorrow still has to be let in.

The Bookings page shows a "lapsed" banner. The new-booking drawer turned the server's subscription refusal into a renew notice; that notice was retired in Trello #199, since the plan lock now replaces the page on that refusal.

## Alternatives rejected
- **Bounce everything except the subscription page.** This is the circling described above.
- **Hide Bookings while lapsed.** The server still serves those actions, and the host still has guests to check in.
- **Read the third URL segment to find the page.** This was the earlier implementation. It silently broke when English moved to `/en/…`, so the check now goes through `hostPagePath` / `routePath`.

## Consequences
- The 2026-10-04 plan for the billing rewrite flags this list as conflicting with its "active and grace keep working" rule ([`docs/implement/93.md`](../../../implement/93.md)). Expect it to change when #93 lands.
- `hostels/new` is outside the shell, so `createHostelGate` repeats the check there. Otherwise an expired host could keep working by creating another hostel.

## Evidence (before #94; these lines no longer exist on `main`)
- `apps/web/src/app/layout/host-shell/host-route.ts` — `OPEN_WHILE_LAPSED` and its doc comment.
- `apps/web/src/app/layout/host-shell/host-shell.ts` — `runSubscriptionGate`, `enforceGate`, `isExemptRoute`.
- `apps/web/src/app/features/host/host.routes.ts` — `createHostelGate`.
- `apps/web/src/app/features/host/bookings/bookings.ts` (`lapsed`), `apps/web/src/app/features/host/bookings/booking-form-drawer/booking-form-drawer.ts` (`needsSubscription`).
- Commit 3f766f0 "feat(host): time zones, mark as paid, occupancies, expired subscriptions (Trello #81)"; PR #42 (section "Expired subscriptions").
