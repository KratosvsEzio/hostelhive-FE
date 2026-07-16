import { CellDef, ColumnDef } from '@hostelhive/ui';
import { QueueItem } from '@hostelhive/data-access';

function queueTone(hours: number): 'ok' | 'warn' | 'danger' {
  if (hours >= 48) return 'danger';
  if (hours >= 24) return 'warn';
  return 'ok';
}

function queueLabel(hours: number): string {
  if (hours >= 24) {
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${hours} hr${hours === 1 ? '' : 's'}`;
}

const QUEUE_TABLE_CONFIG: Record<string, Omit<ColumnDef, 'key'>> = {
  property: {
    label: 'Property',
    cell: (r) => {
      const q = r as QueueItem;
      return { kind: 'composite', primary: q.name, secondary: `${q.kindLabel} · ${q.photoCount} photos` } satisfies CellDef;
    },
  },
  city: {
    label: 'City',
    cell: (r) => ({ kind: 'text', value: (r as QueueItem).city, class: 'text-ink-600' } satisfies CellDef),
  },
  host: {
    label: 'Host',
    cell: (r) => ({ kind: 'text', value: (r as QueueItem).host, class: 'text-ink-600' } satisfies CellDef),
  },
  hoursInQueue: {
    label: 'Submitted',
    sortable: true,
    cell: (r) => {
      const q = r as QueueItem;
      return { kind: 'pill', text: queueLabel(q.hoursInQueue), tone: queueTone(q.hoursInQueue) } satisfies CellDef;
    },
  },
};

export const QUEUE_TABLE_COLS: ColumnDef[] = Object.entries(QUEUE_TABLE_CONFIG).map(([key, def]) => ({ key, ...def }));
