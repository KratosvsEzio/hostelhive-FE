import { CellDef, ColumnDef } from '@hostelhive/ui';
import { StaffMember, StaffRole } from '@hostelhive/data-access';

const ROLE_LABEL: Record<StaffRole, string> = {
  manager: 'Manager',
  warden: 'Warden',
};

const ROLE_ICON: Record<StaffRole, string> = {
  manager: 'ti-briefcase',
  warden: 'ti-home',
};

const TEAM_TABLE_CONFIG: Record<string, Omit<ColumnDef, 'key'>> = {
  member: {
    label: 'Member',
    cell: (r) => {
      const m = r as StaffMember;
      return { kind: 'text', value: m.name, class: m.status === 'inactive' ? 'font-medium text-ink-500' : 'font-medium text-ink-900' } satisfies CellDef;
    },
  },
  role: {
    label: 'Role',
    cell: (r) => {
      const m = r as StaffMember;
      return { kind: 'icon-text', icon: ROLE_ICON[m.role], text: ROLE_LABEL[m.role] } satisfies CellDef;
    },
  },
  contact: {
    label: 'Contact',
    cell: (r) => {
      const m = r as StaffMember;
      return { kind: 'composite', primary: m.email, secondary: m.phone } satisfies CellDef;
    },
  },
  status: {
    label: 'Status',
    cell: (r) => {
      const m = r as StaffMember;
      return m.status === 'active'
        ? { kind: 'pill', text: 'Active', tone: 'ok' } satisfies CellDef
        : { kind: 'pill', text: 'Inactive', tone: 'neutral' } satisfies CellDef;
    },
  },
};

export const TEAM_TABLE_COLS: ColumnDef[] = Object.entries(TEAM_TABLE_CONFIG).map(([key, def]) => ({ key, ...def }));
