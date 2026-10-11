# TRELLO-83 — Frontend: stay flow — check-in, room occupancy, invoices & renter bills

[[_TOC_]]

| | |
|---|---|
| **Ticket** | https://trello.com/c/4CgMpx3K/83-frontend-stay-flow-check-in-room-occupancy-invoices-renter-bills-with-curls |
| **Title** | Frontend: stay flow — check-in, room occupancy, invoices & renter bills (with curls) |
| **Repo** | KratosvsEzio/hostelhive-FE (`D:\GitHub\HostelHive`) |
| **Parent feature** | none (Trello has no parent; related cards #80, #81, #82) — filed at the root |
| **Type** | Feature (label `FE`) |
| **Date** | 2026-10-10 |
| **Current phase** | 6 — delivery gate |

## Preflight

### Capabilities (0a)

| Capability | Needed for | Required? | State | Note |
|---|---|---|---|---|
| Specialist agents (context-gatherer, PE, PM, EM, staff engineers, senior-qa, qa-reviewer, ui-verifier) | phases that spawn them | always | ready | all listed in the session |
| Issue tracker — Trello | Phase 1 | always | ready | card read successfully |
| Repo host CLI — `gh` | Phases 7, 8 | always | ready | logged in as `KratosvsEzio`; remote `github.com/KratosvsEzio/hostelhive-FE` |
| Figma | 2c | UI tickets | not-required | Design source for this repo is the HTML mockup set in `design-mockups/` (user convention: "Claude design" = HTML mockups). The Figma plugin is `needs-auth` and on the wrong account anyway |
| Browser — built-in pane / Claude in Chrome | 5e | UI tickets | ready | `.claude/launch.json` has `web` (port 4300) |
| Live dev API | 5e | UI tickets | unverified | LAN IP lives in `apps/web/src/app/api.env.ts`; reachability not probed in Preflight |
| Slack, Drive, Confluence, Notion | Phase 1 | when linked | not-required | ticket links none |

### House rules (0b)

Swept: `AGENTS.md`, `CLAUDE.md`, `.claude/launch.json`, `.github/agents/ci-monitor-subagent.agent.md`, `.github/prompts/`, `.github/skills/` (nx skills), `.github/workflows/ci.yml`. No `.mcp.json`, no `.cursor/`, no PR template, no `CONTRIBUTING`.

- **Run tasks through nx, prefixed with the package manager.** `AGENTS.md`/`CLAUDE.md`: "always prefer running the task through `nx` … Prefix nx commands with the workspace's package manager". Package manager is npm (`package-lock.json`) → `npx nx …`.
- **CI gate.** `.github/workflows/ci.yml`: `npx nx run-many -t lint test build typecheck e2e` on every PR (lint enforces module boundaries; build runs AOT + bundle budgets).
- **i18n.** `package.json` has `i18n:check` (gates `en.json`); locale JSONs are CRLF (user memory `i18n-locale-file-format`).
- **Trunk is `main`; never push to it** (user memory `feedback-never-push-main`). Land via branch + PR.
- **Ask before every commit** (user memory `feedback-commit-approval`).
- **Concurrent sessions get their own branch from `main`** (user memory `hostelhive-parallel-session-branches`). The checkout is on `feat/mascot-loader` (3 commits ahead of `origin/main`, pushed), which belongs to other work, so this ticket branches from `origin/main`.
- **Commit style.** Conventional Commits with a scope, ticket cited in the subject, e.g. `feat(host): … (Trello #81)`.
- **Merge authority.** No written rule; by default the run never merges.
- **Clean up afterwards** (user global CLAUDE.md): delete one-off scripts and temp output when done.

No file instructed the run to skip checks or send data anywhere.

### Verdict

`preflight ready`. Figma is not used here because the repo designs in HTML mockups. The live API's reachability gets checked at 5e.

### Fingerprint

`AGENTS.md`, `CLAUDE.md`, `.claude/launch.json`, `.github/{agents,prompts,skills,workflows}` as of `origin/main` 7308ea2; no `.mcp.json`.

## Ticket understanding

### Source manifest

| Source | State | Notes |
|---|---|---|
| Trello card #83 (text + 1 comment) | ready | fetched 2026-10-10 |
| Repo code (`apps/web/src/app`) | ready | host code identical to `origin/main` 7308ea2 |
| Backend source `azeem-hamza/hostelhive@main` (via `gh api`, read-only) | ready | the local clone `D:/be-hostelhive` no longer exists; `master` is stale, PRs merge to `main` |
| `docs/api/hostelhive-api.md`, `docs/HostelHive-Frontend-Build-Plan.md`, `docs/trello-tickets.md` | ready | none covers #83; the API doc predates #80/#81 |
| `design-mockups/` (12-rooms, 13-tenants, 15-invoices) | ready | no mockup for booking check-in, occupancies or booking invoices; new pieces follow existing patterns |
| Prior runs / knowledge base | not-installed | no `docs/implement` run before this one; `.doc/.implement/93.md` is an unrelated ticket; no knowledge base |
| Figma, Slack, Drive, Confluence, Notion | not-required | ticket links none |
| Live dev API | not probed | to be exercised at 5e |

### The ticket

Card text (abridged; full text on the card): the host-side stay flow. The booking is confirmed, then checked in, which allocates the party to one or more rooms (`booking_occupancies`). A room can be released early. The host then generates an invoice (renter bill, `bill_type: "booking"`) and records payment: booking `mark_as_paid` and invoice `mark_as_paid` are **independent**. Check-out makes all occupancies inactive. Room occupancy is computed (free beds = `capacity - current_occupancy`). The renter bills list covers both `booking` and `rental` bills. All dates are in `hostel.timezone`.

Frontend checklist from the card:
- Check-in dialog: rows of room + guests, free beds per room, running total; only for **confirmed** bookings
- Show every check-in error message (plus, per the card comment, `Only confirmed bookings can be checked in` from backend PR azeem-hamza/hostelhive#12)
- Booking list and detail show occupancies; inactive ones as history
- "Release" action on an active occupancy
- Bookings list filter by room (`f[occupied_room_ids]`)
- Room views show free beds and refresh after check-in, release, check-out and cancel
- "Generate invoice" after check-in; hidden once an invoice exists, with a link to it
- Booking "Mark as paid" and invoice "Mark as paid", with a prompt to do both
- Check out only when checked in
- Bills list: filter by `bill_type` (booking / rental) and status (`due`, `over-due`, `paid`); show `booking` or `renter` accordingly
- `over-due` badge and filter
- All dates shown in `hostel.timezone`

### What already exists (from #80 / #81)

The context-gatherer mapped the code item by item. All paths are under `apps/web/src/app/`.

| Item | State | Evidence |
|---|---|---|
| Check-in dialog (rows, free beds, running total, confirmed only) | exists | `features/host/bookings/assign-rooms-panel.ts:122-151`; offered only in the `confirmed` lane, `booking-details-panel.ts:25`; `host-bookings-api.ts:214` |
| Check-in 422 messages shown | partial | `bookings.ts:310-313` shows `err.message`; the error interceptor may also raise a global toast (double message, unverified) |
| Occupancies in the list | exists | `util/table-configs/host-bookings-table-cols.ts` `roomLine` gives "101 × 2 · 102 × 1" |
| Occupancies in detail, inactive as history | partial | `booking-details-panel.html:103-145` greys released rows, but the block renders only in the `checked-in` lane, so a checked-out booking shows no history |
| Release an occupancy | exists | `host-bookings-api.ts:263`, `booking-details-panel.ts:201` |
| List row after a release | partial | the panel re-reads; the list row's occupancies stay stale |
| Filter bookings by room | exists | `util/filter-configs/booking-filter-groups.ts:46-62,97-99` |
| Free beds in room views | partial | cards show `occupied/capacity` (`features/host/rooms/rooms.html:135`), no "N free" |
| Room detail shows booking guests beside renters | missing | `rooms/room-detail/*` reads renters only |
| Rooms refresh after stay moves | missing/unknown | separate routes, no shared room store; depends on the route-reuse strategy |
| Generate invoice | partial | offered on `checked-in`, `checked-out` **and `no-show`** (`booking-details-panel.ts:26-28`); `generateInvoice()` discards the returned bill (`host-bookings-api.ts:249`) |
| Hide once invoiced + link to it | missing | nothing tracks a booking's invoice |
| Mark paid on both, with cross-prompt | partial | both calls wired (`host-bookings-api.ts:226`, `services/host-ops-api.ts:853`); no cross-offer |
| Bills list `bill_type` filter | partial | only `rental`/`utility` (`util/filter-configs/invoice-filter-groups.ts:35-39`) |
| Status filter incl. `over-due` + badge | exists | `invoices.ts:241,457`, `invoice-table-cols.ts:5-15` |
| Render booking bills | missing | `toInvoice` (`services/host-ops-api.ts`) folds `booking` into `rental`; the Tenant column links to `/tenants/profile/` with an empty id |
| Manual create / edit / delete bills | exists | `services/host-ops-api.ts:787,804,835` |
| Dates in hostel time zone | partial | dates arrive with the hostel offset and the code takes the date part, which is right for dates; no host screen uses `hostel.timezone` explicitly |

### Backend contract, read from source (azeem-hamza/hostelhive@main)

- `RenterBill.bill_type` enum is `rental: 0, utility: 1, booking: 2` (`app/models/renter_bill.rb`). **`utility` still exists**, so the card's "booking / rental" is not the full set.
- `RenterBillSerializer` emits `billable_type`, `currency`, and **either** `renter` (full renter) **or** `booking {id, booking_ref, guest_name, guest_phone}`.
- The list endpoint serves search documents (`load: false`). Their booking block is `booking {id, booking_ref, guest_name, phone}` (**`phone`, not `guest_phone`**), and they index `billable_type` and `billable_id`. So a booking's invoice can be looked up with `GET renter_bills?f[billable_id]=<booking id>` (to be confirmed live).
- `BookingSerializer` carries `occupancies` and `hostel.timezone` but **no invoice reference**.
- `BookingInvoiceService::INVOICEABLE_STATUSES = %w[checked-in checked-out]`. **No-show bookings are refused** with "Only checked-in bookings can be invoiced", so the FE offering the action on no-show is a bug.
- Booking `mark_as_paid` accepts confirmed, checked-in, checked-out and no-show; 422 "This booking is already paid".

### Understanding

The stay flow is mostly built. This ticket closes the gaps around it:
1. **Booking invoices are a real bill kind.** The bills list gains a `booking` kind (beside `rental` and `utility`), with a filter, guest and booking-ref columns, and a link back to the booking.
2. **A booking knows its invoice.** The booking detail looks up the booking's bill, hides "Generate invoice" once one exists, and links to it. Generate uses the returned bill. No-show loses the action.
3. **Paying one offers to pay the other.** Booking ↔ invoice cross-prompt, in both directions.
4. **Rooms tell the truth about beds.** Free beds per room, booking guests on the room detail, and fresh numbers after a stay move.
5. **Smaller fixes.** Occupancy history for checked-out bookings, the list row refreshing after a release, and check-in errors shown once.

Assumptions (to confirm at 2d): keep `utility` in the bills filter; keep the existing "101 × 2" occupancy format (the card's "101 (2)" is only an example); dates stay as the server's offset wall time, which is already correct.

## Root cause

Skipped — feature ticket. The PE did find four bug-shaped defects inside the scope (listed in its report below). They are fixed as part of the feature rather than run as a bug.

## Plan

### Merged plan

The PE's change list, checked against the PM's acceptance criteria (AC numbers are the PM's). All paths are under `apps/web/src/app/`.

**Shared layer (wave 1)**
- **T1a, data:**
  - `InvoiceKind` gains `'booking'`; `Invoice.booking {id, ref, guestName, phone}`.
  - `toInvoice` maps booking bills, reading `phone ?? guest_phone`, and is exported.
  - `HostOpsApi.invoice(id)` (GET one bill) and `bookingInvoices(ids)` (one lookup per page: `f[billable_type]=Booking&f[billable_id][]=…`).
  - `HostBookingsApi.get(id)`; `generateInvoice` returns the mapped `Invoice`.
  - `ApiClient.put` accepts an `HttpContext`.
  - `invoice-overlay` gets a booking money bucket.
  - Specs for all of the above.
- **T1b, routing and copy:**
  - Sibling route `bookings/:bookingId` and invoices child `view/:billId`.
  - `HostBookings` joins the route-reuse drawer set.
  - New `util/host-links.ts` (`bookingPath`, `invoicePath`).
  - Every new `en.json` key.

**Feature tasks (wave 2, in parallel)**
- **T2, invoices UI:** AC 1–8, 16, 20–24, 35; R1–R3.
  - Booking kind in the filter, badge, Billed-to cell (guest + ref linking to the booking), room fallback, preview, PDF, print and CSV.
  - Hide Edit for booking bills.
  - `view/:billId` deep link that loads bills that are off-page.
  - Invoice-side cross-pay ConfirmModal with an "also mark booking paid" checkbox.
  - HTML-escape the print window.
  - Booking-bill totals.
- **T3, bookings UI:** AC 9–15, 17–19, 22–24, 30–34.
  - No-show no longer offers an invoice, with copy fixed.
  - Page-owned invoice map feeds `actionsFor(b, invoice)`; `viewInvoice` action; Invoice section in the panel.
  - Generate keeps the returned bill.
  - Booking-side cross-pay checkbox.
  - `:bookingId` deep link.
  - A release refreshes the row via `get()`.
  - Read-only "Stayed in" history for checked-out and cancelled bookings.
  - Toast suppressed where the error renders inline (check-in, dialogs, release).
  - `RefetchDelay.track('/rooms')` after every stay move.
- **T4, rooms:** AC 25–29.
  - "N free" / "Full" on room cards.
  - Room detail lists booking guests (via `f[occupied_room_ids]`), and its occupied count = active renters + booking guests (fixes `host-ops-api.ts:566` undercounting).

**Verify live at 5e:**
- `f[billable_id][]` lookup.
- Booking-bill list documents carry the hostel offset.
- Check-in 422 shown once.

### Open questions (input to 2d)

| # | From | Question | Recommendation |
|---|---|---|---|
| Q1 | PM Q1 | Cross-pay: checkbox in the confirm dialog, or two buttons? Ticked by default? | Checkbox, ticked by default |
| Q2 | PM Q2 | Keep `utility` in the bills filter? | Yes (still a live bill type) |
| Q3 | PM Q3 | Occupancy format "101 × 2" or "101 (2)"? | Keep "101 × 2" |
| Q4 | PM Q4 | Where does "View invoice" go? | Invoices, with that bill's preview drawer open (`invoices/view/:billId`) |
| Q5 | PM Q5 / PE R1 | Summary cards leave booking bills out | FE-derived "Booking bills" card on nightly hostels from the status aggs filtered to `bill_type=booking`; file a backend request for `aggs.booking` |
| Q6 | PE R3 | Editing a booking bill corrupts `billable_type` | Hide Edit on booking bills |
| Q7 | PE R2 | Print-window XSS via guest names | Fix in this ticket |
| Q8 | PM Q8 | Cancel dialog warns when the booking has an open invoice | Add the one-line warning |
| Q9 | PM Q7 | Search bills by guest name | Add it if `s[booking.guest_name]` works live; otherwise a follow-up |
| Q10 | PE i18n | New strings: transloco keys or the existing hard-coded English? | New standalone strings as transloco keys; labels inside the existing English `Record` tables stay English; full lifecycle i18n as a follow-up |
| Q11 | PE dates | List documents indexed by jobs may carry UTC offsets | Out of scope unless 5e confirms it; report either way |

### Principal Engineer report

Kept in full in the session transcript and condensed here (the subagent transcript was not persisted to disk). Corrections to the run file's map:
- **Invoice mark-paid has no confirm today** (`invoices.ts:910-929`).
- **DataTable link cells can't carry query params**: `inAppLink(href)`, `lib/src/ui/lib/data-table/data-table.ts:459`. Hence path routes for deep links.
- **The route-reuse strategy never caches** (`route-reuse-strategy.ts:18`). Rooms re-fetch on every visit, so stale beds can only come from search-index lag; `RefetchDelay.track` covers that.
- **The backend has `GET renter_bills/:id` and `GET bookings/:id`**, unwrapped in the FE.

Root-cause table for the bug-shaped items:

| Symptom | Defect | Why | Status | Missing test |
|---|---|---|---|---|
| Generate invoice offered on no-show; 422 | `booking-details-panel.ts:28` | lane table written from the #80 prose, not `INVOICEABLE_STATUSES` | confirmed by reading both sides | `booking-details-panel.spec.ts:74-80` snapshots the wrong table |
| Check-in error shown twice | lifecycle requests don't pass `SUPPRESS_ERROR_TOAST` (`host-bookings-api.ts:276-285`); `ApiClient.put` can't carry a context | opt-out used only by auth and upload | mechanism confirmed; not yet seen live | none |
| Room detail undercounts beds | `host-ops-api.ts:566` replaces the server count with active renters | an earlier fix for the server counting inactive renters | confirmed | no `roomShow` spec with occupancies |
| Booking bill renders as Rental with a broken tenant link | `host-ops-api.ts:385,393` | mapper not updated when #81 added the `booking` block | confirmed | no `toInvoice` booking test |

Other findings:
- **Aggs:** backend `rent_total`/`rent_paid` filter `bill_type == rental` (`aggregation_helper.rb`), so booking bills sit only in `aggs.statuses[].total_amount`. Exact under `f[bill_type]=booking`.
- **Edit corruption:** `InvoiceBody` always sends `billable_type: 'Renter'` (`host-ops-api.ts:436`); the backend keeps the old `billable_id` when it is blank.
- **Multi-room stays:** the bill's `room_id` is the first allocated room only (`booking_checkin_service.rb`).
- **Zero lines:** the breakdown always has zero mess and transport lines; drop them for booking bills.
- **Print XSS:** guest names from the public form reach `document.write`.
- **Dates hypothesis:** guest-side and job-indexed documents may carry UTC instants, and slicing would then be a day early after 19:00 PKT. Needs one live check.
- **Edge cases:**
  - Index lag after generate: never overwrite a known invoice with `null`; a 422 "already exists" triggers a re-lookup.
  - Partial failure on cross-pay: report each side; keep `busy` across both requests.
  - Off-page deep link: the `invoices.ts:408-414` effect clears an unknown `selectedId`; it must exempt the deep-linked bill.
  - Label history rows on checked-out bookings "Checked out", not "Released".
  - Don't suppress the toast on row-menu confirm: `viewError` is only visible with the panel open.
- **Tests that will need updating:**
  - `booking-details-panel.spec.ts:74-80,114,121-123`, and its fixture lacks `occupancies` (specs aren't typechecked).
  - `host-bookings-api.spec.ts:429-438`: tighten it.
  - `invoice-overlay.spec.ts`: keep the new fields optional.
  - `host-ops-api.spec.ts`: add tests.
  - `host.routes.spec.ts`: re-run.
- **Task decomposition:** T1a, T1b, T2, T3, T4 with disjoint files, as in the merged plan.

### Product Manager report

Kept in full in the session transcript and condensed here.
- **Intent:** a host can follow a stay from check-in to settled money without a stale number on the way, and money for a booking is in exactly one clear state.
- **Acceptance criteria:** 36 in Given/When/Then:
  - A (1–8): booking bills in the list.
  - B (9–17): a booking's invoice.
  - C (18–24): cross mark-paid.
  - D (25–30): rooms.
  - E (31–34): history and errors.
  - F (35–36): overdue and dates.
- **Product rules:**
  - Invoice only for checked-in/checked-out; one per booking; amount = full `total_price`; due = check-out date.
  - The FE pays only confirmed/checked-in/checked-out (keep it).
  - Invoice mark-paid is idempotent.
  - Aggs count rental and utility only.
  - Over-due only for CRM hostels.
  - Manual "Add invoice" sends `billable_type: 'Renter'`.
- **Copy:**
  - Type badge "Booking"; column "Tenant" → "Billed to".
  - Panel Invoice section: "Checking for an invoice…" / "No invoice yet." / "Invo-… · Rs … + pill + View invoice" / "Could not check for an invoice."
  - Cross-pay checkboxes: "Also mark invoice Invo-… as paid" and "Also mark booking BK-… as paid".
  - Partial failure: "Invoice marked paid. The booking was not: <server message>".
  - Room card: "1 free" / "Full". Room detail section: "Guests on bookings". History: "Stayed in".
- **Out of scope:**
  - All backend changes.
  - Online, partial or refund payments.
  - The guest side, emails and PDF templates.
  - Editing booking bills.
  - Monthly billing changes.
  - New mockups.
  - Explicit `hostel.timezone` conversion.
- **Must not regress:**
  - Rental/utility create, edit, delete and mark-paid, and their summary cards.
  - The tenant profile tables.
  - The check-in dialog and Release.
  - The room filter and calendar counts.
  - Subscription gating.
  - The `?status=` deep link.

## Design node inventory

No mockup or Figma frame covers these surfaces (`design-mockups/` has rooms, tenants and invoices screens, but nothing for booking check-in, occupancies or booking invoices). Specs below follow the existing screens' patterns and are **approximate**: there is no pixel source to confirm them against. Shared components are in `lib/src/ui/lib/` (`@hostelhive/ui`).

| # | Node | Verdict | Existing component (path) | What's missing / what to build | Placement | Tokens |
|---|---|---|---|---|---|---|
| 1 | Bills "Type" badge — Booking | PARTIAL-EXTEND | `invoice-table-cols.ts:55-63` badge cell (`@hostelhive/ui` badge) | third tone for `booking`, distinct from Rental (sky) and Utility (cream) | feature-local config | existing brand palette tone; no new token |
| 2 | Bills "Billed to" cell (guest + booking ref link) | PARTIAL-EXTEND | data-table `link` cell (`data-table/data-table.ts:459`) | booking branch: guest name, `Booking <ref>` linking to `bookingPath` | `invoice-table-cols.ts` | — |
| 3 | Bills kind filter option "Booking" | FULL | `invoice-filter-groups.ts` options | add one option | config | — |
| 4 | Booking bills summary card (Q5) | PARTIAL-COMPOSE | existing summary cards in `invoices.html` | third card from status aggs | `invoices.html` | same as the rent/utility cards |
| 5 | Invoice preview: booking lines | PARTIAL-EXTEND | invoice preview drawer `invoices.html:~236` | "Booking <ref>" instead of "Room —"; drop zero lines | `invoices.html` | — |
| 6 | Panel "Invoice" section (loading / none / exists + pill + View invoice) | PARTIAL-COMPOSE | `status-pill`, `link`, section layout of the panel's "In rooms" block (`booking-details-panel.html:103-145`) | new section in the panel | `booking-details-panel.html` | — |
| 7 | Cross-pay checkbox in a confirm dialog | PARTIAL-COMPOSE | `confirm-modal` (`<ng-content />`, `confirm-modal.ts:105`) + native checkbox pattern (`subscription-checkout.html:53`) | projected checkbox; no UI-library change | `bookings.html`, `invoices.html` | — |
| 8 | "Stayed in" occupancy history | PARTIAL-EXTEND | panel occupancy block (`booking-details-panel.html:103-145`) | render read-only for checked-out/cancelled, no Release | panel | — |
| 9 | Room card "N free" / "Full" | PARTIAL-EXTEND | room card (`rooms.html:135`) | a label beside `occupied/capacity` | `rooms.html` | muted text token as the pill's neighbours |
| 10 | Room detail "Guests on bookings" card | PARTIAL-COMPOSE | `card`, the renters list on `room-detail.html:81-143`, `states/empty-state` | new card listing guest, ref link, guests, until date | `room-detail.html` | — |

**Counts:** FULL 1 · PARTIAL-EXTEND 5 · PARTIAL-COMPOSE 4 · NEW 0. **No shared component changes**: every extension is feature-local config or markup, and `@hostelhive/ui` is untouched.

**Correction after 2d (D2):**
- Node 3 (kind filter option) is **dropped**: nightly hostels get no kind filter, and monthly hostels never have booking bills.
- Node 4 becomes "the nightly summary card", built from the status totals.

## Decisions

| # | Question | Options | Decision | Who |
|---|---|---|---|---|
| D1 | Cross-pay prompt shape | checkbox ticked / checkbox unticked / two buttons | **Checkbox inside the existing confirm dialog, ticked by default**, in both directions. No `@hostelhive/ui` change. | user |
| D2 | Booking money in the Invoices summary | FE-derived booking card / no card | **The Invoices page adapts to the hostel's billing mode.** The user: backpackers are not charged rental or utility bills. **Nightly** (`isNightlyBilled`): one "Booking invoices" card (total / paid / balance from `aggs.statuses[].total_amount`, exact because every bill is a booking bill); no Rent/Utility cards; no kind filter; no manual "Add invoice". **Monthly**: exactly as today (rental + utility), no Booking option. A hostel whose mode is unknown gets the monthly view, but any booking bill still renders correctly. | user (follow-up question; the "unknown mode" rule is my assumption) |
| D3 | Keep `utility` in the bills filter | keep / drop | Keep, **on monthly hostels only** (follows from D2) | settled from code + D2 |
| D4 | Occupancy format | "101 × 2" / "101 (2)" | Keep "101 × 2"; the check-in toast and panel already use it | my assumption, from code; user can override |
| D5 | Where "View invoice" goes | Invoices preview drawer / edit form | `invoices/view/:billId`, opening that bill's preview drawer and loading it by id when it is off-page | settled from code (DataTable link cells can't carry query params) |
| D6 | Editing a booking bill | allow / hide | **Hide Edit** on booking bills; an edit would rewrite `billable_type` to `Renter` | settled from code (`host-ops-api.ts:436`, backend `renter_bill_params`) |
| D7 | Print-window XSS via guest names | fix now / follow-up | Fix now: HTML-escape every interpolation in `openInvoicePrintWindow` | settled (security) |
| D8 | Cancel a booking that has an open invoice | warn / no change | **One-line warning** in the cancel dialog; nothing deleted automatically | user |
| D9 | New UI strings | keys / whole lifecycle / hard-coded | **Transloco keys for new standalone strings**; labels inside the existing English action tables stay English; lifecycle i18n becomes a follow-up | user |
| D10 | Search bills by guest name (nightly) | add / follow-up | Implement `s[booking.guest_name]` for nightly; verify at 5e; if the server ignores it, remove it and file a follow-up | my assumption |
| D11 | UTC offsets on job-indexed documents | fix / out of scope | Out of scope unless 5e confirms it; reported either way | settled (PE) |
| D12 | Toast suppression | everywhere / inline-only | Suppress the global toast **only** where the error renders inline (check-in, lifecycle dialogs, release); never on row-menu confirm | settled from code (PE) |
| D13 | Rooms freshness | reuse-strategy change / refetch delay | No reuse change (it never caches); `RefetchDelay.track('/rooms')` after each stay move, to cover search-index lag | settled from code (PE) |

| D14 | Room detail while the booking-guest count is unknown (loading or failed) | hide status / fall back to the server count / leave as is | **Hide the status**: no Available/Partial/Full pill and a neutral occupied figure until the guests arrive | user, 2026-10-11 (from 5d U1) |
| D15 | TC-108 says "shows paid in the preview", but the preview has no status | assert the bill's state / add a status pill to the preview | **Assert the bill's state**: the deep-linked preview stays open on that bill and the bill becomes paid. No UI change | user, 2026-10-11 (from 5d U2) |

| D16 | Room calendar reads "full" when a party is split across rooms (found live at 5e) | fix now / follow-up | **Fix now (user, 2026-10-11).** Cause, from code: `room-stays.ts:129` charges each booking its whole party (`beds = b.guests`), and `bookingsInRoom` fetches only `f[room.id]`, which the server sets to the **first** allocated room (`booking_checkin_service.rb`). So 101 shows 3/3 for a 2-guest occupancy and 102 never shows its guest. **Rule:** a booking with occupancies charges this room the guests of its occupancies **in this room**: active ones while checked in, all of them once checked out or cancelled (history). A booking with none in this room is not drawn. A booking without occupancies (pending/confirmed) is unchanged. Fetch the union of `f[room.id]` and `f[occupied_room_ids]`. **Known limit:** a room released mid-stay counts as freed for the whole stay, because the API exposes no release date | user asked; rule settled from code by the orchestrator |

| D17 | Room calendar: a checked-out stay still holds beds for the rest of its booked nights (room 101 read "4 of 3 · over 1" because Flow Guest 1 left the morning of its first night), and the departure day showed "over -3" | checked-out frees today onward / only fix the label | **A checked-out stay counts only for nights before today (hostel time); tonight and later are free; past nights stay as history. The departure-day label never goes negative.** | user, 2026-10-11 (found live at 5e) |
| D18 | The booking list and calendar come from the backend search index, which lagged **minutes** (Flow Guest 2 was checked-in in the DB, "confirmed" in the index), so a panel opened from a list row offered Check in on a checked-in booking | re-read on open / backend follow-up only | **The panel re-reads the booking from the DB (`GET bookings/:id`) on open:** it shows the list copy at once, then swaps to the DB copy and corrects the row. The index staleness itself is recorded as a backend follow-up | user, 2026-10-11 (found live at 5e) |

All PE and PM open questions are resolved.

## Change surface

All paths are under `apps/web/src/app/` unless shown in full.

| # | Area | Path | Change | Discipline | Status | Covered by |
|---|---|---|---|---|---|---|
| 1 | host data | `util/models/host-ops.ts` | Modify: `InvoiceKind` + `'booking'`, `Invoice.booking` | frontend | done | |
| 2 | host data | `services/host-ops-api.ts` | Modify: `toInvoice` booking mapping (exported), `invoice(id)`, `bookingInvoices(ids)`, guest-name search param, `occupied` override left alone (room-detail computes it) | frontend | done | |
| 3 | host data | `services/host-ops-api.spec.ts` | Test | test | pending | |
| 4 | host bookings data | `features/host/bookings/host-bookings-api.ts` | Modify: `get(id)`, `generateInvoice` → `Invoice`, optional suppress-toast context on lifecycle calls and release | frontend | done | |
| 5 | host bookings data | `features/host/bookings/host-bookings-api.spec.ts` | Test | test | pending | |
| 6 | invoices | `features/host/invoices/invoice-overlay.ts` (+ `.spec.ts`) | Modify: booking money bucket | frontend | done | |
| 7 | core | `core/api-resource.ts` | Modify: `put` accepts `HttpContext` | frontend | done | |
| 8 | routing | `features/host/host.routes.ts` | Modify: sibling `bookings/:bookingId`; `invoices/view/:billId` | frontend | done | |
| 9 | routing | `route-reuse-strategy.ts` | Modify: add `HostBookings` to the drawer-host set | frontend | done | |
| 10 | routing | `util/host-links.ts` | New: `bookingPath`, `invoicePath` | frontend | done | |
| 11 | i18n | `apps/web/public/i18n/en.json` | Modify: all new keys (CRLF preserved) | frontend | done | |
| 12 | invoices | `features/host/invoices/invoices.ts` / `.html` | Modify: billing-mode view (D2), booking kind in preview/print/PDF/CSV, hide Edit (D6), `view/:billId`, invoice-side cross-pay (D1), print escaping (D7), guest search (D10) | frontend | done | |
| 13 | invoices | `util/table-configs/invoice-table-cols.ts` | Modify: booking badge, Billed-to cell, room fallback | frontend | done | |
| 14 | invoices | `util/filter-configs/invoice-filter-groups.ts` | Modify: kind group only on monthly | frontend | done | |
| 15 | bookings | `features/host/bookings/bookings.ts` / `.html` | Modify: invoice map, viewInvoice, generate keeps the bill, booking-side cross-pay, `:bookingId`, release → row refresh, cancel warning (D8), toast suppression (D12), `RefetchDelay.track('/rooms')` (D13), no-show copy | frontend | done | |
| 16 | bookings | `features/host/bookings/booking-details-panel.ts` / `.html` | Modify: no-show actions `[]`, `actionsFor(b, invoice)`, Invoice section, "Stayed in" history, `released` output | frontend | done | |
| 17 | bookings | `features/host/bookings/booking-details-panel.spec.ts` | Update: lane table, fixture `occupancies: []`, new cases | test | pending | |
| 18 | rooms | `features/host/rooms/rooms.html` (+ `rooms.ts` if a helper is needed) | Modify: "N free" / "Full" | frontend | done | |
| 19 | rooms | `features/host/rooms/room-detail/room-detail.ts` / `.html` | Modify: booking guests card, occupied = renters + guests | frontend | done | |
| 20 | tests | other `*.spec.ts` that pin changed behaviour (`invoice-table-cols`, `host.routes.spec.ts`, `assign-rooms-panel.spec.ts`) | Update as the diff requires | test | pending | |

**Status of the test rows at the end of Phase 3:**
- Row 5 (`host-bookings-api.spec.ts`) and row 17 (`booking-details-panel.spec.ts`): **in progress**. Existing cases were updated; new cases come in Phase 4.
- Row 3 (`host-ops-api.spec.ts`) and `invoice-overlay.spec.ts`: **pending** until Phase 4.
- Row 20: `host.routes.spec.ts` and `assign-rooms-panel.spec.ts` were **not touched**, because nothing broke them. `invoice-table-cols` has no spec.

**Drift (4b), measured after Phase 3:**
- **Undeclared:** `features/host/bookings/booking-month.ts`, now **done**. Pass B exported `PAYABLE_LANES` and `INVOICEABLE_LANES` to remove four copies.
- **Row 8 (`host.routes.ts`) grew:** it carries `data: DRAWER_HOST` on 13 routes for the bundle fix.
- **Declared but not touched:** `host.routes.spec.ts` and `assign-rooms-panel.spec.ts` (not broken, so dropped from Phase 3), and `rooms.ts` was touched as allowed.
- **Small drift overall:** the plan predicted the surface well.

**Considered and not touching:**
- `lib/src/ui/**`: no shared component change.
- `assign-rooms-panel.ts/html`: the check-in dialog already meets the card. Only its error path changes, via the API context in row 4 and the caller in row 15.
- `booking-filter-groups.ts`: the room filter already works.
- The other 17 locale JSONs: they fall back to English and `i18n:check` gates `en.json` only.
- `invoice-form-drawer/*`: booking bills are never edited (D6), and nightly hostels get no manual Add (D2).

## Implementation

**Branch:** `feat/stay-flow-invoices-rooms`, cut from `origin/main` 7308ea2 in a **worktree** at `.claude/worktrees/trello-83`, with `node_modules` junctioned to the main checkout's. Why: the main checkout is in use by another session (`feat/mascot-loader`, PR #43, its dev server running), and switching its branch would have changed files under it.

**Concurrent work:** PR #44 (`fix/remove-booking-deposit`) also touches `booking-details-panel.*` and `host-bookings-api.*` (deposit removal, about 10 lines). Rebase onto it if it merges first.

### Assignment sheet (EM pass A)

| Task | Wave | Agent | Difficulty | Model | Owns | Depends on |
|---|---|---|---|---|---|---|
| T1a: data seam | 1 | frontend-staff-engineer | 4 | opus | `util/models/host-ops.ts`; `services/host-ops-api.ts` (+spec); `features/host/bookings/host-bookings-api.ts` (+spec); `features/host/invoices/invoice-overlay.ts` (+spec); `core/api-resource.ts` | — |
| T1b: routes, links, en.json keys | 1 | frontend-staff-engineer | 4 | opus | `features/host/host.routes.ts` (+spec); `route-reuse-strategy.ts`; `util/host-links.ts` (new); `apps/web/public/i18n/en.json` | — |
| T2: invoices UI | 2 | frontend-staff-engineer | 4 | opus | `features/host/invoices/invoices.ts/.html`; `util/table-configs/invoice-table-cols.ts`; `util/filter-configs/invoice-filter-groups.ts` | T1a, T1b |
| T3: bookings UI | 2 | frontend-staff-engineer | 4 | opus | `features/host/bookings/bookings.ts/.html`; `booking-details-panel.ts/.html/.spec.ts`; `assign-rooms-panel.spec.ts` (only if broken) | T1a, T1b |
| T4: rooms | 2 | frontend-staff-engineer | 3 | opus | `features/host/rooms/rooms.html/.ts`; `rooms/room-detail/room-detail.ts/.html` | T1b |

**Seam contract (EM).**
- **T1a:**
  - `InvoiceKind` + `'booking'`; optional `Invoice.booking {id, ref, guestName, phone}`.
  - `toInvoice` is exported, with no zero lines for booking bills.
  - `HostOpsApi.invoice(hostelId, billId)`; `HostOpsApi.bookingInvoices(hostelId, ids): Observable<Map<string, Invoice>>`.
  - `HostBookingsApi.get(hostelId, id)`; `generateInvoice` → `Observable<Invoice>`.
  - Lifecycle calls and `releaseOccupancy` take a trailing `opts?: { suppressErrorToast?: boolean }`.
  - `ApiClient.put` takes `HttpContext`.
  - `InvoiceCounts` gets optional booking totals.
- **T1b:**
  - `bookingPath` → `/host/:id/bookings/:bookingId` (a sibling route).
  - `invoicePath` → `/host/:id/invoices/view/:billId`.
  - `HostBookings` joins the drawer-host set.
  - 29 new `en.json` keys under `hostInvoices.*`, `hostBookings.*` and `hostRooms.*`. T1b is the only writer, and the file stays CRLF. The full list is in the EM report.
- **Wave-2 engineers never edit a seam file.** They report what they need instead.

**My three checks:**
1. Same-wave paths are disjoint: **pass**.
2. Each change-surface row has exactly one owner: **pass** (rows 1–7 T1a, 8–11 T1b, 12–14 T2, 15–17 T3, 18–19 T4, 20 split by owner).
3. The shared layer is wave 1 and alone: **pass**.

### T1a report: data seam (done)

`npx nx typecheck web` passes. All 12 contract items are in; paths are under `apps/web/src/app/`.

1. **Models** (`util/models/host-ops.ts:111,119,132`):
   - `InvoiceKind` gains `'booking'`.
   - New exported `InvoiceBooking`; `Invoice.booking?` uses it.
   - For booking bills, `tenantName` = the guest name and `renterId` = `''`, so search, CSV and print work without checking the kind.
2. **`toInvoice`** (`services/host-ops-api.ts:450`, exported; `ApiRenterBillTop` exported `:337`):
   - `booking` kind at `:398`.
   - Phone read as `phone ?? guest_phone`; the booking id falls back to `billable_id`.
   - Zero mess and transport lines dropped for booking bills only (`:411-420`); the server's `"0.0"` strings go through `Number()`.
   - A booking bill with no breakdown gets the fallback line "Stay charges".
3. **New API methods:**
   - `invoice(hostelId, billId)` at `:830`.
   - `bookingInvoices(hostelId, ids)` at `:844`: one GET with `f[billable_type]=Booking`, `f[bill_type]=booking`, repeated `f[billable_id][]`; no request for an empty list.
4. **Guest-name search:** no change needed; `invoices()` already passes any filter through.
5. **`HostBookingsApi.get`** (`host-bookings-api.ts:334`): maps through `toHostBooking`.
6. **`generateInvoice`** (`:292`): returns `Observable<Invoice>`.
7. **Toast opt-out:** lifecycle calls take `opts?: HostBookingRequestOptions` (`:17`): `checkIn` :234, `markPaid` :255, `checkOut` :260, `cancel` :265, `markNoShow` :275, `releaseOccupancy` :315. With the flag set, the request carries `HttpContext(SUPPRESS_ERROR_TOAST)`; without it, the call is byte-identical to before.
8. **`ApiClient.put`** takes a context (`core/api-resource.ts:42`).
9. **`invoice-overlay.ts:18-20`**: optional booking totals. A booking total is shifted only when it is already present.
10. **`occupied` override:** untouched (`host-ops-api.ts:636`).
11. **Specs:**
    - The generate spec now asserts the returned `Invoice`, and a new test covers a reply with no bill.
    - `tsc -p tsconfig.spec.json` reports 39 errors in **other** specs. These are fixture shapes such as a missing `occupancies`. Specs are excluded from CI's typecheck; the errors predate this change.
12. **Line endings:** `sed -i` converted `host-ops-api.ts` to LF; CRLF was restored.

**Notes:**
- T2 must put derived booking figures into the starting counts for local edits to adjust them.
- Verify live at 5e that the list documents' `booking.id` hashids match `f[billable_id][]`.

### T1b report: routes, link helpers, en.json keys (done)

- **`util/host-links.ts`** (new): `bookingPath` and `invoicePath`, with no locale prefix, because every consumer (`LocaleLink`, `HH_LINK_LOCALISER`, `keepLocale`) adds its own.
- **`host.routes.ts:242-249`**: sibling `bookings/:bookingId` (`HostBookings`, `bookingsGate`), with a comment on why it isn't a child.
- **`host.routes.ts:292`**: `view/:billId` under `invoices`; it inherits `permissionGuard('host:RenterBill:index')`.
- **`route-reuse-strategy.ts:5,15`**: `HostBookings` joins `DRAWER_HOST_COMPONENTS`.
- **`en.json`**: 29 keys (`hostBookings` 540–551, `hostInvoices` 613–622, `hostRooms` 803–809). 32 insertions and 3 deletions (trailing commas). Still CRLF (1617/1617 line breaks).
- **Checks:**
  - `npm run i18n:check` exits 0.
  - `npx nx typecheck web` failed. One cause: the gitignored env files (`api.env.ts`, `google-oauth.env.ts`, `maps.env.ts`, `google-analytics.env.ts`) don't exist in a new worktree. **The orchestrator copied them from the main checkout** after confirming they are ignored. The other cause: TS7053 at `invoice-overlay.ts:78,85`, which is T1a's file; T1a was told.
- **QA notes:**
  - A monthly hostel's `/bookings/:id` redirects to overview.
  - `bookings` ↔ `bookings/:id` must not refetch the list.
  - `view/:billId` needs the invoice permission.
  - The locale prefix must be kept.
- **Follow-up for T3:** load a booking by id when `:bookingId` is not in the loaded list.

### T4 report: rooms (done)

`npx nx typecheck web` passes. The engineer also ran `npx ngc -p apps/web/tsconfig.app.json --noEmit` with strict templates, which exited 0. Files stay CRLF. Paths are under `features/host/rooms/`.

- **AC 25:** `rooms.ts:127-128,534-535` adds `free = max(0, capacity - occupied)`; `rooms.html:135-145` shows a muted "N free" / "Full" label before the pill.
- **AC 26–27:** `room-detail.ts:34-77` (view model + `toRoomBookingGuest`, active occupancies in this room only) and `:196-235` (its own stream: `list(hostelId,1,100,{'f[occupied_room_ids]': roomId})`, skipped on monthly hostels).
- **Guests card** (`room-detail.html:145-185`): guest name, ref link (`RouterLink` + `LocaleLink`), guest count, until date (`apiDate:'mediumDate'`); skeleton / empty / error states.
- **AC 28:** `room-detail.ts:237-246` `occupied()` = renters + booking guests. It drives the pill, the header (`:70`) and the beds line (`:91`). `host-ops-api.ts:636` is untouched.
- **AC 29:** no change. The reuse strategy never caches, so every visit fetches again.
- **Deviations:**
  - The empty state is a plain muted line rather than `hh-empty-state`.
  - The ref link shows only the ref, with no "Booking" prefix.
- **Outside its files:** `HostBookingsApi.list()` has no `suppressErrorToast`, so a guests-fetch failure can show the toast and the inline line. Left for pass B to decide.
- **Risk:** the grid uses the server's `current_occupancy`; if that leaves booking guests out, the grid and the detail disagree. Check live.

### T2 report: invoices UI (done)

`npx nx typecheck web` passes, and `npx ngc … --noEmit` with strict templates exits 0. Files stay CRLF. No seam or en.json change was needed. Paths are under `apps/web/src/app/`.

1. **D2 billing-mode view:**
   - `invoices.ts:235` `nightly` uses `isNightlyBilled`, so an unknown mode gets the monthly view.
   - `:154` `withBookingTotals` is applied at fetch time (`:373`), so `shiftInvoiceCounts` keeps the card right after edits.
   - `bookingSummary` at `:510`; the card is at `invoices.html:68`.
   - The kind filter is ignored and dropped on nightly (`activeKind :295`; `invoice-filter-groups.ts:15,102`, with `withKind = true`).
   - Add invoice is hidden (`html:14`); `addOpen` (`:245`) stays false on nightly.
2. **Table** (`invoice-table-cols.ts`):
   - Booking badge `bg-tint-purple text-backpacker` (`:44`).
   - `billedToCell` links to `bookingPath` (`:51`).
   - The Room cell shows "—" when there is no room (`:72`).
   - The header reads "Billed to" (`:77`).
   - `tenantRentCols` / `tenantUtilityCols` produce the same output as before.
3. **Preview, PDF, print, CSV:**
   - Booking ref link in the preview (`html:245`); per-kind line tags (`LINE_TAG :136`); `billedToDetail` (`:143`).
   - **Print escaping:** `escapeHtml` (`:131`) is applied to every value in the print window (`:860`).
   - CSV (`:1263`) gets nightly columns; the monthly CSV is byte-identical.
4. **D6:** Edit is dropped from the row menu (`html:174`), and `editingInvoice` (`:256`) refuses booking bills.
5. **D5 deep link:**
   - Read at `:603`; an off-page bill is fetched with `invoice()` (`:556`).
   - The clear-selection effect skips the deep-linked bill (`:549`).
   - A 404 shows `invoiceNotFound` and returns to the list.
   - `closePreview` (`:1200`) returns to the list URL.
6. **D1 cross-pay:**
   - Rental and utility stay one-click (`:1097`).
   - A booking bill opens a confirm; Confirm is disabled while `get()` runs (`:1125`).
   - The checkbox is ticked when the booking is payable and still owes, and is also shown if the fetch fails.
   - `confirmPay` (`:1141`) marks the invoice first, then the booking (toast suppressed); `paying` is held across both.
   - **The payable stages are copied locally** (`:164`), because the bookings page keeps them private.
7. **D10:** nightly search uses `s[booking.guest_name]` (`:358`, label at `:303`).
8. **AC 35:** Overdue already applies to every kind; no change.

**Deviations:**
- The Billed-to cell is one link ("Guest · BK-ref"), because the DataTable cell can't hold a separate second-line link.
- A rental or utility row with no room now shows "—" instead of a broken `/rooms/` link (a monthly-visible improvement).
- Nightly sends no `f[bill_type]`, so a stray old rental bill would count in the booking card.

**Raised for pass B:**
- **Double toast:** `HostOpsApi.invoice()` and `HostBookingsApi.get()` have no `suppressErrorToast`.
- **Hard-coded English:** the empty-state copy ("…rent or utility bills", wrong for nightly), the search placeholder, and the existing "Invoice marked paid" toast.
- The Tenant filter group still shows on nightly hostels.
- The duplicated payable-stage constant.

### T3 report: bookings UI (done)

`npx nx typecheck web` passes, and `ngc --noEmit` with strict templates exits 0. Only owned files were touched; `assign-rooms-panel.spec.ts` was unchanged. Paths are under `features/host/bookings/`.

1. **No-show:**
   - `panel.ts:54` makes `'no-show': []`.
   - The hint (`:322`) reads "The guest never arrived, so this booking is closed."
   - The dialog copy (`bookings.html:253`) no longer mentions an invoice.
2. **Invoice map:**
   - `bookings.ts:371` holds `invoices` plus lookup state.
   - One `bookingInvoices` call per page (`:263`), plus `ensureInvoice` (`:399`) for bookings opened from the calendar or a deep link.
   - `lookupInvoices` (`:404`) never nulls a known invoice; `keepSettled` (`:885`) stops a stale lookup from un-paying one.
   - `actionsFor(b, invoice)` (`panel.ts:74`) is used by the row menu (`bookings.ts:717`) and the panel.
   - `viewInvoice` is secondary (`panel.ts:348`) and navigates via `invoicePath` + `keepLocale` (`bookings.ts:458`).
3. **Invoice section** (`panel.html:160`, inputs `invoice` and `invoiceLookup`): all four states, the pill, and a View invoice link (`RouterLink` + `LocaleLink`).
4. **Generate** keeps the bill: `announceInvoice` (`:637`). `onGenerateRefused` (`:650`) handles the 422 "already exists" by looking the invoice up again.
5. **Cross-pay** (`markPaid :594`, checkbox at `bookings.html:~276-293`):
   - The checkbox is ticked by default and has a focus ring.
   - Booking first, then invoice, inside one `send()`, so `busy` holds across both.
   - Both ok → `bookingAndInvoicePaid`; invoice fails → `invoiceNotPaid` quoting the server.
6. **Cancel warning** at `bookings.html:269`.
7. **`:bookingId`**: done in full.
   - Opening a booking moves the URL to `bookingPath`. Closing the panel, closing the allocation, or finishing a check-in returns to the list.
   - Back from a booking URL closes the panel. The list isn't fetched again.
8. **Release:** `released` output (`panel.ts:129,292`) → `onReleased` (`bookings.ts:355`) → `get()` swaps the row and the panel's booking; if that fails, the list is fetched again.
9. **"Stayed in"** (`panel.html:~145`, `stayHistory panel.ts:179`): read-only, every row "Checked out".
10. **Toast suppressed** on check-in (`:685`), cancel, no-show, check-out, mark-paid, generate and release (`panel.ts:288`). Not on confirm.
11. **`RefetchDelay.track('/rooms')`** after check-in (`:697`), check-out and cancel (`:552`), and release (`:356`).
12. **Spec:** the fixture has `occupancies: []`; the lane snapshot and no-show case are updated; the release assertion includes the opts. Not run.

**Deviations:** a few strings stay hard-coded English inside existing English blocks, per D9: the no-show hint and dialog, the "Invoice generated" title, and the View invoice action labels. The icon is `ti-eye`.

**Seam gaps raised:** `HostOpsApi.markInvoicePaid`, `HostBookingsApi.get` and `HostOpsApi.bookingInvoices` can't suppress the toast, so errors show twice.

**Follow-up:** the checked-out hint still says an invoice can be raised once per booking, even after one has been.

### EM pass B: verification and integration

| Task | Verdict | Evidence (abridged) |
|---|---|---|
| T1a | incomplete (tests only) | Contract matches: `host-ops.ts:111-132`; `toInvoice`, `invoice()`, `bookingInvoices()` in `host-ops-api.ts`; opts / `get()` / `generateInvoice` in `host-bookings-api.ts`; `put` context; `invoice-overlay.ts:18-20,51-61`. **No new spec cases** for the mapper or the lookups. |
| T1b | verified | `host.routes.ts:242-249,292`; `route-reuse-strategy.ts:15`; `host-links.ts`; all 29 keys used once each; CRLF intact |
| T2 | verified | `invoices.html:68-93` (nightly card), `:14` (no Add); `invoices.ts:549` (deep-link exemption); all 15 `${}` print sites escaped; `confirmPay` busy guard and partial-failure copy; guest search |
| T3 | incomplete (tests only) | `panel.ts:54`; invoice section `panel.html:160-183`; never-null merge (`lookupInvoices`, `keepSettled`); cross-pay inside one `send()`; deep link; `released`; `stayHistory`; suppression only inline; `RefetchDelay`. **No new spec cases.** |
| T4 | verified | `rooms.ts:534`, `rooms.html:135-145`, `room-detail.ts:196-235` (key matches `booking-filter-groups.ts:99`), `occupied()` drives all three figures |

**My ruling on the two "incomplete" verdicts:** the briefs told every engineer to leave new tests to Phase 4. The missing cases go into the 4a matrix rather than back to the engineers.

**Ownership audit:** every file in the diff belongs to its task's sheet row, checked by reading each diff. No lost writes. The only off-sheet file, `booking-month.ts`, was edited by pass B itself.

**Integration changes:**
- **(a) Shared `ApiRequestOptions` / `requestContextArgs`** in `core/api-resource.ts:19,27`. `HostBookingRequestOptions` becomes an alias, avoiding a circular import.
  - `opts` added to `HostOpsApi.invoice/bookingInvoices/markInvoicePaid` and `HostBookingsApi.get/list`.
  - Passed only where the failure renders inline: `room-detail.ts:215`; the `invoices.ts:565` deep link (non-404 failures now get their own toast at `:580`); the `invoices.ts:1137` cross-pay booking read; `bookings.ts:335` deep link; `bookings.ts:619` cross-pay invoice; `PANEL_LOOKUP :407,671`.
  - The page-wide invoice lookup keeps its toast, because nothing else would show that failure.
- **(b) Shared stage lists:** `PAYABLE_LANES` and `INVOICEABLE_LANES` exported from `booking-month.ts:51,54`, replacing four duplicates.
- **(c) Nightly copy:**
  - New key `hostInvoices.invoicesAppearHereNightly` (`en.json:612`, used at `invoices.html:43`).
  - The filter-groups parameter is renamed `renterBills`, and it also drops the Tenant group on nightly.
- **(d) Unused keys:** none of the 29 were unused.
- **(e) Cleanup:** the two cross-pay checkboxes now share markup; a dead page-sum fallback was removed from `bookingSummary`.

**Judgement calls:**
- The toast is suppressed on the invoice-side booking read, which renders nothing inline. It was on my brief's list; the dialog stays usable either way.
- **The formatter was not run.** The repo isn't Prettier-formatted (Prettier would rewrite about 360 untouched lines of `invoices.ts`) and CI doesn't check formatting. Accepted.

**Gates (tail):**
- `nx typecheck web`: success.
- `ngc --noEmit`: exit 0.
- `nx lint web`: 0 errors, 111 warnings, none on added lines.
- `i18n:check`: "1482 keys defined, 1431 used … no missing keys".
- `nx build web`: exit 0, with the initial bundle at 2.98 MB, up from 2.89 MB on main (the warning budget was already exceeded on main; the error budget is 3.5 MB).
  - **The +92 KB comes from the `HostBookings` import in `route-reuse-strategy.ts`.**

**Fan-out vs one engineer:** not worse. The costs were a missing-option gap reported three times, one copied constant, and checkbox drift, all cheap to fix.

**Follow-ups:**
1. Bundle: being fixed now (below).
2. `RefetchDelay` lasts 2 s, so it only covers fast navigation; normal visits fetch again anyway.
3. A failed invoice mark-paid toasts twice. This already happens on main for rental and utility bills, and was left consistent.
4. The stale checked-out hint: being fixed now.
5. `InvoiceBooking.phone` is not displayed anywhere.
6. The nightly summary card is half width: being fixed now.
7. The rooms grid and room detail may disagree on occupancy. Check live.
8. The `f[billable_id][]` lookup and the `s[booking.guest_name]` search need live checks.

### Integration fix round (orchestrator decision)

Pass-B follow-ups 1, 4 and 6 went to one `frontend-staff-engineer` (difficulty 2, sonnet) as the sole engineer in the checkout:
- Re-key the reuse strategy on `data: { drawerHost: true }` so it imports no page components.
- Make the nightly summary card full width.
- Show "This stay has been invoiced." once an invoice exists.

**Fix round result** (verified against the report; gates re-run by the engineer):
- `route-reuse-strategy.ts` imports no pages and reuses on `routeConfig.data.drawerHost`.
- `host.routes.ts` adds `DRAWER_HOST` (`~:207`) to the 13 bookings, rooms, tenants and invoices drawer routes. RoomDetail and TenantProfile are left unflagged.
- **Initial bundle: 2.98 MB → 2.70 MB** (below main's 2.89 MB).
- `invoices.html:67` gives the nightly card a full-width grid.
- `booking-details-panel.ts:313` shows the invoiced hint.
- Lint, typecheck, `ngc` and build all pass. No spec needed changing. `dist/` was removed.

**EM risks carried forward:**
- `tenant-profile.ts` imports `tenantRentCols`/`tenantUtilityCols` (T2 keeps them unchanged).
- `invoices.ts:408-414` must exempt the deep-linked bill.
- T4 must confirm the `f[occupied_room_ids]` key against `booking-filter-groups.ts:97-99`.

### Brought up to date with main (before Phase 4)

Senior QA found that `origin/main` had moved: PR #44 (deposit removal, which touches `booking-details-panel.*` and `host-bookings-api.*`) and PR #43 (mascot) had both merged. The branch had no commits, so it was synced **without committing**:
1. Saved the whole change as a patch, plus copies of all 24 files, in the session scratchpad.
2. `git checkout -- .` and `git merge --ff-only origin/main` (now at 5ae0e1a).
3. `git apply --3way` on the patch: **all 23 tracked files applied cleanly**. `host-links.ts` stayed untracked.
4. Unstaged with `git reset`.

Line endings are still CRLF (`en.json` 1658/0, `host-ops-api.ts` 1074/0, `bookings.ts` 904/0). `nx typecheck web` passes and `ngc --noEmit` exits 0.

## Test matrix

**Status: APPROVED by the user as written, 2026-10-10.** No edits to the rows.

**4c shared test layer** (one `senior-qa`, alone). It lives in `apps/web/src/app/testing/`, imported as `@app/testing/*`; there was no test-utility folder before.
- **Files:**
  - `api-client-recorder.ts`: `ApiClientRecorder` records the verb, path, params, body, context and argument count; also `suppressesErrorToast`.
  - `host-builders.ts`: bill documents in both wire shapes, `invoice` / `bookingInvoice`, `hostBooking` (the post-#44 shape), `apiHostBooking`, rooms, `hostListing`, `apiError`.
  - `host-stubs.ts`: typed `vi.fn` API stubs, where single reads default to `NEVER`; `NotificationSpy.raised[]`; `RefetchDelaySpy`; `seedHostPropertyStore`.
  - `host-page.ts`: `openHostPage` mounts a page through the real router with the app's reuse strategy and a guard-free route table.
  - `print-window.ts`: `fakePrintWindow`.
- **Config:** `tsconfig.app.json` excludes `src/app/testing/**`; `tsconfig.spec.json` includes it.
- **Checks:** a throwaway spec mounting all four pages passed 6/6 and was then deleted. Spec `tsc` is clean in `testing/`; app `tsc` and eslint are clean.

**4d batches.** All on sonnet, with disjoint spec files:
- 1a: `api-resource.spec`, `host-bookings-api.spec` (TC-01–04, 22–27)
- 1b: `host-ops-api.spec` (TC-05–21)
- 2: overlay, cols, filters, `host-links`, `booking-month` specs (TC-28–41)
- 3: `host.routes.spec`, `route-reuse-strategy.spec` (TC-42–48)
- 4: panel spec (TC-49–59)
- 5: `bookings.spec` (TC-60–86)
- 6: `invoices.spec` (TC-87–112)
- 7: rooms and room-detail specs (TC-113–120)

TC-121 is run by the orchestrator; TC-122 and TC-123 are checked during 5c.

**Batch 1a: done.** TC-01–04 are in `core/api-resource.spec.ts`; TC-04 goes through the real `errorInterceptor`. TC-22–26 are in `host-bookings-api.spec.ts`, using `it.each` over the six lifecycle moves. TC-27 already matched its row. No defects suspected. Enumerated by `senior-qa` from `git diff HEAD` (the ticket's own change), the plan, the decisions and every implementation report. **Edit this section directly** to add, drop or re-level rows; the edited version is what gets written.

AC references are by PM group: A 1–8 bills list, B 9–17 a booking's invoice, C 18–24 cross-pay, D 25–30 rooms, E 31–34 history and errors, F 35–36 overdue and dates. D-numbers are decisions; CS-numbers are change-surface rows. Spec paths are relative to `apps/web/src/app/`. Levels: **unit** = pure function, or a service with a stubbed ApiClient; **int** = a component with stubbed APIs or `HttpTestingController`. Every row is automated unless marked.

### Core request context (CS7): new `core/api-resource.spec.ts`

| ID | Verifies | Ref | Level | P |
|---|---|---|---|---|
| TC-01 | `requestContextArgs()`, `({})` and `({suppressErrorToast:false})` all return `[]`, so a plain call keeps its arity | D12 | unit | P0 |
| TC-02 | `{suppressErrorToast:true}` returns one `HttpContext` with `SUPPRESS_ERROR_TOAST` set | D12 | unit | P0 |
| TC-03 | `ApiClient.put` forwards the context; without one, the default (false) applies | D12 | int | P0 |
| TC-04 | `put` with the opt-out plus a 422 through the real error interceptor gives no toast; without the opt-out, one toast | E, D12 | int | P1 |

### `toInvoice` mapper (CS1–2): `services/host-ops-api.spec.ts`

| ID | Verifies | Ref | Level | P |
|---|---|---|---|---|
| TC-05 | A search doc (`booking.phone`) maps to kind `booking`, a `booking{id,ref,guestName,phone}` block, `renterId ''`, and `tenantName` = the guest | A | unit | P0 |
| TC-06 | Serializer shape: `phone` is read from `guest_phone` | A | unit | P0 |
| TC-07 | When both keys are present `phone` wins; when neither is, `''` | A | unit | P2 |
| TC-08 | A missing `booking.id` falls back to `billable_id`; if neither exists, `''` | B | unit | P1 |
| TC-09 | Booking bills drop mess and transport at 0 / `"0.0"`; string amounts are coerced to numbers | A | unit | P0 |
| TC-10 | Non-zero mess and transport on a booking bill are kept | A | unit | P1 |
| TC-11 | A booking bill with no breakdown gets the "Stay charges" fallback | A | unit | P1 |
| TC-12 | Regression: rental and utility keep their zero lines and have no `booking`; unknown `bill_type` maps to rental | regression | unit | P0 |
| TC-13 | `bill_type: booking` with `booking: null` maps to kind booking, `booking` undefined, `tenantName '—'` | A | unit | P1 |
| TC-14 | A renter name beats the guest-name fallback | A | unit | P2 |
| TC-15 | `over-due` on a booking bill maps to `over-due` | F | unit | P1 |

### HostOpsApi new reads (CS2): `services/host-ops-api.spec.ts`

| ID | Verifies | Ref | Level | P |
|---|---|---|---|---|
| TC-16 | `invoice(h,id)` sends GET `/renter_bills/:id` and maps through `toInvoice` | D5 | unit | P0 |
| TC-17 | A reply with no `renter_bill` gives `id ''`, which the page treats as missing | D5 | unit | P1 |
| TC-18 | `bookingInvoices([])` returns an empty Map and sends **no request** | B | unit | P0 |
| TC-19 | Contract: `page=1`, `limit=ids.length`, `f[billable_type]=Booking`, `f[bill_type]=booking`, `f[billable_id][]` sent as an array | B | unit | P0 |
| TC-20 | Results keyed by booking id; bookings with no bill are absent; a bill without `booking.id` is skipped; both `renter_bills` and `data` are read | B | unit | P0 |
| TC-21 | `opts` puts the context on `invoice`, `bookingInvoices` and `markInvoicePaid`; without `opts` there is no trailing argument | D12 | unit | P0 |

### HostBookingsApi (CS4): `features/host/bookings/host-bookings-api.spec.ts`

| ID | Verifies | Ref | Level | P |
|---|---|---|---|---|
| TC-22 | `get(h,id)` sends GET and maps occupancies; a reply with no booking errors | B, E | unit | P0 |
| TC-23 | `get` with `opts` sends the context; without `opts`, no extra argument | D12 | unit | P0 |
| TC-24 | Table-driven: `checkIn`, `markPaid`, `checkOut`, `cancel`, `markNoShow` and `generateInvoice` with `opts` send the context; without it, each call is unchanged | D12 | unit | P0 |
| TC-25 | `releaseOccupancy` with `opts` calls `put(path, {}, ctx)` and encodes the occupancy id | D12 | unit | P0 |
| TC-26 | `list` with `opts` passes the context as the 3rd GET argument; sort and filters unchanged | D | unit | P1 |
| TC-27 | Existing Phase-3 spec: `generateInvoice` returns the mapped Invoice, and a reply with no bill errors (re-run only) | B | unit | P0 |

### Invoice overlay (CS6): `features/host/invoices/invoice-overlay.spec.ts`

| ID | Verifies | Ref | Level | P |
|---|---|---|---|---|
| TC-28 | Settling a booking bill moves balance to paid when the base has booking fields; create and delete shift `bookingTotal` | D2 | unit | P0 |
| TC-29 | Booking fields missing from the base stay **absent** (no `NaN`) | D2 | unit | P0 |
| TC-30 | Booking changes leave rent and utility alone, and the reverse | regression | unit | P1 |
| TC-31 | Booking bills shift `total` and status counts like other bills | A | unit | P2 |

### Table columns (CS13): new `util/table-configs/invoice-table-cols.spec.ts`

| ID | Verifies | Ref | Level | P |
|---|---|---|---|---|
| TC-32 | Badges: Rental (sky) and Utility (cream) unchanged; Booking uses `bg-tint-purple text-backpacker` | A | unit | P0 |
| TC-33 | Billed-to: with ref and id, a link "Guest · REF" to `bookingPath`; no ref, the name only; no id, a text cell | A | unit | P0 |
| TC-34 | Renter bill links to `/tenants/profile/:renterId` as before; the header reads "Billed to" | A | unit | P0 |
| TC-35 | An empty `roomId` gives a "—" text cell; with a room, the link is unchanged | A | unit | P1 |
| TC-36 | Regression: `tenantRentCols` and `tenantUtilityCols` keep the same keys, labels and output | regression | unit | P0 |
| TC-37 | An over-due booking row gets the over-due label and danger tone | F | unit | P1 |

### Filter groups (CS14): new `util/filter-configs/invoice-filter-groups.spec.ts`

| ID | Verifies | Ref | Level | P |
|---|---|---|---|---|
| TC-38 | Monthly (default): groups identical to before; kind is rental/utility with no Booking; tenant group present | D2, D3 | unit | P0 |
| TC-39 | With `renterBills=false`, kind and tenant are dropped; status, room and date are kept | D2 | unit | P0 |

### Links and lanes (CS10 + undeclared `booking-month.ts`)

| ID | Verifies | Ref | Level | Spec | P |
|---|---|---|---|---|---|
| TC-40 | `bookingPath` and `invoicePath` shapes, with no locale prefix | D5 | unit | new `util/host-links.spec.ts` | P1 |
| TC-41 | `INVOICEABLE_LANES` = checked-in, checked-out; `PAYABLE_LANES` = confirmed, checked-in, checked-out | B, C | unit | `features/host/bookings/booking-month.spec.ts` | P1 |

### Routing (CS8–9)

| ID | Verifies | Ref | Level | Spec | P |
|---|---|---|---|---|---|
| TC-42 | `bookings/:bookingId` is a sibling under `:hostelId`, with HostBookings, `bookingsGate` and `drawerHost` | D5 | unit | `features/host/host.routes.spec.ts` | P0 |
| TC-43 | A monthly hostel on `bookings/:id` redirects to `/overview` | B | int | host.routes.spec.ts | P0 |
| TC-44 | `view/:billId` is a child of `invoices`, under `permissionGuard('host:RenterBill:index')`, with Invoices and `drawerHost` | D5 | unit | host.routes.spec.ts | P0 |
| TC-45 | `drawerHost` is on exactly the drawer routes; absent on `rooms/:roomId`, `tenants/profile/:id` and everything else | D13 | unit | host.routes.spec.ts | P0 |
| TC-46 | Reuse when both sides share the component and are flagged (bookings↔`:id`, invoices↔`view/:id`, rooms↔create, tenants↔edit) | D13 | unit | new `route-reuse-strategy.spec.ts` | P0 |
| TC-47 | No reuse when the components differ, the shared component is unflagged (AddGrocery), only one side is flagged, Rooms→RoomDetail, or Tenants→TenantProfile | D13 | unit | route-reuse-strategy.spec.ts | P0 |
| TC-48 | The identical-`routeConfig` fallback is unchanged; the detach and attach hooks stay inert | regression | unit | route-reuse-strategy.spec.ts | P1 |

### BookingDetailsPanel (CS16–17): `features/host/bookings/booking-details-panel.spec.ts`

| ID | Verifies | Ref | Level | P |
|---|---|---|---|---|
| TC-49 | `actionsFor(b, inv)`: a known invoice turns `invoice` into `viewInvoice` in the same slot (checked-in and checked-out) | B | unit | P0 |
| TC-50 | Checked-out, owed, with an invoice: `['markPaid','viewInvoice']`. No-show and cancelled: `[]` even when owed | B, C | unit | P0 |
| TC-51 | View invoice is never the filled primary button | B | int | P1 |
| TC-52 | The Invoice section shows only on checked-in and checked-out bookings | B | int | P0 |
| TC-53 | Its four states: loading, error, none, and exists (number, amount, pill, link to `invoicePath`) | B | int | P0 |
| TC-54 | A present invoice wins over a stale loading or error state | B | int | P1 |
| TC-55 | Checked-out or cancelled: "Stayed in" lists every occupancy as "Checked out", with no Release and **no `occupancies()` request**. Checked-in shows the live block | E | int | P0 |
| TC-56 | A finished stay with no occupancies has no section | E | int | P2 |
| TC-57 | A successful release emits `released(booking)`; a failed one emits nothing and shows the inline error | E | int | P0 |
| TC-58 | Hints: checked-out with and without an invoice ("This stay has been invoiced."); new no-show copy | B, E | int | P1 |
| TC-59 | Footer View invoice emits `act` with `viewInvoice` | B | int | P1 |

### HostBookings page (CS15): new `features/host/bookings/bookings.spec.ts`

| ID | Verifies | Ref | Level | P |
|---|---|---|---|---|
| TC-60 | One `bookingInvoices` call per page, with invoiceable ids only; none when there are none | B | int | P0 |
| TC-61 | The row menu offers View invoice when an invoice was found, otherwise Generate invoice | B | int | P0 |
| TC-62 | A known invoice is never replaced by `null` from a later empty lookup (index lag) | B | int | P0 |
| TC-63 | `keepSettled`: a paid invoice isn't reverted by a stale due copy; a different id, or a newer paid copy, does replace it | C | int | P0 |
| TC-64 | The page-wide lookup is not quiet; panel-only `ensureInvoice` is quiet; a failure shows the panel error state | B, D12 | int | P1 |
| TC-65 | Opening an off-page booking makes one lookup, with no duplicate while loading; non-invoiceable bookings get none | B | int | P1 |
| TC-66 | Generate is quiet; the returned bill shows at once with no re-lookup; one toast "Invo-… · Rs amount" | B | int | P0 |
| TC-67 | A 422 "already exists" closes the dialog, shows an info toast with the server text, and re-runs the lookup | B | int | P0 |
| TC-68 | Any other 422 on generate stays in the dialog, with no re-lookup | E | int | P1 |
| TC-69 | Cross-pay checkbox only in the markPaid dialog, only when the invoice is unpaid; ticked by default, and ticked again on reopen | C, D1 | int | P0 |
| TC-70 | Both succeed: `markPaid(quiet)` **then** `markInvoicePaid(quiet)`; one `bookingAndInvoicePaid` toast; pill shows paid | C | int | P0 |
| TC-71 | Invoice side fails: the booking row still updates; `invoiceNotPaid` quotes the server, falling back if there's no message | C | int | P0 |
| TC-72 | Booking side fails: the invoice request is **never sent**; the error shows in the dialog | C | int | P0 |
| TC-73 | Unticked: only the booking request is sent, with the plain toast | C | int | P1 |
| TC-74 | `busy` holds across both requests: a second confirm or act does nothing; controls are disabled | C | int | P0 |
| TC-75 | No checkbox when the invoice is paid or absent | C | int | P1 |
| TC-76 | Cancel dialog warns with the invoice number when it's unpaid; no warning when paid, absent, or on other dialogs | D8 | int | P1 |
| TC-77 | Toast opt-out is sent by cancel, no-show, check-out, mark-paid, generate and check-in; **not** by row-menu confirm | E, D12 | int | P0 |
| TC-78 | A check-in failure shows in the assign footer; success closes and returns to the list URL | E | int | P0 |
| TC-79 | `RefetchDelay.track('/rooms')` after check-in, check-out, cancel and release; not after confirm, no-show or mark-paid | D, D13 | int | P1 |
| TC-80 | Release: `get()` swaps the row and the panel's booking; if `get()` fails, the list is refetched | E | int | P0 |
| TC-81 | Deep link: on-page opens with no `get`; off-page uses `get(quiet)`; a failure shows `bookingNotFound` and returns to `/bookings` | B, D5 | int | P0 |
| TC-82 | Race: the URL changes before `get` answers, so no panel opens and a late error gives no toast | B | int | P1 |
| TC-83 | Open goes to `bookingPath`, close returns to the list; close or back while busy does nothing; **`list()` call count unchanged throughout** | D13 | int | P0 |
| TC-84 | A URL id matching the viewing, dialog or assigning booking does nothing | B | int | P1 |
| TC-85 | `viewInvoice` navigates to `invoicePath` | B | int | P1 |
| TC-86 | No-show and markPaid dialog copy no longer mentions an invoice | E | int | P2 |

### Invoices page (CS12): new `features/host/invoices/invoices.spec.ts`

| ID | Verifies | Ref | Level | P |
|---|---|---|---|---|
| TC-87 | Nightly: only the Booking invoices card; no Add; no kind or tenant filter group; nightly empty copy | A, D2 | int | P0 |
| TC-88 | Regression, monthly: rent and utility cards, Add, kind filter rental/utility (no Booking), tenant group, old empty copy | regression, D2/D3 | int | P0 |
| TC-89 | Unknown billing mode shows the monthly view | D2 | int | P1 |
| TC-90 | Booking card: total = sum of status totals, paid = the paid bucket, balance = total − paid; no statuses gives zeros | D2 | int | P0 |
| TC-91 | The card shifts after a local mark-paid, with no refetch | D2 | int | P1 |
| TC-92 | Nightly ignores a stale kind filter (no `f[bill_type]`), and the nightly `create` URL opens no drawer | D2 | int | P1 |
| TC-93 | Search sends `s[booking.guest_name]` on nightly, `s[renter.full_name]` on monthly, and `s[room.room_number]` for rooms; nightly label is "Guest name" | D10 | int | P0 |
| TC-94 | Booking bills have no Edit; `edit/:billId` on a booking bill opens no form | D6 | int | P0 |
| TC-95 | Regression: rental and utility mark-paid stay one click; the row and counts update | regression | int | P0 |
| TC-96 | Booking-bill mark-paid opens the confirm; Confirm is disabled while `get(quiet)` runs | C, D1 | int | P0 |
| TC-97 | Checkbox shown when the booking is payable and owes; hidden when paid, no-show or cancelled; shown if `get` fails; no booking id means no `get`, no box, and Confirm enabled | C | int | P0 |
| TC-98 | Invoice first, then `markPaid(quiet)`, then `invoiceAndBookingPaid`; unticked marks the invoice only | C | int | P0 |
| TC-99 | Partial failure: row shows paid; sticky `bookingNotPaid` with the server messages (fallback: `toToastCopy`) | C | int | P0 |
| TC-100 | Invoice fails: no booking request, an error toast, and the prompt closes | C | int | P0 |
| TC-101 | The `paying` guard ignores a second confirm, a cancel, or a new prompt | C | int | P0 |
| TC-102 | A late `get` answer for an earlier prompt doesn't change a newer prompt | C | int | P2 |
| TC-103 | `view/:billId` for a bill on the page opens the preview with no `invoice()` call | B, D5 | int | P0 |
| TC-104 | Off-page bill: `invoice(id, quiet)` runs after the list settles; the preview opens, survives the clear-selection effect, and opens even when filtered out | D5 | int | P0 |
| TC-105 | A 404, or a reply with no `renter_bill`, shows `invoiceNotFound` and returns to the list with the query kept | D5 | int | P0 |
| TC-106 | Any other failure shows one `toToastCopy` toast and returns to the list | D5, D12 | int | P1 |
| TC-107 | `closePreview` from the deep link navigates to the list; from a row click it only clears the selection | D5 | int | P1 |
| TC-108 | A deep-linked bill marked paid shows paid in the preview | C | int | P2 |
| TC-109 | Deleting a deep-linked bill closes the preview | D5 | int | P2 |
| TC-110 | Booking-bill preview: "Booking {ref}" links to `bookingPath`; the room line shows when there's no ref; purple line tag | A | int | P1 |
| TC-111 | **Security, print window:** with a fake `window.open`, the guest, note, line labels and hostel name containing `<script>`, `"`, `'` and `&` are all written escaped; booking bills read "Booking REF" with the `booking` tag | D7 | int | P0 |
| TC-112 | CSV: nightly headers are ID, Billed to, Booking, …; **monthly headers and rows are unchanged** | A, regression | int | P0 |

### Rooms (CS18–19)

| ID | Verifies | Ref | Level | Spec | P |
|---|---|---|---|---|---|
| TC-113 | Card shows `nFree` with the count; 0 free shows `full`; over capacity shows `full`, never a negative number | D | int | new `features/host/rooms/rooms.spec.ts` | P0 |
| TC-114 | Guests card counts only **active** occupancies **in this room**, summing guests; others excluded; ref links to `bookingPath`; Until date shown | D | int | new `features/host/rooms/room-detail/room-detail.spec.ts` | P0 |
| TC-115 | Request: `list(h,1,100,{'f[occupied_room_ids]': roomId},{suppressErrorToast:true})` | D | int | room-detail.spec.ts | P0 |
| TC-116 | `occupied()` = renters + guests, and drives the header, the beds line and the pill | D | int | room-detail.spec.ts | P0 |
| TC-117 | Loading shows a skeleton; on error, renters are still listed; an empty state when there are no guests | D | int | room-detail.spec.ts | P1 |
| TC-118 | Regression, monthly: no guests card and no bookings request; inactive renters aren't counted | regression | int | room-detail.spec.ts | P0 |
| TC-119 | Unknown billing mode still asks for booking guests | D2 | int | room-detail.spec.ts | P2 |
| TC-120 | A blank guest name shows "—" and the initials "?" | D | int | room-detail.spec.ts | P2 |

### i18n and gates (CS11)

| ID | Verifies | Ref | Type | P |
|---|---|---|---|---|
| TC-121 | `npm run i18n:check` exits 0 (a tooling gate, not in CI) | D9 | automated (tooling) | P1 |
| TC-122 | `en.json` is still CRLF and the other 17 locales are untouched | D9 | manual-only: a byte check during the run | P2 |
| TC-123 | Reuse strategy imports no page; the initial bundle is ≤ main's | D13 | not-automatable-here: the bundle budget belongs to `nx build` | P2 |

### Manual and live (browser verification at 5e): all not-automatable-here

There is no backend and no host account in the test environment. Rows marked ★ are where browser verification should push hardest.

| ID | Verifies | P |
|---|---|---|
| M-01 ★ | The `f[billable_id][]` lookup finds a freshly generated invoice; the list doc's `booking.id` hashid equals the booking id; View invoice survives a reload | P0 |
| M-02 ★ | `s[booking.guest_name]` really filters (if not, D10 says remove it and file a follow-up) | P0 |
| M-03 ★ | A booking bill issued after 19:00 PKT shows the correct day (D11, AC 36) | P1 |
| M-04 ★ | The rooms grid "N free" and the room detail agree after a check-in (does the server's `current_occupancy` include booking guests?) | P0 |
| M-05 ★ | `[class.sm:grid-cols-2]` is emitted: two cards on monthly and one full-width card on nightly, at ≥640 px | P1 |
| M-06 | Check-in, release and lifecycle 422s each show once, inline, with no global toast | P0 |
| M-07 | The second-generate 422 text contains "already exists" (TC-67 matches on it) | P1 |
| M-08 | Cross-pay in both directions, confirmed on the server after a reload; partial-failure copy | P0 |
| M-09 | The locale prefix is kept on every new link under `/ur/` | P1 |
| M-10 | Browser back closes the booking panel and the invoice preview with no list refetch | P1 |
| M-11 | Booking-bill PDF: "Booking REF", no zero lines, purple tag | P2 |
| M-12 | A guest named `<img src=x onerror=alert(1)>` prints as plain text | P1 |
| M-13 | Staff without `RenterBill:index` are refused `view/:billId` | P1 |
| M-14 | Focus ring and label on both checkboxes; the Invoice section on mobile | P2 |
| M-15 | The rooms page shows new free counts after check-in, release, check-out and cancel | P1 |

### Coverage and recommendations

- **Every change-surface row is covered**, as is the undeclared `booking-month.ts` (TC-41). The PDF output is manual only (M-11).
- **Totals:** 120 automated spec rows (TC-01 to TC-120), 1 automated tooling gate (TC-121), 1 manual-only row (TC-122), 1 not-automatable row (TC-123), and 15 live/manual rows.
- **No Playwright host-flow lane.**
  - `apps/web-e2e` has only an example spec.
  - A host lane needs a seeded host account and a live backend in known states. The repo has neither, and CI's `e2e` target would then depend on the LAN API.
  - Every row here can be proven at unit or integration level.
  - The live facts (M-01 to M-05) belong to browser verification at 5e.
- **A shared test-asset pass is needed first (4c).** There are no host page component specs today. The pass covers:
  - store seeding (nightly, monthly or unknown);
  - `vi.fn` stubs for the APIs;
  - spies on notifications and `RefetchDelay`;
  - a `paramMap`-driven router;
  - builders for both bill shapes and for `HostBooking`;
  - an ApiClient stub that records the trailing context and the argument count (the existing `ApiClientStub` drops it).
- **Possible defects to watch for:** QA flagged these as unconfirmed; the tests will settle them.
  - `confirmPay` toasts twice on an invoice failure. Accepted at pass B, consistent with main.
  - `room-detail` `occupied()` counts renters only while guests are loading, so the pill can briefly read "available".
  - `followUrl` makes one redundant `get()` before the list loads.

### Batch results (4e) and reconciliation (4f)

| Batch | Rows | Spec files | Notes |
|---|---|---|---|
| 1a | TC-01–04, 22–27 | `core/api-resource.spec.ts` (new), `host-bookings-api.spec.ts` | TC-04 runs through the real `errorInterceptor`; TC-27 already matched |
| 1b | TC-05–21 | `services/host-ops-api.spec.ts` | +2 extra cases (stray booking block on a rental bill; opt-out false) |
| 2 | TC-28–41 | `invoice-overlay.spec`, `invoice-table-cols.spec` (new), `invoice-filter-groups.spec` (new), `host-links.spec` (new), `booking-month.spec` | the two existing specs it extended were already LF |
| 3 | TC-42–48 | `host.routes.spec.ts`, `route-reuse-strategy.spec.ts` (new) | TC-44 runs the real permission guard against a stub `SessionStore` |
| 4 | TC-49–59 | `booking-details-panel.spec.ts` | Host wrapper extended with `[invoice]`, `[invoiceLookup]`, `(released)` |
| 5 | TC-60–86 | `bookings.spec.ts` (new) | 68 tests; spies on `TranslocoService.translate` for interpolation params |
| 6 | TC-87–112 | `invoices.spec.ts` (new) | `PermissiveSession`; some rows go through component internals: TC-93 scope via `onSearchFieldChange`, TC-101 via `confirmPay()`, TC-108 via `selected()` |
| 7 | TC-113–120 | `rooms.spec.ts` (new), `room-detail.spec.ts` (new) | a real-copy Transloco loader for 5 keys so counts are readable |

**4f checks:**
- **Coverage:** each of TC-01–120 is claimed by exactly one batch, with none unclaimed and none duplicated.
- **Shared helpers:** no batch re-created one; every local helper is file-scoped.
- **Focus markers:** `grep` finds no `.only`, `.skip`, `fit`, `xit` or `fdescribe` in any spec.
- **Conventions:** consistent (`ApiClientRecorder` for contracts, `openHostPage` for pages). Three batches drive some rows through protected members instead of the DOM. I accepted this where the DOM path is a third-party widget (the dropdown) or is unobservable under key-echo i18n.
- **Lint:** runs once in 5c.

## QA results

### Round 1

**Focused command:** `npx nx test web --skip-nx-cache -- --run <the 15 changed and new spec files>`

**Result:** 15 files, **426 tests: 417 passed, 9 failed.** All 9 failures are in `features/host/invoices/invoices.spec.ts`.

| Failure | Output | Triage | Owner |
|---|---|---|---|
| 6 tests in deep link and print (`:637,653,662,715,741,840`) | `expected 'Invo-1026-rb-1.pdf' to be 'Invo-1010-rb-1.pdf'` | **test defect.** The app numbers invoices `Invo-<MM><yy>-<id>`, and the spec computed `MMdd`. The panel spec asserts `Invo-1026` and passes | `senior-qa` (batch 6) |
| 3 search tests (`:298,313,325`) | `expected undefined to be 'ali'` / `'saad'` / `'101'` | **test defect (likely).** No search param is captured even for the unchanged monthly tenant search, which points at the fake-timer and debounce handling | `senior-qa` (batch 6) |

**Fix (`senior-qa`, batch 6 author):**
- Expected numbers changed to `Invo-1026-…`. The format is `buildInvoiceId` in `invoice-table-cols.ts:33-35`, derived from the issue date and not from the clock.
- `typeSearch` now uses real timers. Under vitest fake timers the page's `debounceTime(300)` never armed, so the old "does not fetch until typing pauses" test passed without proving anything.
- No assertion was loosened.

**Re-run:** `invoices.spec.ts` 60/60.

### Round 1, wide run (5c)

- `npx nx test web --skip-nx-cache -- --run`: **129 files, 1849 tests, all passed.**
- `nx lint web`: 0 errors, 188 warnings, up from 111.
  - **Every new warning is in the new specs**, and all are `no-non-null-assertion`, matching existing spec practice (`review.spec`, `blog-posts.spec`, `hostels-api.spec`).
  - The warnings in production files (`_route` unused in `route-reuse-strategy.ts`, `toPageInfo` in `host-ops-api.ts:25`, `byStatus.get(...)!` in `invoice-overlay.ts:119`, `booking-month.ts:279`) **predate this ticket**: each is present at `HEAD`.
- `nx typecheck web`: exit 0. `npm run i18n:check`: no missing keys.
- `nx build web`: exit 0. Initial total 2.75 MB, with only the existing budget warnings, including `home.scss` and `hero-clouds.scss` from main.
- **TC-121:** pass. **TC-123:** pass (the reuse strategy imports no page).

### 5d: independent verification (`qa-reviewer`), round 1

- **Full suite:** 129/129 files, 1849/1849 tests. No focus or skip markers, no stray `console.log`.
- **Row audit (TC-01–120):** 112 covered, 7 weak, 1 partly hollow, 0 missing. **No implementation defects.**
- **Test defects sent back to `senior-qa`:**
  - **T1 (TC-70, blocker):** the "invoice pill paid" check could never fail, because the panel prints "Paid" for a settled booking anyway.
  - **T2 (TC-66):** the invoice amount equalled the booking total, so the toast couldn't tell them apart.
  - **T3 (TC-71):** the fallback was asserted with `toBeTruthy()`.
  - **T4:** the debounce test never reached the page's debounce (`hh-search` holds input for 600 ms).
  - **T5 (TC-108):** it drove a protected method on an off-page bill.
  - **T6 (TC-92/94):** no positive controls.
  - **T7:** `PermissiveSession` lacked `@Injectable()`, causing 60 warnings.
  - **T8 (TC-110):** `{ref}` was never asserted.
  - **T9:** lint `!` warnings, non-blocking and accepted.
- **Reviewer flagged as partly automatable:** M-05 (class binding checkable in jsdom) and M-11 (PDF via a mocked jsPDF). Left manual.
- **Spec questions put to the user:** U1 (room status when the guest count is unknown) and U2 (TC-108 wording). Answered as D14 and D15.

### Round 2 (fix round for the 5d findings)

**`senior-qa`:**
- T1: the Invoice section's own `hh-status-pill` must read the paid label, and the page's invoice map holds `paid`.
- T2: the invoice is 25000 against a 24000 booking, with the exact toast built from `buildInvoiceId` + `MoneyPipe`.
- T3: exact `{ message: 'The server did not accept that.' }`.
- T4: Enter commits the term; there is no fetch at 100 ms and exactly one at 500 ms.
- T5: rewritten through the row menu on an on-page deep-linked bill.
- T6: monthly `create` and `edit/rb-2` render the drawer.
- T7: `@Injectable()` added.
- T8: a translate spy asserts `{ref:'BK-0001'}`.

**Re-run:** `bookings.spec.ts` + `invoices.spec.ts`: **137/137 passed** (74 + 63). No implementation defect found.

### D14 implementation and tests

**Engineer** (`frontend-staff-engineer`, sonnet, files disjoint from the running QA agent):
- `room-detail.ts:~242` adds `guestCountKnown = !loading && !error`.
- `room-detail.html:33-35` hides the header pill when the count is unknown.
- `:71` shows "—" for Occupied when unknown.
- `:91-98` omits the beds line, keeping "N no longer active".
- `ngc` is clean and lint has 0 errors.

**QA:** 6 new tests in `room-detail.spec.ts`:
- loading
- error
- loaded (guests only, so Partial and never Available)
- loaded and full
- monthly (immediate)
- unknown with past renters

No existing test encoded the old behaviour. **18/18 passed.**

### Second sync with main (before 5e)

`origin/main` had advanced **61 commits** (PRs up to #69, including the billing rework #94/#95). Synced without committing: patch plus file backup (45 files), `ff-only` to 9be3190, then `apply --3way`. **27 files applied cleanly; 2 conflicted:**
- **`bookings.ts` imports:** `main` removed `SubscriptionStore`, and with it the only uses of `RouterLink` / `LocaleLink`. Resolved to `RefetchDelay`, `{ALL_ROOMS_LIMIT, HostOpsApi}` and `{TranslocoPipe, TranslocoService}`; nothing else uses the dropped symbols.
- **`host.routes.spec.ts`:** `main` added a billing-page `describe` beside this branch's route-table tests. Kept both, plus the union of imports.

**Post-sync gates:**
- typecheck: exit 0
- `ngc --noEmit`: exit 0
- **full suite: 143 files, 2051 tests, all passed**

### 5e: browser verification (in progress)

**Setup:**
- The user's `localhost:4200` serves **another session's checkout** (`feat/95-host-billing-page`), confirmed because its `en.json` has none of this branch's keys. It cannot verify #83.
- This branch is served from the worktree on **localhost:4310**, through a `web-trello-83` entry added to the main checkout's (ignored) `.claude/launch.json`.
- The gitignored `.env` / `.env.production` were copied in so the API points at the live LAN backend `192.168.0.104:3000`.
- The user's session was already active on 4310.

**Found:**
- **Blocker (environment):** all three hostels on the account (`nHelLt` Ever Care paused, `MjvuEl` Backpacker in review, `DZNqAc` Ever Care published) get **403 "Your plan does not include CRM"** on Overview, Bookings and Invoices, so the stay flow has no live data. The user is enabling CRM on the account.
- **Verified live:**
  - **D2:** the nightly `MjvuEl` Invoices header shows Export CSV and **no Add invoice**; the monthly `DZNqAc` keeps Add invoice.
  - The error states render (Retry card, a single toast).
- **Outside this ticket:** on `localhost:4200`, the other session's search page (`/en/search?...`) froze the Chrome renderer (screenshot `Page.captureScreenshot` timed out after 30 s). Not investigated; it's on the billing branch.

#### 5e round 1: live flow on Backpacker `MjvuEl` (CRM enabled by the user, 2026-10-11)

Test data was created through the app with the user's approval. Booking **HH-2026-SFQZDB3N** (id `ewPcpb`) for "Flow Guest" (flow@example.com, 923001112233), 3 Dormitory beds, Oct 11–12, Rs 3,600, invoice **Invo-1026-fMKomI** (id `fMKomI`).

| Check | Result | Evidence |
|---|---|---|
| No-show offers no invoice (AC 10) | ✅ | the no-show row menu has only View details; the panel shows the new hint "The guest never arrived, so this booking is closed." and only Close |
| Deep link `bookings/:id` (D5, M-10) | ✅ | opening sets `/bookings/NViIvf`; a cold load opens the panel via `get()`; Close returns to the list |
| Pending booking: no Check in | ✅ | the menu is View details / Cancel / Confirm |
| Check-in dialog (card step 3) | ✅ | each room "3 of 3 beds free"; running total "0/3" → "3/3 guests placed · 101 × 2 · 102 × 1"; toast "Room 101 × 2, Room 102 × 1"; row shows `101 × 2 · 102 × 1`; URL back to the list |
| Free beds on room cards (AC 25) | ✅ | before: 101 "3 free · 0/3", 102 "3 free · 0/3"; after check-in "1 free · 2/3" and "2 free · 1/3" |
| **M-04** grid vs detail agree | ✅ | grid 2/3; detail Occupied "2 / 3", "2 of 3 beds occupied", **Partial** pill. The server's `current_occupancy` includes booking guests |
| Guests on bookings card (AC 26) | ✅ | "Flow Guest · HH-2026-SFQZDB3N · Guests: 2 · Until Oct 12, 2026" |
| **M-09** locale-prefixed links | ✅ | room-detail ref `href="/en/host/MjvuEl/bookings/ewPcpb"` opens the panel cold |
| Release, server side | ✅ | the occupancy is released; after a reload, "Room 102 · 1 guest" is struck through and marked "Released" |
| **Release: panel refresh (AC 30)** | ❌ **DEFECT D-1** | after a successful release the panel kept showing the room active with a Release button until a page reload. Reproduced twice (102, then 101). The re-read GETs (`bookings/ewPcpb`, `…/occupancies`) fired with 200 |
| Release 422 shown once (M-06) | ✅ | the second click gave "Occupancy is already inactive" inline, with no toast |
| **M-15** rooms after release | ✅ | both rooms back to "3 free · 0/3" |
| Generate invoice (AC 14) | ✅ | dialog "Raised once per booking, for Rs 3,600"; toast "Invoice generated — Invo-1026-fMKomI · Rs 3,600"; Invoice section shows number, amount, Due pill and View invoice; Generate replaced by View invoice |
| **M-01** invoice lookup after reload | ❌ **DEFECT D-2** | after a reload: "No invoice yet." and Generate is offered again. Probe: `f[billable_id][]=ewPcpb` → 0, `f[billable_id]` → 0, `f[booking.id]` → 0, **`f[billable_id.keyword][]` → 1**, lowercase `ewpcpb` → 1. The dynamic mapping makes `billable_id` analysed text, so mixed-case hashids never term-match |
| Nightly Invoices (D2) | ✅ | one full-width "Booking invoices" card (Rs 3,600 / 0 / 3,600); no Add invoice |
| Booking bill row (AC 3) | ✅ | "Flow Guest · HH-2026-SFQZDB3N" link, purple Booking badge, Due, issued Oct 11, due Oct 12 |
| **M-03** dates in hostel time | ✅ for this bill | issued Oct 11 and due Oct 12 (the checkout), correct days. A bill issued after 19:00 PKT was not tested |
| **M-02** guest-name search | ✅ | scope options are Room / Guest name (no Tenant on nightly). "Zzyzx" → "No invoices match", card Rs 0; "Flow" → 1 bill; request `s[booking.guest_name]=…`. **D10 search stays** |
| Booking-bill preview | ✅ | Billed to Flow Guest, "Booking HH-2026-SFQZDB3N"; only a "Room Rent Rs 3,600" line (zero lines dropped) |
| `invoices/view/:billId` (D5) | ✅ | a cold load opens the preview; Close returns to `/en/host/MjvuEl/invoices` |
| No Edit on booking bills (D6) | ✅ | the row menu has Mark as paid and Delete only |
| Invoice-side cross-pay dialog (D1) | ✅ (dialog only) | "Mark Invo-1026-fMKomI as paid?" with **"Also mark booking HH-2026-SFQZDB3N as paid" ticked**; cancelled, so nothing was paid |
| Monthly invoices unchanged (`DZNqAc`) | ✅ | Add invoice present; empty copy "…rent or utility bills" |
| **M-05** `sm:grid-cols-2` emitted | ✅ | the stylesheet has `@(min-width: 640px) .sm\:grid-cols-2 { grid-template-columns: repeat(2, …) }` |

**Observations outside this ticket's change:**
- **The room calendar disagrees with occupancy.** Room 101's own booking calendar marked Oct 11 "full" (3 beds taken) while only 2 guests were placed there. That calendar (`rooms/room-calendar/room-stays.ts`, from #80) draws the booking's line items (3 Dormitory beds), not its occupancies. A candidate follow-up.
- **The calendar showed a newly created booking only after a reload.** That's search-index lag in the existing create flow.
- **The first click on a panel action sometimes didn't register** (Generate invoice needed a second click). It's unclear whether this was an HMR reload from the engineer's concurrent edits; re-checked after the fix.

**Fix round (5e → 5b):** D-1 and D-2 went to one `frontend-staff-engineer` (strong model, the only engineer editing code) with the reproduction and the probe table.

**Fix report:**
- **D-1 root cause:** `GET …/occupancies` answers from the **search index** (backend `booking_occupancies_controller.rb:11`, `safe_search`), which lags about 1 s behind a release. The panel re-read it on an `occupancyTick` after the PUT succeeded and redrew stale data. It also ignored the page's DB-fresh `get()` copy for the same booking id. The GETs racing the PUT, a double send, and the deep-link swap were all ruled out.
  - **Fix** (`booking-details-panel.ts`): `occupancyTick` removed; a local `releasedIds` record (`:259`, set at `:316`, reset per booking); `occupancies` (`:299`) shows a room released if the panel released it **or** the booking copy says it is inactive. That is safe because the server never reactivates a room.
- **D-2 root cause:** `billable_id` has no explicit mapping in `renter_bill_index.rb`, so the dynamic template in `settings.rb:27-39` makes it lowercased text.
  - **Fix:** `host-ops-api.ts:864` sends `f[billable_id.keyword][]`, with a wire note at `:848`.
  - No other filter added by this ticket has the same issue: `occupied_room_ids` is an explicit keyword, slugs are lowercase, and dates are ranges.
- **Tests:** 8 new or changed cases, **all failing on the pre-fix code** (the engineer briefly reverted the fix to prove it) and passing after:
  - panel spec: 1 changed (it had asserted the index re-read) + 3 new
  - `bookings.spec`: 2 new, page level with the stub lagging like the index
  - `host-ops-api.spec`: 1 updated + 1 new
- **Gates:** typecheck and `ngc` clean; lint 0 errors; focused 7 files / 270 tests passed; CRLF kept.
- **Follow-ups noted:**
  - Reopening a panel within about 1 s of a release made elsewhere (e.g. a check-out) can still show index-stale rooms.
  - The list refetch has the same index lag (pre-existing).

#### 5e round 2: re-verification after the fix (same booking)

| Check | Result | Evidence |
|---|---|---|
| **M-01** invoice lookup after reload | ✅ | request `f[billable_id.keyword][]=ewPcpb`; panel shows "Invo-1026-fMKomI · Rs 3,600 · Due" + View invoice; Generate gone |
| **M-08** booking-side cross-pay | ✅ | dialog "Records Rs 3,600 as settled at the property, so nothing is left due." with **"Also mark invoice Invo-1026-fMKomI as paid" ticked**; toast "Booking and invoice marked paid"; Due Rs 0 · Paid; invoice pill Paid; Mark as paid gone. **After a reload, Invoices shows the bill Paid (paid at Oct 11) and the card at 3,600 / 3,600 / 0** |
| Check-out | ✅ | dialog "Every bed this booking holds is released."; toast "Checked out — Every bed this booking held is free again." |
| "Stayed in" history (AC 31) | ✅ | "Room 101 · 2 guests — Checked out", "Room 102 · 1 guest — Checked out", no Release; hint "This stay has been invoiced."; only View invoice |
| D-1 release refresh, live | ⏳ | needs a booking that is currently checked in; Flow Guest's rooms were already released before the fix |

#### D16 fix: room calendar per-room beds

**Engineer** (`frontend-staff-engineer`, strong model, alone):
- `room-stays.ts`: new `occupanciesOf` (`:124`); `toRoomStay(b, capacity, roomId?)` (`:144`) returns `RoomStay | null`; `toRoomMonth(…, roomId?)` (`:216-232`) drops the nulls and uses `laneKeyFor`, so legacy slugs fold.
- `room-calendar.ts:228` passes `q.room`.
- `host-bookings-api.ts:162-198`: `bookingsInRoom` is a `forkJoin` of `f[room.id]` and `f[occupied_room_ids]` (same window, limit 100), de-duplicated with first-room results first.

**Rule as implemented:**
- No occupancies: unchanged.
- Checked in: active occupancies in this room.
- Otherwise: all occupancies in this room (history).
- None counting here: not drawn.
- A room sold whole counts 1. Cancelled bookings are still dropped by `holdsBeds`.

**Tests:** 11 new, **8 of which failed on the old code:**
- `room-stays.spec.ts:238`: 7 cases.
- `room-calendar.pips.spec.ts:143`: a split party fills 2 pips, not 3.
- `host-bookings-api.spec.ts:191`: 3 cases (two requests, de-duplication, no request without ids).

No existing test changed.

**Integration (orchestrator):** the engineer flagged a third caller it didn't own, `tenants/tenant-form-drawer/tenant-form-drawer.ts:260` (the tenant form's availability check). That call didn't pass a room id, so with the union fetch it would have charged second-room bookings in full and could wrongly report a room full. I added `q.roomId` as the last argument (one line; CRLF kept).

**Gates after the integration line:**
- `nx typecheck web`: 0
- `ngc --noEmit`: clean
- `nx lint web`: 0 errors, 184 warnings
- **full suite: 143 files, 2074 tests, all passed**

**Limits:**
- After check-out, a split party is found only via its first room (`occupied_room_ids` holds active occupancies only), so a past stay's second room shows nothing.
- There is no release date in the API.
- The search index lags about 1 s right after a move.
- Two requests per room-month. The backend's `or[n][key]` support (`search_helper.rb:98-131`) could make it one, but that is untested live and would be dangerous if silently ignored: every unallotted booking would show on every room. A follow-up.

#### 5e round 3: second test booking (user-approved)

**HH-2026-ZGGNUUZ3** (id `aOEXGy`), "Flow Guest 2" (flow2@example.com), 3 Dormitory beds, Oct 11–12. Confirmed, then checked in as 101 × 2 + 102 × 1. It is cancelled at the end of verification.

| Check | Result | Evidence |
|---|---|---|
| **D16** room 102 calendar | ✅ | Oct 11: 1 bed taken, "2 free", "Partly booked". Before the fix, 102 never saw this booking (not its first room) |
| **D16** room 101 per-room count | ✅ count / ❌ total | the roster charges "Flow Guest · 2 beds" and "Flow Guest 2 · 2 beds" (per room, not the party of 3), but the night reads **"4 of 3 beds · over 1"**: Flow Guest 1 checked out this morning and still counts for its booked night. **Oct 12 shows "over -3"**. Leads to **D17** |
| **D-1** release refresh | ✅ | on a cold deep link, Release on 102 turned it struck through with "Released" immediately, **with no reload**; 101 kept its Release button |
| Panel from a list row | ❌ **D18** | the **DB** (`GET bookings/aOEXGy`) says `checked-in`, 2 occupancies; the **index** (list) says `confirmed` **minutes after** check-in. The panel opened from the row showed "Confirmed" with Check in / Mark no show and no rooms. Backend follow-up: the booking document isn't reindexed promptly on check-in |
| Tool note | — | the extension's simulated clicks sometimes miss `hh-tabs` and some buttons at 1.5× DPR; a DOM `click()` works every time. **Not an app defect**, so I withdrew my earlier "first click swallowed / hydration" note |

**Fix round:** D17 (room-calendar folder) and D18 (bookings page/panel) went to two `frontend-staff-engineer`s **in parallel on disjoint files**. Each was told it runs alongside the other: no formatter, no whole-tree gates, focused specs only. The orchestrator runs the full gates after both land.

#### D17 and D18 fixes (two engineers in parallel, disjoint files)

**D17** (`rooms/room-calendar/`):
- **Negative label root cause:** the pips came from `bookingsOn(date)`, which includes guests leaving that morning, and set `oversold = pips > capacity`. The label used overnight `booked`, giving 0 − 3 = "over -3" (`room-calendar.ts:358-373` old, `:504`).
- **Fix:** one predicate, `sleepsOn` (`room-stays.ts:105`), drives both `booked` (`:233`) and the pips (`room-calendar.ts:380`); `oversold = booked > capacity` (`:394`).
- **Checked-out rule:** `nightsHeldUntil` (`room-stays.ts:124-126`) ends a checked-out stay at today, applied in `toRoomStay` (`:205`), so the bar, the roster "out" and the departure count agree. "Today" is the calendar's existing device-local `today()` (`room-calendar.ts:94`); **the calendar has no hostel time zone available.**
- **Behaviour change:** guests leaving that morning no longer fill pips on their check-out day; the ↑N marker, the roster "out" badge and the "N out" count are unchanged.
- **The tenant form** inherits the fix through the default `today`.
- **Tests:** 7 new tests failed first, plus 2 guards. Focused run: 84/84.

**D18** (`bookings/`):
- `openDetails` (`bookings.ts:288`) and the URL path (`:360`) call `reread` (`:324`): one quiet `get()`. When it answers, the DB copy goes into `viewing`, the row (`replaceBooking`) and the calendar (`applyChange`). The off-page deep link reuses its own `get()` (no double fetch). A failure keeps the list copy silently.
- **Precedence:** a counter that bumps on open, on move start, on move land or refusal, and on release. **A move's reply always wins** over an overlapping re-read; an answer for another booking, or after close, is dropped.
- **Panel** (`booking-details-panel.ts:299-313`): it merges the rooms the booking carries but the lagging occupancies endpoint hasn't listed yet. Rooms only ever go from active to released, so the merge is safe.
- **Tests:** 7 new tests failed first; 4 race guards were proven by breaking the code. 3 existing tests were strengthened (their premise was "opening reads nothing"). Focused run: 238/238.

**Full gates after both:**
- typecheck 0; `ngc` clean; lint 0 errors (184 warnings); `i18n:check` clean; no focus markers.
- **Full suite: 143 files, 2096 tests, all passed.**
- **Environment note:** the default full run crashed twice with V8 **out of memory** (`NewSpace::EnsureCurrentCapacity`, then `DataCloneError`): 73 node processes from other sessions were using 11 GB, with 9.5 GB free. It passed with `NODE_OPTIONS=--max-old-space-size=6144 … --maxWorkers=4`. Not a test failure.

#### 5e round 4: final live re-check

| Check | Result | Evidence |
|---|---|---|
| **D17** room 101, Oct 11 | ✅ | "1 free", 2 beds taken, "↓2 ↑1"; roster "2 of 3 beds · 2 in · 1 out", **Partly booked**; Flow Guest's range shortened to "Oct 11 – Oct 11 · 2 beds"; Flow Guest 2 "Oct 11 – Oct 12 · 2 beds" |
| **D17** room 101, Oct 12 | ✅ | "3 free" with the ↑1 departure marker only: no stripe, no "over -3" |
| **D18** panel from the list | ✅ consistent (tests prove the fix) | by now the index had caught up (row "Checked In"), so the stale-row case could not be reproduced. The panel opened from the row shows Checked In, 102 Released and 101 active. The fix is proven by its failing-first tests |
| Cancel, no invoice (D8) | ✅ | the dialog lists "In rooms: 101 × 2" and has **no** open-invoice warning (none exists); reason entered; toast "Booking cancelled — The guest, host and manager have been told." |
| "Stayed in" on cancelled (AC 32) | ✅ | read-only Room 101 · 2 and Room 102 · 1. Each row reads "Checked out", per the agreed spec; on a cancelled booking that wording is imprecise (copy follow-up) |
| **M-15** rooms after cancel | ✅ | 6 free · 0/6; 101 and 102 "3 free · 0/3" |

**Test data left on the dev DB (hostel `MjvuEl`):**
- HH-2026-SFQZDB3N (`ewPcpb`): checked out and paid, with invoice Invo-1026-fMKomI paid.
- HH-2026-ZGGNUUZ3 (`aOEXGy`): cancelled, reason "QA test booking for Trello #83, no real guest".
- No beds are held.

**Cleanup:**
- the Chrome tab is closed;
- the 4310 server is stopped;
- the `web-trello-83` entry is removed from the main checkout's ignored `.claude/launch.json`.

**Never browser-verified (stated plainly):**
- **M-12** print escaping with a hostile guest name: covered by TC-111.
- **M-13** staff without `RenterBill:index`: route structure covered by TC-44.
- **M-14** keyboard and screen-reader checks on the checkboxes, and the panel on mobile.
- **M-03** a bill issued after 19:00 PKT.
- **M-11** the booking-bill PDF.

**Earlier status (round 2):**
- the release refresh (D-1): verified in round 3;
- the room calendar per-room beds (D16), fixed and unit-tested;
- M-12, the print escaping with a hostile guest name (covered at unit level by TC-111);
- M-13, staff without `RenterBill:index` (no such staff account was used);
- M-14, keyboard/mobile checks (not run).

## Summary

**Area:** host console, specifically the stay flow. It covers host bookings (booking details panel, check-in, release, check-out, cancel), host invoices / renter bills (booking bills, billing-mode view, cross mark-as-paid), and host rooms (free beds, room detail booking guests, room calendar per-room occupancy).

**Branch:** `feat/stay-flow-invoices-rooms`, in worktree `.claude/worktrees/trello-83`, on top of `origin/main` 9be3190, **uncommitted**. It touches 34 tracked files (+3,304 / −264) plus 15 new files (`util/host-links.ts`, `testing/*` ×5, 9 new specs).

**Routing:** 5 planned tasks went to `frontend-staff-engineer`s, two in wave 1 (the data seam, then routes and i18n) and three in wave 2 (invoices, bookings, rooms). That was followed by EM pass B, an integration fix round, and 5 fix rounds driven by verification:
- R1: release refresh and invoice lookup.
- D14: room status while unknown.
- D16: room calendar per room.
- D17: checked-out stays, negative label.
- D18: re-read on open.

Everything is frontend; there are no backend changes.

**What was delivered:**
- **Booking bills are a real bill kind.** `InvoiceKind` gains `booking`. The table shows a Booking badge and "Billed to" (guest · ref linking to the booking), never a broken tenant link. The preview, PDF, print and CSV handle the new kind. Edit is hidden on booking bills (D6). **The print window HTML-escapes every value** (D7).
- **The Invoices page follows the billing mode (D2).** Nightly hostels get one full-width "Booking invoices" card (from status totals), no kind or tenant filters, no manual Add, and guest-name search (`s[booking.guest_name]`, verified live). Monthly hostels are unchanged.
- **A booking knows its invoice.**
  - Page-level lookup via `f[billable_id.keyword][]`; the `.keyword` was found live (D-2).
  - The panel Invoice section has four states: loading, none, the invoice (Due/Overdue/Paid + View invoice), and failed.
  - Generate keeps the returned bill; no-show can't be invoiced.
  - `invoices/view/:billId` and `bookings/:bookingId` deep links work, including off-page items.
- **Cross mark-as-paid (D1)** in both directions: a ticked checkbox in the confirm dialog, with a sequential two-request flow, one busy guard, and partial-failure copy.
- **Panel correctness:**
  - "Stayed in" history on checked-out and cancelled bookings.
  - A release updates at once (D-1: no re-read of the lagging occupancy index).
  - The panel re-reads the booking from the DB on open (D18).
  - The cancel dialog warns when an invoice is still open (D8).
  - Errors show once, inline, wherever an inline surface exists (D12).
- **Rooms:**
  - "N free" / "Full" on the room cards.
  - Room detail lists booking guests, and its occupied figure = renters + guests. The status is hidden while the guest count is unknown (D14).
  - The room calendar counts each booking's occupancies **in that room** and fetches the union of first room and occupied rooms (D16). Checked-out stays stop holding beds from today, and the departure-day label can't go negative (D17).
- **Bundle:** the route reuse strategy is keyed on `data.drawerHost`, so it no longer imports any page. The initial bundle dropped from 2.98 MB to 2.70 MB in Phase 3, below main at the time.

**Component reuse:**
- 10 design nodes: 1 FULL, 5 PARTIAL-EXTEND, 4 PARTIAL-COMPOSE, 0 NEW. **No change to `@hostelhive/ui`.**
- 30 new i18n keys in `en.json` (CRLF kept); the other 17 locales fall back to English.

**Change surface:**
- All declared rows are done.
- Undeclared rows, now done:
  - `booking-month.ts` (shared stage lists);
  - `tenant-form-drawer.ts:260` (D16 integration, one argument);
  - `rooms/room-calendar/**` (D16/D17, added by user request);
  - `apps/web/tsconfig.app.json` / `tsconfig.spec.json` (test helpers);
  - `apps/web/src/app/testing/*`.
- Declared but not touched: `host.routes.spec.ts` was later extended by QA; `assign-rooms-panel.spec.ts` never needed a change.
- The drift is modest. The room calendar work is scope the user added after a live finding.

**Tests:**
- The approved matrix covers TC-01 to TC-120 (all automated, each claimed by exactly one batch) plus D14/D16/D17/D18/D-1/D-2 cases. Every fix case was shown failing before its fix.
- **Full suite: 143 files, 2096 tests, all passed** (run with 4 workers because of machine memory pressure).
- Independent review (5d): 112 rows covered, 7 weak and 1 hollow, all fixed in round 2. No implementation defects.

**Lint:**
- 0 errors and 184 warnings. The new ones are `no-non-null-assertion` in new specs, matching existing specs.
- The production-file warnings predate this ticket.
- typecheck, `ngc` with strict templates, and `i18n:check` are all clean. The formatter is not used (the repo isn't Prettier-formatted, and CI doesn't check formatting).

**Browser verification:**
- Done live on localhost:4310 (this branch) against the LAN API, using hostels `MjvuEl` (nightly) and `DZNqAc` (monthly) after the user enabled CRM.
- It found **five real defects** that unit tests could not catch: D-1, D-2, D16, D17 and D18. All are fixed and re-verified live, except D18's stale-index case, which could no longer be reproduced (the index caught up); D18 is proven by its tests.
- **Not browser-verified:** M-03 (an evening-issued bill), M-11 (PDF), M-12 (hostile name in print), M-13 (staff permission), M-14 (keyboard/mobile). Each has unit-level coverage except M-11 and M-14.

**Manual QA plan:** the M-01 to M-15 table in **Test matrix**, plus the 5e round tables under **QA results**.

**Open items and follow-ups:**
1. **Backend:** the search index lags (occupancies seconds; a booking's disposition stayed "confirmed" for minutes after check-in), and `billable_id` is analysed text. Both are worked around in the FE; the backend should map hashid fields as keyword and reindex bookings promptly on lifecycle moves.
2. **Backend:** summary aggregates have no `booking` bucket (the FE derives it from status totals on nightly hostels).
3. **Backend:** there is no release or actual check-out timestamp on occupancies, so the calendar can't place a mid-stay release precisely (documented limits for D16/D17).
4. **FE:** the room calendar uses the device's date for "today", not the hostel's time zone. It is the same pre-existing notion, but now affects D17.
5. **FE:** two requests per room-month (the `or[n][...]` single-request form is untested live).
6. **FE copy:** "Stayed in" rows on a **cancelled** booking read "Checked out"; consider "Released" or a neutral label.
7. **FE:** translating the whole check-in/lifecycle area into i18n keys is a follow-up (D9).
8. **Outside this ticket:**
   - On `localhost:4200` (the other session's billing branch) the `/en/search` page froze the Chrome renderer.
   - A newly created booking appears on the bookings calendar only after a reload (index lag in the existing create flow).

**State at hand-off:**
- branch `feat/stay-flow-invoices-rooms`, **green** (gates and full suite), **uncommitted**, rebased on `origin/main` 9be3190;
- nothing pushed;
- awaiting the delivery gate.

### Knowledge base: drafted, pending merge

The repo keeps `docs/knowledge-base/` (`README.md`: `area/<area>.md`, `decisions/<area>/<decision>.md`). These entries are drafted here and **applied in Phase 9, after the MR merges**:

| Target | Kind | Why it earns a place |
|---|---|---|
| `decisions/api-and-data/search-backed-filters-use-keyword-for-hashids.md` | decision | Obfuscated ids on dynamically mapped search fields are analysed text, so `f[billable_id]` never matches `ewPcpb`; `f[<field>.keyword]` does. Invisible in the FE code except for one comment, and the next filter on a hashid would fall into it again. Evidence: the live probe table in 5e round 1 |
| `decisions/api-and-data/index-backed-reads-lag-trust-db-and-local-writes.md` | decision | The list, calendar and `…/occupancies` endpoints answer from the search index (seconds to minutes behind); `GET bookings/:id` reads the DB. The UI trusts its own successful writes (`releasedIds`) and re-reads the DB copy on open (D18); a move's reply beats an overlapping re-read. Someone would otherwise "simplify" by re-fetching the list after a write |
| `decisions/host-console/invoices-page-follows-billing-mode.md` | decision | D2: nightly hostels have only booking bills (no rent/utility, no manual Add); monthly hostels never have booking bills. The user's product rule, not derivable from the code |
| `decisions/host-console/room-occupancy-counts-per-room-occupancies.md` | decision | D16/D17: charge a room only the guests placed in it; checked-out stays stop at today; union fetch; the documented release-date limits |
| `decisions/host-console/cross-pay-checkbox-ticked-by-default.md` | decision | D1: booking and invoice payments are independent on the server; the UI offers the other side as a ticked checkbox, sequentially, with no rollback. The rejected option (two buttons) is recorded |
| `area/host-console.md` | area edit | the new deep links (`bookings/:bookingId`, `invoices/view/:billId`), the `drawerHost` route data, `util/host-links.ts`, the booking-bill kind, and the panel's invoice section |
| `area/api-and-data.md` | area edit | `ApiRequestOptions` / `requestContextArgs` (per-call toast opt-out, now on `put` too) and the index-vs-DB note |

No pending markers name this branch.

## Notes

### Why the run used a worktree

The main checkout was in use by another session (first `feat/mascot-loader` with its dev server on 4300, later `feat/95-host-billing-page` serving 4200). Working there would have changed files under another session's running server. The worktree's `node_modules` is a junction to the main checkout's, and its gitignored env files (`*.env.ts`, `.env`, `.env.production`) were copied from there. **Clean-up after delivery:** remove the junction first (`rmdir` on the junction, never a recursive delete through it), then the worktree.

### localhost:4200 was not this branch

The user pointed browser QA at `localhost:4200`. Its `en.json` had none of this branch's keys: it was the other session's billing checkout. Verifying there would have proven nothing about #83, so the branch was served on 4310 with the user's agreement.

### The browser tool, not the app, missed clicks

At 1.5× DPR the Chrome extension's simulated clicks sometimes missed `hh-tabs` and some buttons, while a DOM `click()` always worked. An earlier note blaming SSR hydration was withdrawn.

### Search-index lag is the root of three of the five live defects

D-1 (occupancies), D-2 (an analysed `billable_id`) and D18 (a stale disposition) all come from the backend serving lists from its search index. The FE now handles all three; the backend follow-ups are listed under **Summary**.

