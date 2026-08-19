import { format, parseISO } from 'date-fns';
import { CellDef, ColumnDef } from '@hostelhive/ui';
import { Staff } from '@hostelhive/data-access';

/**
 * Statuses are published at runtime by `GET /staffs/new`, so this maps the slugs we know
 * about and falls back to neutral. An unmapped status still renders — just without colour.
 */
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  active: 'ok',
  inactive: 'neutral',
  'on-leave': 'warn',
  terminated: 'danger',
  resigned: 'neutral',
};

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return '—'; }
}

const STAFF_TABLE_CONFIG: Record<string, Omit<ColumnDef, 'key'>> = {
  member: {
    label: 'Member',
    cell: (r) => {
      const s = r as Staff;
      return {
        kind: 'composite',
        primary: s.name,
        secondary: s.title || '—',
        // Marks the staff who also hold a hostel login, so they are distinguishable from a
        // plain employment record at a glance.
        badge: s.isManager ? { text: 'Manager' } : undefined,
      } satisfies CellDef;
    },
  },
  contact: {
    label: 'Contact',
    cell: (r) => ({ kind: 'text', value: (r as Staff).phone || '—', class: 'text-ink-600' } satisfies CellDef),
  },
  salary: {
    label: 'Salary',
    cell: (r) => ({ kind: 'currency', amount: (r as Staff).salary, zeroText: '—' } satisfies CellDef),
  },
  joined: {
    label: 'Joined',
    cell: (r) => ({ kind: 'text', value: fmtDate((r as Staff).joiningDate), class: 'text-ink-600' } satisfies CellDef),
  },
  status: {
    label: 'Status',
    cell: (r) => {
      const s = r as Staff;
      return { kind: 'pill', text: s.statusLabel || '—', tone: STATUS_TONE[s.status] ?? 'neutral' } satisfies CellDef;
    },
  },
};

export const STAFF_TABLE_COLS: ColumnDef[] = Object.entries(STAFF_TABLE_CONFIG).map(
  ([key, def]) => ({ key, ...def }),
);
