import { Invoice } from '@hostelhive/data-access';
import { InvoiceCounts, shiftInvoiceCounts } from './invoice-overlay';

function bill(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'b1',
    renterId: 'r1',
    roomId: 'rm1',
    tenantName: 'A Tenant',
    roomNumber: '1',
    floor: 'ground',
    kind: 'rental',
    amount: 5000,
    status: 'due',
    issued: '2026-09-01',
    lines: [],
    payNote: '',
    ...over,
  } as Invoice;
}

const BASE: InvoiceCounts = {
  total: 10,
  statuses: [
    { name: 'Due', slug: 'due', count: 6 },
    { name: 'Paid', slug: 'paid', count: 4 },
  ],
  aggs: {
    rentTotal: 50_000, rentPaid: 20_000, rentBalance: 30_000,
    utilityTotal: 8_000, utilityPaid: 3_000, utilityBalance: 5_000,
  },
};

/**
 * The figures that describe the list, moved to match rows changed without a refetch.
 *
 * These are why a local update is safe to do at all. Get them wrong and the page shows a
 * correct list beside a summary stating what was true a moment ago — the worse failure,
 * because the two disagree on screen and neither looks wrong alone.
 */
describe('shiftInvoiceCounts', () => {
  it('leaves everything alone when nothing changed', () => {
    expect(shiftInvoiceCounts(BASE, [])).toBe(BASE);
  });

  // A new bill is unpaid the moment it is issued: it lands on total and balance, not paid.
  it('books a created bill onto the total, its status and the balance', () => {
    const out = shiftInvoiceCounts(BASE, [{ before: null, after: bill({ amount: 5000 }) }]);

    expect(out.total).toBe(11);
    expect(out.statuses.find((s) => s.slug === 'due')!.count).toBe(7);
    expect(out.aggs!.rentTotal).toBe(55_000);
    expect(out.aggs!.rentBalance).toBe(35_000);
    expect(out.aggs!.rentPaid).toBe(20_000);
  });

  /**
   * Marking paid moves money between buckets rather than adding any — which is only
   * answerable from the previous state, and is why the baseline is kept.
   */
  it('moves a settled bill from balance into paid', () => {
    const before = bill({ amount: 5000, status: 'due' });
    const after = bill({ amount: 5000, status: 'paid' });
    const out = shiftInvoiceCounts(BASE, [{ before, after }]);

    expect(out.total).toBe(10);
    expect(out.statuses.find((s) => s.slug === 'due')!.count).toBe(5);
    expect(out.statuses.find((s) => s.slug === 'paid')!.count).toBe(5);
    expect(out.aggs!.rentTotal).toBe(50_000);
    expect(out.aggs!.rentPaid).toBe(25_000);
    expect(out.aggs!.rentBalance).toBe(25_000);
  });

  // An amended amount has to come out at the old figure before going back in at the new one.
  it('replaces an edited amount rather than adding it', () => {
    const out = shiftInvoiceCounts(BASE, [
      { before: bill({ amount: 5000 }), after: bill({ amount: 7000 }) },
    ]);

    expect(out.total).toBe(10);
    expect(out.aggs!.rentTotal).toBe(52_000);
    expect(out.aggs!.rentBalance).toBe(32_000);
  });

  // Status untouched: the counts must not drift just because the row was rewritten.
  it('does not move the status counts when the status did not change', () => {
    const out = shiftInvoiceCounts(BASE, [
      { before: bill({ amount: 5000 }), after: bill({ amount: 7000 }) },
    ]);
    expect(out.statuses.map((s) => s.count)).toEqual([6, 4]);
  });

  // A bill can be amended from rent to utility, so each side is booked against its own kind.
  it('books the two sides against their own kinds when the kind changes', () => {
    const out = shiftInvoiceCounts(BASE, [
      { before: bill({ kind: 'rental', amount: 5000 }), after: bill({ kind: 'utility', amount: 5000 }) },
    ]);

    expect(out.aggs!.rentTotal).toBe(45_000);
    expect(out.aggs!.rentBalance).toBe(25_000);
    expect(out.aggs!.utilityTotal).toBe(13_000);
    expect(out.aggs!.utilityBalance).toBe(10_000);
  });

  it('accumulates several changes at once', () => {
    const out = shiftInvoiceCounts(BASE, [
      { before: null, after: bill({ id: 'n1', amount: 1000 }) },
      { before: null, after: bill({ id: 'n2', amount: 2000 }) },
    ]);

    expect(out.total).toBe(12);
    expect(out.statuses.find((s) => s.slug === 'due')!.count).toBe(8);
    expect(out.aggs!.rentTotal).toBe(53_000);
  });

  // A status the server never reported cannot be counted into a tab that does not exist.
  it('ignores a status with no tab of its own', () => {
    const out = shiftInvoiceCounts(BASE, [
      { before: null, after: bill({ status: 'over-due' }) },
    ]);
    expect(out.statuses.map((s) => s.slug)).toEqual(['due', 'paid']);
    expect(out.total).toBe(11);
  });

  // No aggs means the server sent none and the page sums its own rows — already correct
  // from the overlaid list, so there is nothing here to adjust.
  it('leaves absent aggs absent', () => {
    const out = shiftInvoiceCounts({ ...BASE, aggs: null }, [{ before: null, after: bill() }]);
    expect(out.aggs).toBeNull();
    expect(out.total).toBe(11);
  });

  it('never drives a status count below zero', () => {
    const thin: InvoiceCounts = { ...BASE, statuses: [{ name: 'Due', slug: 'due', count: 0 }] };
    const out = shiftInvoiceCounts(thin, [
      { before: bill({ status: 'due' }), after: bill({ status: 'paid' }) },
    ]);
    expect(out.statuses[0].count).toBe(0);
  });
});
