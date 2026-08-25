import { format, isValid, parse } from 'date-fns';
import { CellDef, ColumnDef } from '@hostelhive/ui';
import { Invoice, InvoiceStatus } from '@hostelhive/data-access';

const STATUS_TONE: Record<InvoiceStatus, 'ok' | 'warn' | 'danger'> = {
  paid: 'ok',
  due: 'warn',
  'over-due': 'danger',
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: 'Paid',
  due: 'Due',
  'over-due': 'Overdue',
};

export function invoiceStatusTone(status: InvoiceStatus): 'ok' | 'warn' | 'danger' {
  return STATUS_TONE[status];
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  return STATUS_LABEL[status];
}

export function formatInvoiceDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = parse(dateStr, 'yyyy-MM-dd', new Date());
  return isValid(d) ? format(d, 'MMMM do, yyyy') : '—';
}

export function buildInvoiceId(inv: { id: string; issued: string }): string {
  if (!inv.issued) return `Invo-${inv.id}`;
  const d = parse(inv.issued, 'yyyy-MM-dd', new Date());
  return `Invo-${format(d, 'MMyy')}-${inv.id}`;
}

// Single config object — property name is the column key, no repetition.
function invoiceTableConfig(hostelId: string): Record<string, Omit<ColumnDef, 'key'>> {
  return {
  room: {
    label: 'Room',
    cell: (r) => {
      const inv = r as Invoice;
      return ({ kind: 'link', value: `Room ${inv.roomNumber}`, href: `/host/${hostelId}/rooms/${inv.roomId}`, class: 'font-medium text-ink-900 hover:text-brand-600' }) satisfies CellDef;
    },
  },
  tenant: {
    label: 'Tenant',
    cell: (r) => {
      const inv = r as Invoice;
      return ({ kind: 'link', value: inv.tenantName, href: `/host/${hostelId}/tenants/profile/${inv.renterId}`, class: 'text-ink-600 hover:text-brand-600' }) satisfies CellDef;
    },
  },
  kind: {
    label: 'Type',
    cell: (r) => {
      const inv = r as Invoice;
      // Colour only — the table owns the badge's shape. This used to carry its own padding
      // and radius, which is why these read as badges while the bookings table's did not.
      return inv.kind === 'rental'
        ? ({ kind: 'badge', text: 'Rental', class: 'bg-tint-sky text-ink-600' }) satisfies CellDef
        : ({ kind: 'badge', text: 'Utility', class: 'bg-tint-cream text-brand-700' }) satisfies CellDef;
    },
  },
  amount: {
    label: 'Amount',
    cell: (r) =>
      ({ kind: 'currency', amount: (r as Invoice).amount, class: 'font-medium text-ink-900' }) satisfies CellDef,
  },
  status: {
    label: 'Status',
    cell: (r) => {
      const inv = r as Invoice;
      return ({ kind: 'pill', text: invoiceStatusLabel(inv.status), tone: invoiceStatusTone(inv.status) }) satisfies CellDef;
    },
  },
  issued: {
    label: 'Issued',
    cell: (r) =>
      ({ kind: 'text', value: formatInvoiceDate((r as Invoice).issued), class: 'whitespace-nowrap text-ink-500' }) satisfies CellDef,
  },
  due: {
    label: 'Due',
    cell: (r) =>
      ({ kind: 'text', value: formatInvoiceDate((r as Invoice).due), class: 'whitespace-nowrap text-ink-500' }) satisfies CellDef,
  },
  paidAt: {
    label: 'Paid at',
    cell: (r) => {
      const inv = r as Invoice;
      return ({ kind: 'text', value: inv.paidAt ? formatInvoiceDate(inv.paidAt) : '—', class: 'whitespace-nowrap text-ink-500' }) satisfies CellDef;
    },
  },
  };
}

export function invoiceTableCols(hostelId: string): ColumnDef[] {
  return Object.entries(invoiceTableConfig(hostelId)).map(([key, def]) => ({ key, ...def }));
}

const idCol: ColumnDef = {
  key: 'id',
  label: 'Invoice',
  cell: (r) => ({ kind: 'text', value: (r as Invoice).id, class: 'font-medium text-ink-900' }) satisfies CellDef,
};

export function tenantRentCols(): ColumnDef[] {
  const cfg = invoiceTableConfig('');
  return [idCol, { key: 'kind', ...cfg['kind'] }, { key: 'amount', ...cfg['amount'] }, { key: 'issued', ...cfg['issued'] }, { key: 'due', ...cfg['due'] }, { key: 'status', ...cfg['status'] }];
}

export function tenantUtilityCols(): ColumnDef[] {
  const cfg = invoiceTableConfig('');
  return [idCol, { key: 'amount', ...cfg['amount'] }, { key: 'issued', ...cfg['issued'] }, { key: 'due', ...cfg['due'] }, { key: 'status', ...cfg['status'] }];
}
