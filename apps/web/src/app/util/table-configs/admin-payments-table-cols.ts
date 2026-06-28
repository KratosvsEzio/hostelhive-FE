import { format, parseISO } from 'date-fns';
import { CellDef, ColumnDef } from '@hostelhive/ui';
import { Payment } from '@hostelhive/data-access';

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  pending: 'warn',
  verified: 'ok',
  rejected: 'danger',
  paid: 'ok',
  failed: 'danger',
  refunded: 'neutral',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return '—'; }
}

const ADMIN_PAYMENTS_TABLE_CONFIG: Record<string, Omit<ColumnDef, 'key'>> = {
  id: {
    label: 'Payment',
    cell: (r) => ({ kind: 'text', value: (r as Payment).id, class: 'font-mono text-xs text-ink-600' } satisfies CellDef),
  },
  host: {
    label: 'Host',
    cell: (r) => ({ kind: 'text', value: (r as Payment).host } satisfies CellDef),
  },
  hostel: {
    label: 'Hostel',
    cell: (r) => {
      const p = r as Payment;
      return { kind: 'composite', primary: p.hostelName ?? '—', secondary: p.hostelId != null ? String(p.hostelId) : undefined } satisfies CellDef;
    },
  },
  plan: {
    label: 'Plan',
    cell: (r) => ({ kind: 'text', value: (r as Payment).plan ?? '—', class: 'text-ink-600' } satisfies CellDef),
  },
  method: {
    label: 'Method',
    cell: (r) => {
      const m = (r as Payment).method;
      return { kind: 'text', value: m ? m.charAt(0).toUpperCase() + m.slice(1) : '—', class: 'text-ink-600' } satisfies CellDef;
    },
  },
  transactionId: {
    label: 'Transaction ID',
    cell: (r) => {
      const p = r as Payment;
      return { kind: 'text', value: p.transactionId ?? '—', class: p.transactionId ? 'font-mono text-xs text-ink-500' : 'font-mono text-xs text-ink-300' } satisfies CellDef;
    },
  },
  status: {
    label: 'Status',
    cell: (r) => {
      const p = r as Payment;
      return { kind: 'pill', text: p.statusName, tone: STATUS_TONE[p.status as string] ?? 'neutral' } satisfies CellDef;
    },
  },
  created_at: {
    label: 'Created',
    sortable: true,
    cell: (r) => ({ kind: 'text', value: fmtDate((r as Payment).createdAt), class: 'text-ink-600' } satisfies CellDef),
  },
  paid_at: {
    label: 'Paid',
    sortable: true,
    cell: (r) => {
      const p = r as Payment;
      return { kind: 'text', value: fmtDate(p.paidAt), class: p.paidAt ? 'text-ink-600' : 'text-ink-300' } satisfies CellDef;
    },
  },
  amount: {
    label: 'Amount',
    sortable: true,
    align: 'right',
    cell: (r) => ({ kind: 'currency', amount: (r as Payment).amount } satisfies CellDef),
  },
};

export const ADMIN_PAYMENTS_TABLE_COLS: ColumnDef[] = Object.entries(ADMIN_PAYMENTS_TABLE_CONFIG).map(([key, def]) => ({ key, ...def }));
