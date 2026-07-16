import { format, parseISO } from 'date-fns';
import { CellDef, ColumnDef } from '@hostelhive/ui';
import { Tenant } from '@hostelhive/data-access';

function ordinal(day: number | undefined): string {
  if (!day) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = day % 100;
  return day + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return '—'; }
}

const TENANTS_TABLE_CONFIG: Record<string, Omit<ColumnDef, 'key'>> = {
  tenant: {
    label: 'Tenant',
    cell: (r) => {
      const t = r as Tenant;
      return { kind: 'composite', primary: t.name, secondary: t.phone } satisfies CellDef;
    },
  },
  room: {
    label: 'Room',
    cell: (r) => ({ kind: 'text', value: (r as Tenant).roomNumber, class: 'text-ink-600' } satisfies CellDef),
  },
  joined: {
    label: 'Joined',
    cell: (r) => ({ kind: 'text', value: fmtDate((r as Tenant).joined), class: 'text-ink-600' } satisfies CellDef),
  },
  leaveDate: {
    label: 'Leave date',
    cell: (r) => {
      const t = r as Tenant;
      return { kind: 'text', value: t.leaveDate ? fmtDate(t.leaveDate) : '—', class: 'text-ink-600' } satisfies CellDef;
    },
  },
  rent: {
    label: 'Rent',
    cell: (r) => ({ kind: 'currency', amount: (r as Tenant).rent } satisfies CellDef),
  },
  billingDate: {
    label: 'Billing date',
    cell: (r) => ({ kind: 'text', value: ordinal((r as Tenant).billingDate), class: 'text-ink-600' } satisfies CellDef),
  },
  billingDueDate: {
    label: 'Billing due date',
    cell: (r) => ({ kind: 'text', value: ordinal((r as Tenant).billingDueDate), class: 'text-ink-600' } satisfies CellDef),
  },
  status: {
    label: 'Status',
    cell: (r) => {
      const t = r as Tenant;
      return t.status === 'active'
        ? { kind: 'pill', text: 'Active', tone: 'ok' } satisfies CellDef
        : { kind: 'pill', text: 'Checked-out', tone: 'neutral' } satisfies CellDef;
    },
  },
};

export const TENANTS_TABLE_COLS: ColumnDef[] = Object.entries(TENANTS_TABLE_CONFIG).map(([key, def]) => ({ key, ...def }));
