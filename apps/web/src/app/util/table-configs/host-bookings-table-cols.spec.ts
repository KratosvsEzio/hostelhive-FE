import { HostBooking } from '@features/host/bookings/host-bookings-api';
import { HOST_BOOKINGS_TABLE_COLS } from './host-bookings-table-cols';

/** A booking with only the money fields that matter here filled in. */
function booking(over: Partial<HostBooking> = {}): HostBooking {
  return {
    id: 'vKkMIE',
    ref: 'HH-2026-00009',
    guest: { name: 'Andy', phone: '', email: '' },
    checkIn: '2026-08-26',
    checkOut: '2026-09-02',
    nights: 7,
    guests: 4,
    roomType: { name: 'Dormitory', occupancyType: 'shared', capacity: 15, price: 0 },
    total: 616000,
    deposit: 61600,
    paid: 0,
    balanceDue: 616000,
    // Deliberately contradicts the amounts — see the suite's note below.
    status: { name: 'Paid', slug: 'paid' },
    disposition: { name: 'Pending Allotment', slug: 'pending-allotment' },
    notes: '',
    source: '',
    createdAt: '',
    ...over,
  };
}

function totalCell(over: Partial<HostBooking> = {}) {
  const col = HOST_BOOKINGS_TABLE_COLS.find((c) => c.key === 'total');
  if (!col) throw new Error('total column missing');
  return col.cell(booking(over)) as {
    kind: string;
    primary: string;
    secondary?: string;
    secondaryBadge?: { text: string; class: string };
  };
}

/**
 * The payment pill, which is derived rather than read.
 *
 * The record carries a payment `status`, and these fixtures keep it set to "Paid" on rows
 * where nothing has been paid — that is not an invented edge case, it is what the live
 * endpoint returns. The pill has to come off the amounts instead, so that it can never
 * contradict the figure sitting beside it in the same cell.
 */
describe('host-bookings-table-cols — payment pill', () => {
  it('says Paid once nothing is outstanding', () => {
    expect(totalCell({ paid: 616000, balanceDue: 0 }).secondaryBadge).toEqual({
      text: 'Paid',
      class: 'bg-ok/10 text-ok',
    });
  });

  it('says Partial when some of it has been paid', () => {
    expect(totalCell({ paid: 100000, balanceDue: 516000 }).secondaryBadge).toEqual({
      text: 'Partial',
      class: 'bg-warn/10 text-warn',
    });
  });

  it('says Unpaid when none of it has', () => {
    expect(totalCell({ paid: 0, balanceDue: 616000 }).secondaryBadge).toEqual({
      text: 'Unpaid',
      class: 'bg-ink-100 text-ink-600',
    });
  });

  // The whole reason the pill is derived: `status.name` would print the opposite of the truth.
  it('ignores a `status` that disagrees with the amounts', () => {
    const cell = totalCell({ status: { name: 'Paid', slug: 'paid' }, paid: 0, balanceDue: 616000 });

    expect(cell.secondaryBadge?.text).toBe('Unpaid');
  });

  it('treats a fully settled zero-balance row as paid', () => {
    expect(totalCell({ total: 0, paid: 0, balanceDue: 0 }).secondaryBadge?.text).toBe('Paid');
  });
});

/**
 * The second line: the pill, then the figure it qualifies.
 *
 * The figure is conditional and the pill is not. Every row shows where its payment stands;
 * only the rows with something left to pay show how much, because "PKR 0 due" on a settled
 * booking is a number that exists solely to say there is no number.
 */
describe('host-bookings-table-cols — outstanding line', () => {
  it('shows the full amount on a row where nothing has been paid', () => {
    const cell = totalCell({ paid: 0, balanceDue: 616000 });

    expect(cell.primary).toBe('PKR 616,000');
    expect(cell.secondary).toBe('PKR 616,000 due');
    expect(cell.secondaryBadge?.text).toBe('Unpaid');
  });

  it('shows the remainder on a part-paid row', () => {
    const cell = totalCell({ paid: 100000, balanceDue: 516000 });

    expect(cell.primary).toBe('PKR 616,000');
    expect(cell.secondary).toBe('PKR 516,000 due');
  });

  // The pill still renders — the second line is not conditional on the figure.
  it('drops the figure but keeps the pill once nothing is owed', () => {
    const cell = totalCell({ paid: 616000, balanceDue: 0 });

    expect(cell.secondary).toBeUndefined();
    expect(cell.secondaryBadge?.text).toBe('Paid');
  });

  it('rounds to whole rupees rather than printing decimals', () => {
    const cell = totalCell({ total: 615999.6, paid: 1, balanceDue: 515999.4 });

    expect(cell.primary).toBe('PKR 616,000');
    expect(cell.secondary).toBe('PKR 515,999 due');
  });
});

