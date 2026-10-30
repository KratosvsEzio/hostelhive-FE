# The Invoices page follows the hostel's billing mode

**Status:** Accepted
**Area:** [host-console](../../area/host-console.md)

## Context
Renter bills have three kinds: `rental`, `utility` and `booking` (a bill raised for a checked-in or checked-out booking). The page was built for monthly hostels: rent and utility summary cards, a type filter, a tenant filter, and a manual Add invoice. The API's rent and utility totals count only those bill types (backend `aggregation_helper.rb`), so booking money appeared in no card.

The user's product rule: backpackers are not charged rental or utility bills.

## Decision
- **Nightly hostels** (`HostPropertyStore.isNightlyBilled`) only ever have booking bills. Their page shows:
  - one full-width "Booking invoices" card (total, paid, balance), summed from the per-status totals, which are exact because every bill is a booking bill;
  - no rent or utility cards, no type or tenant filter, and no Add invoice (the `create` URL shows the list);
  - guest-name search (`s[booking.guest_name]`), nightly empty-state copy and nightly CSV columns.
- **Monthly hostels** never have booking bills. Their page is unchanged: rent and utility cards, Rental and Utility in the type filter (no Booking option), the tenant filter, and Add invoice.
- **An unknown mode gets the monthly view.** The mapper renders any booking bill correctly (Booking badge, "Billed to" guest and booking ref) whatever the mode.
- Booking bills are never editable in either mode. An edit would send `billable_type: 'Renter'` and rewrite the bill.

## Alternatives rejected
- **Add a derived Booking card beside rent and utility on every hostel** (the plan's first recommendation). On a nightly hostel the rent and utility cards would always read zero, and on a monthly one the booking card would.
- **Keep Booking in the type filter.** Neither mode has a reason to choose it.
- **Nightly view for an unknown mode.** It would hide Add invoice and the rent and utility cards from a hostel that may need them. This is the same fail-open rule as [the billing-cycle gates](./billing-cycle-gates-fail-open.md).

## Consequences
- A nightly hostel sends no `f[bill_type]`, so a stray rental bill left on one still shows in its list and status counts. It no longer reaches the booking card, which reads only booking bills.
- The booking card reads the API's booking bucket, `aggs.booking {total, paid, balance}`, from BE azeem-hamza/hostelhive#67 (Trello #164). Until then the card was derived on the frontend from the per-status totals; that derivation is gone.

## Evidence
- `apps/web/src/app/features/host/invoices/invoices.ts` — `nightly`, `bookingSummary`, `activeKind`, `addOpen`, `editingInvoice`; `invoices.html`.
- `apps/web/src/app/services/host-ops-api.ts` — `invoices()` maps `aggs.booking`.
- `apps/web/src/app/util/filter-configs/invoice-filter-groups.ts` — the `renterBills` parameter.
- `apps/web/src/app/util/table-configs/invoice-table-cols.ts` — the Booking badge and "Billed to" cell; `toInvoice` in `apps/web/src/app/services/host-ops-api.ts`.
- `docs/implement/TRELLO-83.md` — decisions D2, D3 and D6; 5e round 1 (nightly and monthly Invoices).
- Trello #83; PR #128 (KratosvsEzio/hostelhive-FE), run notes `docs/implement/TRELLO-83.md`
