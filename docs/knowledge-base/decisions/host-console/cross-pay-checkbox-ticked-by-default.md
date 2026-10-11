# Paying a booking or its invoice offers the other, as a ticked checkbox

**Status:** Accepted
**Area:** [host-console](../../area/host-console.md)

## Context
On the server, a booking's `mark_as_paid` and its invoice's (renter bill) `mark_as_paid` are independent: paying one leaves the other due. A host settling a guest at the desk would have to pay twice, on two pages, or leave the booking and its invoice disagreeing.

## Decision
- **A checkbox in the confirm dialog that already exists, ticked by default, in both directions.**
  - Bookings page: "Also mark invoice … as paid" when the booking has an unpaid invoice (`payInvoiceToo`).
  - Invoices page: booking bills open a confirm, while rental and utility bills stay one click. The page reads the booking meanwhile, with Confirm disabled. It offers "Also mark booking … as paid" when the booking still owes on a payable stage, and also when that read fails, since a booking that is already paid only answers with a harmless 422.
- **Two sequential requests under one busy guard**, starting with the page's own side: on the bookings page `markPaid` runs inside one `send()`; on the invoices page `confirmPay` holds `paying` throughout. Nothing else can start between them.
- **No rollback.** If the first request fails, nothing is paid and the error shows as usual. If the second fails, the first stays paid, and a toast says which side succeeded:
  - "Booking marked paid, but the invoice was not. {{reason}}" (`hostBookings.invoiceNotPaid`, reason from `crossPayInvoiceFailureKey`);
  - "Invoice marked paid, but the booking was not. {{reason}}" (`hostInvoices.bookingNotPaid`, reason from `bookingMoveFailureKey`).

  The reason is always a translated sentence, never server text; see the raw-error trap in [api-and-data](../../area/api-and-data.md).
- No `@hostelhive/ui` change: the checkbox is projected into `confirm-modal`.

## Alternatives rejected
- **Two buttons ("Mark booking paid" / "Mark both").** Not chosen (user decision D1): it adds a choice to every payment, where the checkbox keeps the one dialog the host already knows.
- **Unticked by default.** A guest settling at the desk has usually settled the invoice too (the code comment on `payInvoiceToo`).
- **Roll back the first payment when the second fails.** That payment is money already recorded at the desk; undoing it would misstate what happened.
- **Quote the server's refusal in the partial-failure toast** (the first build). Replaced in PR #131 by translated reasons.

## Consequences
- A partial failure leaves the two sides disagreeing until the host pays the other one on its own page. The toast says which one.
- A failed invoice mark-paid on the invoices page can still toast twice, once from the global toast and once from the page. This matches rental and utility bills on `main`.

## Evidence
- `apps/web/src/app/features/host/bookings/bookings.ts` — `payInvoiceToo`, `markPaid`, `unpaidInvoice`; `bookings.html` (the checkbox).
- `apps/web/src/app/features/host/invoices/invoices.ts` — `promptBookingPay`, `confirmPay`, `alsoPayBooking`.
- `apps/web/src/app/features/host/bookings/booking-move-failure.ts`; `apps/web/src/app/util/booking-refusal.ts`.
- `docs/implement/TRELLO-83.md` — decision D1; 5e rounds 1 and 2 (M-08).
- Trello #83; PR #128, error copy fixed in PR #131 (KratosvsEzio/hostelhive-FE), run notes `docs/implement/TRELLO-83.md`
