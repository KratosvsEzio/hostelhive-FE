import { format, parseISO } from 'date-fns';
import { CellDef, ColumnDef } from '@hostelhive/ui';
import { AdminListing } from '@hostelhive/data-access';

const DISPOSITION_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  published: 'ok',
  'in-review': 'warn',
  'pending-review': 'warn',
  changes: 'warn',
  paused: 'neutral',
  rejected: 'danger',
  removed: 'danger',
  draft: 'neutral',
  active: 'ok',
};

const DISPOSITION_LABEL: Record<string, string> = {
  published: 'Published',
  'in-review': 'In review',
  'pending-review': 'In review',
  changes: 'Changes requested',
  paused: 'Paused',
  rejected: 'Rejected',
  removed: 'Removed',
  draft: 'Draft',
  active: 'Active',
};

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function typeLabel(l: AdminListing): string {
  return [cap(l.genderType), cap(l.propertyType)].filter(Boolean).join(' · ');
}

function locationLabel(l: AdminListing): string {
  return [l.city, l.area].filter(Boolean).join(' · ') || l.state || '—';
}

function statusMeta(l: AdminListing): { tone: 'ok' | 'warn' | 'danger' | 'neutral'; label: string } {
  const slug = l.dispositionSlug ?? l.statusSlug;
  return {
    tone: DISPOSITION_TONE[slug] ?? 'neutral',
    label: DISPOSITION_LABEL[slug] ?? (slug ? cap(slug) : '—'),
  };
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return '—'; }
}

const ADMIN_LISTINGS_TABLE_CONFIG: Record<string, Omit<ColumnDef, 'key'>> = {
  property: {
    label: 'Property',
    cell: (r) => {
      const l = r as AdminListing;
      return { kind: 'composite', primary: l.name, secondary: typeLabel(l) } satisfies CellDef;
    },
  },
  location: {
    label: 'Location',
    cell: (r) => ({ kind: 'text', value: locationLabel(r as AdminListing), class: 'text-ink-600' } satisfies CellDef),
  },
  host: {
    label: 'Host',
    cell: (r) => ({ kind: 'text', value: (r as AdminListing).host, class: 'text-ink-600' } satisfies CellDef),
  },
  status: {
    label: 'Status',
    cell: (r) => {
      const m = statusMeta(r as AdminListing);
      return { kind: 'pill', text: m.label, tone: m.tone } satisfies CellDef;
    },
  },
  created_at: {
    label: 'Created',
    sortable: true,
    cell: (r) => ({ kind: 'text', value: fmtDate((r as AdminListing).createdAt), class: 'text-ink-500' } satisfies CellDef),
  },
  starting_price: {
    label: 'From',
    sortable: true,
    cell: (r) => {
      const l = r as AdminListing;
      if (l.startingPrice == null) return { kind: 'text', value: '—', class: 'text-ink-400' } satisfies CellDef;
      return { kind: 'currency', amount: l.startingPrice } satisfies CellDef;
    },
  },
};

export const ADMIN_LISTINGS_TABLE_COLS: ColumnDef[] = Object.entries(ADMIN_LISTINGS_TABLE_CONFIG).map(([key, def]) => ({ key, ...def }));
