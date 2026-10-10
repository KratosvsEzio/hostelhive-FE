# Billing-cycle gates are strict on the value they name and fail toward showing the page

**Status:** Accepted
**Area:** [host-console](../../area/host-console.md)

## Context
A hostel bills either by the month (tenancies) or by the night (bookings), and half of the console only makes sense for one of them:
- Bookings only for nightly hostels.
- Tenants, Utilities and Mess only for monthly ones.

`billing_frequency` comes from the hostel list endpoint and can be missing. The commit calls it "only as reliable as the index serializer".

## Decision
- `HostPropertyStore.isMonthlyBilled()` is true only for `'month'`, and `isNightlyBilled()` only for `'night'`. Neither is the negation of the other.
- `bookingsGate` turns a hostel away only when it is monthly. `monthlyOnlyGate` turns it away only when it is nightly. `hostNav` follows the same rule.
- A hostel with an unknown cycle keeps every page.
- The bottom tab bar's third slot defaults to Bookings. The page that loses the slot is still one tap away under More.

## Alternatives rejected
- **Gate on `!isMonthlyBilled()`.** A hostel whose cycle failed to arrive would lose Utilities and Mess. Hiding a working page costs a host their job; showing an unneeded one costs one empty list.
- **Only hide the nav entries.** Typed URLs, bookmarks and links shared from a hostel billed the other way would still land on an empty page whose form writes records nothing reads. So the routes are gated too.

## Consequences
- A test asserts the two gates can never both turn away the same hostel (`apps/web/src/app/features/host/host.routes.spec.ts`).
- "Fixing" either predicate into the negation of the other breaks mutation-checked tests named in the commits below.

## Evidence
- `apps/web/src/app/services/host-property-store.ts` — doc comments on `isMonthlyBilled` / `isNightlyBilled`.
- `apps/web/src/app/features/host/host.routes.ts` — `bookingsGate`, `monthlyOnlyGate`.
- `apps/web/src/app/layout/host-shell/host-nav.ts` — `hostNav`, `hostTabBar`.
- Commits 0d5e61a "feat(host): keep Utilities and Mess to the hostels that bill by the month", cfc7957 "feat(host): keep Tenants to the hostels that sign tenancies", 6b168f7 "fix(mobile): give the tab bar's third slot to whichever page the hostel uses".
