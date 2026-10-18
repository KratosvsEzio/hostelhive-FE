import { CellDef, ColumnDef } from '@hostelhive/ui';
import type { AdminPaymentRow } from '@hostelhive/data-access';
import { billingPaymentStatusTone } from '@app/shared/billing/billing-labels';
import {
  adminHostelBillingPath,
  adminPaymentMethodKey,
  adminPaymentNeedsRefund,
  adminPaymentStatusKey,
} from '@features/admin/billing/shared/admin-billing-labels';

/**
 * What an admin billing cell needs from its page, each answer ready to show: a translated
 * label, a formatted amount and a formatted date-time. The page supplies them because the
 * translations and the formatters live in its injection context, not here.
 */
export interface AdminBillingCellFormat {
  label: (key: string) => string;
  /** `billingMoney`, wrapped in directional isolates so it reads as one unit in RTL. */
  money: (amount: string, currency: string) => string;
  dateTime: (value: string | null) => string;
  /** A date with no time of day, or an empty string for a missing value. */
  date: (value: string | null | undefined) => string;
}

/** The sort keys the payments list sends as `sort[<key>]`; each is also its column key. */
export type AdminPaymentSortField =
  | 'created_at'
  | 'succeeded_at'
  | 'amount_minor';

const DASH = '—';
const MUTED = 'text-ink-300';

function row(r: unknown): AdminPaymentRow {
  return r as AdminPaymentRow;
}

/** The hostel name, linking to its billing page; a dash when the row carries no hostel. */
export function adminPaymentHostelCell(p: AdminPaymentRow): CellDef {
  const id = p.hostel?.id ?? p.hostel_id;
  const name = p.hostel?.name;
  if (!id || !name) return { kind: 'text', value: DASH, class: MUTED };
  return {
    kind: 'link',
    value: name,
    href: adminHostelBillingPath(id),
    class: 'font-medium',
  };
}

export function adminPaymentInvoiceCell(p: AdminPaymentRow): CellDef {
  return {
    kind: 'composite',
    primary: p.invoice?.number ?? DASH,
    secondary: p.invoice?.plan?.name,
  };
}

export function adminPaymentMethodCell(
  p: AdminPaymentRow,
  f: AdminBillingCellFormat,
): CellDef {
  return {
    kind: 'text',
    value: f.label(adminPaymentMethodKey(p.payment_method)),
    class: 'text-ink-600',
  };
}

export function adminPaymentReferenceCell(p: AdminPaymentRow): CellDef {
  return p.reference
    ? { kind: 'text', value: p.reference, class: 'font-mono text-xs text-ink-600' }
    : { kind: 'text', value: DASH, class: MUTED };
}

export function adminPaymentAmountCell(
  p: AdminPaymentRow,
  f: AdminBillingCellFormat,
): CellDef {
  return {
    kind: 'text',
    value: f.money(p.amount, p.currency) || DASH,
    class: 'font-medium text-ink-900',
  };
}

export function adminPaymentDateCell(
  value: string | null,
  f: AdminBillingCellFormat,
): CellDef {
  return value
    ? { kind: 'text', value: f.dateTime(value), class: 'text-ink-600' }
    : { kind: 'text', value: DASH, class: MUTED };
}

/** Our status label, or the server's name; a payment Safepay charged but never applied adds a refund badge. */
function statusCell(p: AdminPaymentRow, f: AdminBillingCellFormat): CellDef {
  const key = adminPaymentStatusKey(p.status?.slug);
  const text = key ? f.label(key) : (p.status?.name ?? DASH);
  if (!adminPaymentNeedsRefund(p)) {
    return { kind: 'pill', text, tone: billingPaymentStatusTone(p.status?.slug) };
  }
  return {
    kind: 'composite',
    primary: text,
    secondaryBadge: {
      text: f.label('adminBilling.refund.badge'),
      class: 'bg-danger/10 text-danger',
    },
  };
}

/**
 * Every payment across hostels. Amount is only sortable while one currency is filtered,
 * because ordering PKR and USD amounts together means nothing.
 */
export function adminBillingPaymentsCols(
  f: AdminBillingCellFormat,
  options: { amountSortable: boolean },
): ColumnDef[] {
  return [
    {
      key: 'hostel',
      label: f.label('adminBilling.columns.hostel'),
      cell: (r) => adminPaymentHostelCell(row(r)),
    },
    {
      key: 'invoice',
      label: f.label('adminBilling.columns.invoice'),
      cell: (r) => adminPaymentInvoiceCell(row(r)),
    },
    {
      key: 'method',
      label: f.label('adminBilling.columns.method'),
      cell: (r) => adminPaymentMethodCell(row(r), f),
    },
    {
      key: 'reference',
      label: f.label('adminBilling.columns.reference'),
      cell: (r) => adminPaymentReferenceCell(row(r)),
    },
    {
      key: 'tracker',
      label: f.label('adminBilling.columns.tracker'),
      cell: (r) => {
        const tracker = row(r).gateway_reference;
        return tracker
          ? { kind: 'text', value: tracker, class: 'font-mono text-xs text-ink-600' }
          : { kind: 'text', value: DASH, class: MUTED };
      },
    },
    {
      key: 'amount_minor',
      label: f.label('adminBilling.columns.amount'),
      align: 'right',
      sortable: options.amountSortable,
      cell: (r) => adminPaymentAmountCell(row(r), f),
    },
    {
      key: 'status',
      label: f.label('adminBilling.columns.status'),
      cell: (r) => statusCell(row(r), f),
    },
    {
      key: 'verified_by',
      label: f.label('adminBilling.fields.verifiedBy'),
      cell: (r) => {
        const name = row(r).verified_by?.name;
        return name
          ? { kind: 'text', value: name, class: 'text-ink-600' }
          : { kind: 'text', value: DASH, class: MUTED };
      },
    },
    {
      key: 'created_at',
      label: f.label('adminBilling.columns.created'),
      sortable: true,
      cell: (r) => adminPaymentDateCell(row(r).created_at, f),
    },
    {
      key: 'succeeded_at',
      label: f.label('adminBilling.columns.succeeded'),
      sortable: true,
      cell: (r) => adminPaymentDateCell(row(r).succeeded_at, f),
    },
  ];
}
