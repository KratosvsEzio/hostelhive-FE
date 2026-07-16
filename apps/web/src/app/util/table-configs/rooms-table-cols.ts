import { format, parseISO } from 'date-fns';
import { CellDef, ColumnDef } from '@hostelhive/ui';
import { HostRoom, RoomStatus } from '@hostelhive/data-access';

const STATUS_TONE: Record<RoomStatus, 'ok' | 'warn' | 'neutral'> = {
  available: 'ok',
  partial: 'warn',
  full: 'neutral',
};

const STATUS_LABEL: Record<RoomStatus, string> = {
  available: 'Available',
  partial: 'Partial',
  full: 'Full',
};

function roomStatus(r: HostRoom): RoomStatus {
  if (r.occupied <= 0) return 'available';
  return r.occupied >= r.capacity ? 'full' : 'partial';
}

function fmtDate(iso: string): string {
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return '—'; }
}

const ROOMS_TABLE_CONFIG: Record<string, Omit<ColumnDef, 'key'>> = {
  room: {
    label: 'Room',
    cell: (r) => ({ kind: 'text', value: (r as HostRoom).number, class: 'font-medium text-ink-900' } satisfies CellDef),
  },
  type: {
    label: 'Type',
    cell: (r) => ({ kind: 'text', value: (r as HostRoom).type, class: 'text-ink-600' } satisfies CellDef),
  },
  occupancy: {
    label: 'Occupancy',
    sortable: true,
    cell: (r) => {
      const room = r as HostRoom;
      return { kind: 'text', value: `${room.occupied} / ${room.capacity}`, class: 'text-ink-600' } satisfies CellDef;
    },
  },
  status: {
    label: 'Status',
    cell: (r) => {
      const s = roomStatus(r as HostRoom);
      return { kind: 'pill', text: STATUS_LABEL[s], tone: STATUS_TONE[s] } satisfies CellDef;
    },
  },
  rent: {
    label: 'Rent / bed',
    cell: (r) => ({ kind: 'currency', amount: (r as HostRoom).rentPerBed } satisfies CellDef),
  },
  createdAt: {
    label: 'Created at',
    sortable: true,
    cell: (r) => ({ kind: 'text', value: fmtDate((r as HostRoom).createdAt), class: 'text-ink-500 text-xs' } satisfies CellDef),
  },
};

export const ROOMS_TABLE_COLS: ColumnDef[] = Object.entries(ROOMS_TABLE_CONFIG).map(([key, def]) => ({ key, ...def }));
