# Build the billing rewrite against the unmerged backend PR #26, host billing core (parts 0–6) first

**Status:** Done. Every part of Trello #93 has shipped, so this is history: [the area file](../../area/host-billing-and-subscription.md) describes the billing code as it is now. Backend PR #26 merged on 2026-10-04, and Safepay (PR #27) on 2026-10-10. The frontend landed in one PR per part (KratosvsEzio/hostelhive-FE):

| Part | Trello | PR |
|---|---|---|
| 1, remove the old order, contract and host-payments flow | #94 | #68 |
| 2, pricing page, billing screen and checkout | #95 | #85 |
| 3, Safepay payment step and return pages | #96 | #99 |
| 4, billing history and invoice detail | #97 | #109 |
| 5, downgrade, cancel and resume | #98 | #111 |
| 6, plan banners, CRM lock and the guest Book gate | #99 | #121 |
| 7, admin billing | #100 | #149 |
| 8, booking confirmation PDF | #101 | #163 |
| Section 10, saved card, auto-renewal, Safepay Subscriptions | #174 | #181, #188 |

**Area:** [host-billing-and-subscription](../../area/host-billing-and-subscription.md)

## Context
Trello #93 replaces the legacy order/contract/product flow (see the area file) with:
- plans
- one subscription per hostel
- invoices
- payment attempts

Amounts arrive as decimal strings with a `currency`, and the frontend never calculates money. On 2026-10-04 the backend was still open PR #26 (`feature/billing-core`), the dev API was unreachable, and Safepay returned 422 until its own PR.

## Decision
These are the user's answers recorded in the plan:
- **Build now, against PR #26.** Read the contract from the PR's source and verify it live once the backend is up. Adjust if PR #26 changes before merge.
- **Scope this run to parts 0–6:**
  - remove the old order flow
  - hostel country picker
  - public pricing page
  - host billing screen
  - checkout with bank transfer and Safepay wiring
  - billing invoices
  - grace and renewal banners
- **Separate later runs** for the CRM-feature lock (part 7) and admin billing (part 8).
- Billing invoices need their own route and folder (for example `subscription/invoices`), because `apps/web/src/app/features/host/invoices/` already means renter bills.

## Alternatives rejected
- **Wait for PR #26 to merge.** Not chosen. The user preferred to build against the branch and reconcile later.
- **Do all of #93 in one run.** Not chosen. Part 7 needs an error-interceptor change to keep `{code: "crm_required"}`, which the interceptor drops today, and part 8 is a separate admin surface.

## Consequences
When this was decided (2026-10-04), the plan recorded these open blockers, each to be stubbed, asked of the backend, or deferred. The part runs settled them; their run notes in `docs/implement/billing-frontend/` say how.
- `country_code` is neither permitted nor serialized by the hostels controller.
- There are no bank-account details for bank transfer.
- There is no Safepay `checkout_url` or return contract.
- There is no invoice PDF.
- The CanCan permission names for the new `Subscription` / `Invoice` abilities are unverified. The nav still uses `core:Hostel:subscription`.
- The card's 400 "You need to subscribe…" has no producer on that branch, but `isSubscriptionError` still matches it.

Part 1 (#94) removed the legacy model from `main`; the area file describes what is there now.

## Evidence
- [`docs/implement/93.md`](../../../implement/93.md), the run notes for Trello #93 (2026-10-04).
- Backend PR: `azeem-hamza/hostelhive` #26, open at the time of writing; merged 2026-10-04.
- Legacy code it replaces (deleted by #94 except `subscription.routes.ts`, now a placeholder):
  - `apps/web/src/app/services/subscription-api.ts`
  - `apps/web/src/app/services/subscription-store.ts`
  - `apps/web/src/app/services/products-api.ts`
  - `apps/web/src/app/util/product-pricing.ts`
  - `apps/web/src/app/features/host/subscription/subscription.routes.ts`
