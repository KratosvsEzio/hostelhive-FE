import { format, parseISO } from 'date-fns';
import { CellDef, ColumnDef } from '@hostelhive/ui';
import { Tenant, TenantStatus } from '@hostelhive/data-access';
import { ordinal } from '@util/ordinal';

/**
 * The status pill renders the tenant's status **as the API defines it** — no client
 * relabelling. Previously anything non-`active` collapsed to "Checked-out", so an
 * `inactive` tenant read as "Checked-out" even though the backend has no such status
 * (see B9). Unknown slugs fall through to the raw value / neutral tone.
 */
const STATUS_LABEL: Record<TenantStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  'on-notice': 'On notice',
  'checked-out': 'Checked-out',
};

const STATUS_TONE: Record<TenantStatus, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  active: 'ok',
  inactive: 'neutral',
  'on-notice': 'warn',
  'checked-out': 'neutral',
};

function fmtBillingDay(day: number | undefined): string {
  return day ? ordinal(day) : '—';
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
      // Email rather than phone as the secondary — phone moved to its own Contact
      // column, where it can sit above the emergency number it belongs with.
      return { kind: 'composite', primary: t.name, secondary: t.email || '—' } satisfies CellDef;
    },
  },
  contact: {
    label: 'Contact',
    cell: (r) => {
      const t = r as Tenant;
      // Emergency contact is optional at registration, so it is frequently absent —
      // an em dash keeps the row height stable rather than collapsing the second line.
      return {
        kind: 'composite',
        primary: t.phone || '—',
        secondary: t.emergencyContact || '—',
        // Both lines are phone numbers, so without a marker the second one reads as a
        // second personal number rather than the emergency contact.
        secondaryIcon: 'ti-alert-triangle',
        secondaryIconClass: 'text-warn',
        secondaryLabel: 'Emergency contact',
      } satisfies CellDef;
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
    cell: (r) => ({ kind: 'text', value: fmtBillingDay((r as Tenant).billingDate), class: 'text-ink-600' } satisfies CellDef),
  },
  billingDueDate: {
    label: 'Billing due date',
    cell: (r) => ({ kind: 'text', value: fmtBillingDay((r as Tenant).billingDueDate), class: 'text-ink-600' } satisfies CellDef),
  },
  status: {
    label: 'Status',
    cell: (r) => {
      const t = r as Tenant;
      return {
        kind: 'pill',
        text: STATUS_LABEL[t.status] ?? t.status,
        tone: STATUS_TONE[t.status] ?? 'neutral',
      } satisfies CellDef;
    },
  },
};

export const TENANTS_TABLE_COLS: ColumnDef[] = Object.entries(TENANTS_TABLE_CONFIG).map(([key, def]) => ({ key, ...def }));
