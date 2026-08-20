import { format } from 'date-fns';
import { CellDef, ColumnDef } from '@hostelhive/ui';
import { ExpenseListItem } from '@services';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso || '—' : format(d, 'EEE, d MMM yyyy');
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso || '—' : format(d, 'd MMM yyyy, h:mm a');
}

/**
 * Columns for the mess page's grocery table.
 *
 * No Type column — every row here is already an expense of type "groceries", so it would
 * repeat the same word down the page. No Items or Notes column either: the expenses *list*
 * endpoint returns neither `expense_items` nor `notes` (only the detail endpoint does), so
 * both could show nothing but dashes. The line-item breakdown lives on the detail page the
 * row opens. `Logged` sits last, next to the row actions: it is the tie-breaker for two
 * runs bought on the same day, not something you scan the table by.
 */
export const GROCERY_TABLE_COLS: ColumnDef[] = [
  {
    key: 'date',
    label: 'Date',
    cell: (r) => ({
      kind: 'text',
      value: fmtDate((r as ExpenseListItem).date),
      class: 'font-medium text-ink-800',
    } satisfies CellDef),
  },
  {
    key: 'receipt',
    label: 'Receipt',
    cell: (r) => ({
      kind: 'thumb',
      src: (r as ExpenseListItem).receiptUrl ?? undefined,
      alt: 'Open receipt',
    } satisfies CellDef),
  },
  {
    key: 'amount',
    label: 'Amount',
    cell: (r) => ({ kind: 'currency', amount: (r as ExpenseListItem).amount } satisfies CellDef),
  },
  {
    key: 'createdAt',
    label: 'Logged',
    cell: (r) => ({
      kind: 'text',
      value: fmtDateTime((r as ExpenseListItem).createdAt),
      class: 'text-xs text-ink-500',
    } satisfies CellDef),
  },
];
