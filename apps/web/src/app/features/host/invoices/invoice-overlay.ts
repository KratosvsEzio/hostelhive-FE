import { Invoice } from '@hostelhive/data-access';

/** The rent/utility money the list summarises, as the API reports it. */
export interface InvoiceAggs {
  utilityTotal: number;
  utilityPaid: number;
  utilityBalance: number;
  rentTotal: number;
  rentPaid: number;
  rentBalance: number;
}

/** Everything on the page that counts invoices rather than listing them. */
export interface InvoiceCounts {
  total: number;
  statuses: { name: string; slug: string; count: number }[];
  aggs: InvoiceAggs | null;
}

/**
 * One row the page changed locally — `before` null when it is new, `after` null when it is
 * gone. Never both.
 *
 * Both sides are carried, not just the result: a bill moving from due to paid takes its
 * amount out of the balance as well as putting it into paid, and only the previous state
 * says which bucket to take it from. A deletion is the same shape with nothing on the far
 * side, which is what lets create, amend, settle and delete share one piece of arithmetic
 * instead of four that each have to remember the figures.
 */
export interface InvoiceChange {
  before: Invoice | null;
  after: Invoice | null;
}

/** What one bill contributes to its kind's three figures. */
function contribution(inv: Invoice): { total: number; paid: number; balance: number } {
  const paid = inv.status === 'paid';
  return { total: inv.amount, paid: paid ? inv.amount : 0, balance: paid ? 0 : inv.amount };
}

/**
 * The page's counts, moved to match rows that were changed without refetching.
 *
 * Create, amend, settle and delete all land here, because they are the same question asked
 * four ways: a row was one thing and is now another — possibly nothing — and the figures
 * describing the list have to follow. Handling them separately is how a page ends up with a
 * correct list and a summary card stating what was true a moment ago: the worse failure,
 * because the two disagree on screen and neither looks wrong on its own.
 *
 * Arithmetic on what the last fetch reported, never a recount: the page holds one page of
 * bills while these figures describe every bill the filter matches. Counting what is visible
 * would be counting the wrong set.
 *
 * `aggs` absent means the server sent none and the page falls back to summing its rows —
 * which it does from the overlaid list, so it is already right and must be left alone.
 */
export function shiftInvoiceCounts(
  base: InvoiceCounts,
  changes: readonly InvoiceChange[],
): InvoiceCounts {
  if (!changes.length) return base;

  let total = base.total;
  const byStatus = new Map<string, number>();
  const money = { rental: { total: 0, paid: 0, balance: 0 }, utility: { total: 0, paid: 0, balance: 0 } };

  for (const { before, after } of changes) {
    if (!before && after) total += 1;
    if (before && !after) total -= 1;

    if (before) byStatus.set(before.status, (byStatus.get(before.status) ?? 0) - 1);
    if (after) byStatus.set(after.status, (byStatus.get(after.status) ?? 0) + 1);

    // A bill can be edited from one kind to the other, so each side is booked against its
    // own kind rather than both against the after's.
    if (before) {
      const c = contribution(before);
      const m = money[before.kind];
      m.total -= c.total;
      m.paid -= c.paid;
      m.balance -= c.balance;
    }
    if (after) {
      const c = contribution(after);
      const m = money[after.kind];
      m.total += c.total;
      m.paid += c.paid;
      m.balance += c.balance;
    }
  }

  const statuses = base.statuses.map((s) =>
    byStatus.has(s.slug) ? { ...s, count: Math.max(0, s.count + byStatus.get(s.slug)!) } : s,
  );

  const aggs = base.aggs
    ? {
        rentTotal: base.aggs.rentTotal + money.rental.total,
        rentPaid: base.aggs.rentPaid + money.rental.paid,
        rentBalance: base.aggs.rentBalance + money.rental.balance,
        utilityTotal: base.aggs.utilityTotal + money.utility.total,
        utilityPaid: base.aggs.utilityPaid + money.utility.paid,
        utilityBalance: base.aggs.utilityBalance + money.utility.balance,
      }
    : base.aggs;

  // Floored rather than trusted. These figures and the page disagree by design — the page
  // holds ten rows while the total counts every bill the filter matches — so a server total
  // that has drifted low must not be driven negative by deletions it never counted.
  return { total: Math.max(0, total), statuses, aggs };
}
