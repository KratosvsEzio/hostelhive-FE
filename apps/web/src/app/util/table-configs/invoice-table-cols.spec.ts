import { ColumnDef } from '@hostelhive/ui';
import { bookingInvoice, invoice } from '@app/testing/host-builders';
import { invoiceTableCols, tenantRentCols, tenantUtilityCols } from './invoice-table-cols';

const HID = 'h1';

function col(key: string): ColumnDef {
  return invoiceTableCols(HID).find((c) => c.key === key)!;
}

function cellOf(key: string, row: unknown): Record<string, unknown> {
  return col(key).cell!(row as never) as unknown as Record<string, unknown>;
}

describe('invoiceTableCols kind badge', () => {
  it('keeps the rental badge sky', () => {
    expect(cellOf('kind', invoice({ kind: 'rental' }))).toMatchObject({
      kind: 'badge',
      text: 'Rental',
      class: 'bg-tint-sky text-ink-600',
    });
  });

  it('keeps the utility badge cream', () => {
    expect(cellOf('kind', invoice({ kind: 'utility' }))).toMatchObject({
      kind: 'badge',
      text: 'Utility',
      class: 'bg-tint-cream text-brand-500',
    });
  });

  it('gives a booking bill its own purple badge', () => {
    expect(cellOf('kind', bookingInvoice())).toMatchObject({
      kind: 'badge',
      text: 'Booking',
      class: 'bg-tint-purple text-backpacker',
    });
  });
});

describe('invoiceTableCols billed to', () => {
  it('labels the column "Billed to"', () => {
    expect(col('tenant').label).toBe('Billed to');
  });

  it('links a booking bill to its booking as "Guest · REF"', () => {
    expect(cellOf('tenant', bookingInvoice())).toMatchObject({
      kind: 'link',
      value: 'Ali Raza · BK-0001',
      href: '/host/h1/bookings/bk-1',
    });
  });

  it('shows the guest name alone when the booking has no ref', () => {
    const row = bookingInvoice({
      booking: { id: 'bk-1', ref: '', guestName: 'Ali Raza', phone: '' },
    });

    expect(cellOf('tenant', row)).toMatchObject({
      kind: 'link',
      value: 'Ali Raza',
      href: '/host/h1/bookings/bk-1',
    });
  });

  it('falls back to a plain text cell when the booking has no id', () => {
    const row = bookingInvoice({
      booking: { id: '', ref: 'BK-0001', guestName: 'Ali Raza', phone: '' },
    });
    const cell = cellOf('tenant', row);

    expect(cell['kind']).toBe('text');
    expect(cell['value']).toBe('Ali Raza · BK-0001');
    expect(cell['href']).toBeUndefined();
  });

  it('falls back to a plain text cell when the bill carries no booking block', () => {
    const cell = cellOf('tenant', bookingInvoice({ booking: undefined }));

    expect(cell['kind']).toBe('text');
    expect(cell['value']).toBe('Ali Raza');
  });

  it('still links a renter bill to the tenant profile', () => {
    expect(cellOf('tenant', invoice({ renterId: 't-1', tenantName: 'Saad Ali' }))).toMatchObject({
      kind: 'link',
      value: 'Saad Ali',
      href: '/host/h1/tenants/profile/t-1',
    });
  });
});

describe('invoiceTableCols room', () => {
  it('shows a dash, not a link, when the bill names no room', () => {
    const cell = cellOf('room', bookingInvoice({ roomId: '' }));

    expect(cell['kind']).toBe('text');
    expect(cell['value']).toBe('—');
    expect(cell['href']).toBeUndefined();
  });

  it('links to the room when there is one', () => {
    expect(cellOf('room', invoice({ roomId: 'r-101', roomNumber: '101' }))).toMatchObject({
      kind: 'link',
      value: 'Room 101',
      href: '/host/h1/rooms/r-101',
    });
  });
});

describe('invoiceTableCols status', () => {
  it('marks an over-due booking bill with the over-due label and danger tone', () => {
    expect(cellOf('status', bookingInvoice({ status: 'over-due' }))).toMatchObject({
      kind: 'pill',
      text: 'Overdue',
      tone: 'danger',
    });
  });
});

describe('tenant-profile column sets', () => {
  it('keeps the rent table keys and labels', () => {
    expect(tenantRentCols().map((c) => [c.key, c.label])).toEqual([
      ['id', 'Invoice'],
      ['kind', 'Type'],
      ['amount', 'Amount'],
      ['issued', 'Issued'],
      ['due', 'Due'],
      ['status', 'Status'],
    ]);
  });

  it('keeps the utility table keys and labels', () => {
    expect(tenantUtilityCols().map((c) => [c.key, c.label])).toEqual([
      ['id', 'Invoice'],
      ['amount', 'Amount'],
      ['issued', 'Issued'],
      ['due', 'Due'],
      ['status', 'Status'],
    ]);
  });

  it('renders a rental row exactly as before', () => {
    const row = invoice({ id: 'rb-2', kind: 'rental', amount: 15000, status: 'due' });
    const out = Object.fromEntries(
      tenantRentCols().map((c) => [c.key, c.cell!(row as never)]),
    );

    expect(out['id']).toMatchObject({ kind: 'text', value: 'rb-2' });
    expect(out['kind']).toMatchObject({ kind: 'badge', text: 'Rental' });
    expect(out['amount']).toMatchObject({ kind: 'currency', amount: 15000 });
    expect(out['issued']).toMatchObject({ kind: 'text', value: 'October 1st, 2026' });
    expect(out['due']).toMatchObject({ kind: 'text', value: 'October 10th, 2026' });
    expect(out['status']).toMatchObject({ kind: 'pill', text: 'Due', tone: 'warn' });
  });

  it('renders a utility row exactly as before', () => {
    const row = invoice({ id: 'rb-3', kind: 'utility', amount: 900, status: 'paid' });
    const out = Object.fromEntries(
      tenantUtilityCols().map((c) => [c.key, c.cell!(row as never)]),
    );

    expect(out['id']).toMatchObject({ kind: 'text', value: 'rb-3' });
    expect(out['amount']).toMatchObject({ kind: 'currency', amount: 900 });
    expect(out['status']).toMatchObject({ kind: 'pill', text: 'Paid', tone: 'ok' });
  });
});
