import { format } from 'date-fns';
import { CellDef, ColumnDef } from '@hostelhive/ui';
import { ExpenseListItem } from '@services';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso || '—' : format(d, 'd MMM yyyy');
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso || '—' : format(d, 'd MMM yyyy, h:mm a');
}

/** "staff_salaries" → "Staff salaries" — fallback when a slug isn't in the options map. */
function titleCase(slug: string): string {
  return slug ? slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, ' ') : '';
}

/**
 * Data-table columns for the host expenses list.
 * `typeLabels` maps an expense-type slug → its display name (from GET /expenses/new);
 * pass the loaded map so the Type column shows friendly names.
 */
export function expensesTableCols(typeLabels: Record<string, string>): ColumnDef[] {
  const label = (slug: string) => typeLabels[slug] || titleCase(slug);
  return [
    {
      key: 'type',
      label: 'Type',
      cell: (r) => ({
        kind: 'text',
        value: label((r as ExpenseListItem).expenseType),
        class: 'font-medium text-ink-800',
      } satisfies CellDef),
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'left',
      sortable: true,
      cell: (r) => ({ kind: 'currency', amount: (r as ExpenseListItem).amount } satisfies CellDef),
    },
    {
      key: 'receipt',
      label: 'Receipt',
      cell: (r) =>
        (r as ExpenseListItem).receiptUrl
          ? ({ kind: 'icon-text', icon: 'ti-paperclip', text: 'Attached' } satisfies CellDef)
          : ({ kind: 'text', value: '—', class: 'text-ink-400' } satisfies CellDef),
    },
    {
      key: 'date',
      label: 'Date',
      sortable: true,
      cell: (r) => ({ kind: 'text', value: fmtDate((r as ExpenseListItem).date), class: 'text-ink-600' } satisfies CellDef),
    },
    {
      key: 'createdAt',
      label: 'Created at',
      sortable: true,
      cell: (r) => ({ kind: 'text', value: fmtDateTime((r as ExpenseListItem).createdAt), class: 'text-xs text-ink-500' } satisfies CellDef),
    },
  ];
}
