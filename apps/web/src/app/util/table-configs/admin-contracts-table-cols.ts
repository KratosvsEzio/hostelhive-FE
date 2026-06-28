import { CellDef, ColumnDef } from '@hostelhive/ui';
import { Contract, ContractStatus, PaymentState } from '@hostelhive/data-access';

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  draft: 'warn',
  active: 'ok',
  expired: 'neutral',
  completed: 'neutral',
  refunded: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  expired: 'Expired',
  completed: 'Completed',
  refunded: 'Refunded',
};

const PAYMENT_TONE: Record<PaymentState, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  paid: 'ok',
  pending: 'warn',
  failed: 'danger',
  refunded: 'neutral',
};

const PAYMENT_LABEL: Record<PaymentState, string> = {
  paid: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
  refunded: 'Refunded',
};

const ADMIN_CONTRACTS_TABLE_CONFIG: Record<string, Omit<ColumnDef, 'key'>> = {
  id: {
    label: 'Contract',
    cell: (r) => ({ kind: 'text', value: (r as Contract).id, class: 'font-mono text-xs text-ink-600' } satisfies CellDef),
  },
  hostel: {
    label: 'Hostel',
    cell: (r) => {
      const c = r as Contract;
      return { kind: 'composite', primary: c.hostelName ?? '—', secondary: c.hostelId != null ? String(c.hostelId) : undefined } satisfies CellDef;
    },
  },
  plan: {
    label: 'Plan',
    cell: (r) => ({ kind: 'text', value: (r as Contract).plan, class: 'text-ink-700' } satisfies CellDef),
  },
  term: {
    label: 'Term',
    cell: (r) => {
      const c = r as Contract;
      return {
        kind: 'text',
        value: c.term ?? '— pending —',
        class: c.endsSoon ? 'font-medium text-danger' : c.term ? 'text-ink-500' : 'text-ink-400',
      } satisfies CellDef;
    },
  },
  status: {
    label: 'Status',
    cell: (r) => {
      const s = (r as Contract).status as string;
      return { kind: 'pill', text: STATUS_LABEL[s] ?? s, tone: STATUS_TONE[s] ?? 'neutral' } satisfies CellDef;
    },
  },
  payment: {
    label: 'Payment',
    cell: (r) => {
      const p = (r as Contract).payment;
      return { kind: 'pill', text: PAYMENT_LABEL[p], tone: PAYMENT_TONE[p] } satisfies CellDef;
    },
  },
  amount: {
    label: 'Amount',
    sortable: true,
    align: 'right',
    cell: (r) => ({ kind: 'currency', amount: (r as Contract).amount } satisfies CellDef),
  },
};

export const ADMIN_CONTRACTS_TABLE_COLS: ColumnDef[] = Object.entries(ADMIN_CONTRACTS_TABLE_CONFIG).map(([key, def]) => ({ key, ...def }));
