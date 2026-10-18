import { CellDef, ColumnDef } from '@hostelhive/ui';
import type { BillingInvoiceRow } from '@hostelhive/data-access';
import { invoiceStatusTone } from '@app/shared/billing/billing-labels';
import {
  adminHostelBillingPath,
  adminInvoiceKindKey,
  adminInvoiceStatusKey,
  isolate,
} from '@features/admin/billing/shared/admin-billing-labels';
import type { AdminBillingCellFormat } from './admin-billing-payments-cols';

const DASH: CellDef = { kind: 'text', value: '—', class: 'text-ink-400' };

function hostelCell(
  row: BillingInvoiceRow,
  f: AdminBillingCellFormat,
): CellDef {
  const id = row.hostel?.id ?? row.hostel_id;
  if (!id) return DASH;
  return {
    kind: 'link',
    value: row.hostel?.name || f.label('adminBilling.common.viewHostelBilling'),
    href: adminHostelBillingPath(id),
  };
}

function periodCell(
  row: BillingInvoiceRow,
  f: AdminBillingCellFormat,
): CellDef {
  if (!row.period_start || !row.period_end) return DASH;
  return {
    kind: 'text',
    value: `${f.date(row.period_start)} – ${f.date(row.period_end)}`,
    class: 'text-ink-600',
  };
}

function pdfCell(row: BillingInvoiceRow, f: AdminBillingCellFormat): CellDef {
  if (row.invoice_pdf_url) {
    return {
      kind: 'link',
      value: f.label('adminBilling.columns.pdf'),
      href: row.invoice_pdf_url,
      external: true,
    };
  }
  if (row.status?.slug === 'paid') {
    return {
      kind: 'text',
      value: f.label('adminBilling.common.preparing'),
      class: 'text-ink-500',
    };
  }
  return DASH;
}

/**
 * The admin invoices table. Every amount is shown in its own row's currency and nothing is
 * added up; an unknown kind reads as a dash and an unknown status as the server's name.
 */
export function adminBillingInvoicesCols(
  f: AdminBillingCellFormat,
): ColumnDef[] {
  const cell =
    (render: (row: BillingInvoiceRow) => CellDef) =>
    (r: unknown): CellDef =>
      render(r as BillingInvoiceRow);

  return [
    {
      key: 'number',
      label: f.label('adminBilling.columns.invoice'),
      cell: cell((row) => ({
        kind: 'text',
        value: isolate(row.number),
        class: 'font-medium text-ink-900',
      })),
    },
    {
      key: 'hostel',
      label: f.label('adminBilling.columns.hostel'),
      cell: cell((row) => hostelCell(row, f)),
    },
    {
      key: 'plan',
      label: f.label('adminBilling.columns.plan'),
      cell: cell((row) =>
        row.plan?.name
          ? { kind: 'text', value: row.plan.name, class: 'text-ink-600' }
          : DASH,
      ),
    },
    {
      key: 'type',
      label: f.label('adminBilling.columns.type'),
      cell: cell((row) => {
        const key = adminInvoiceKindKey(row.kind);
        return key
          ? { kind: 'text', value: f.label(key), class: 'text-ink-600' }
          : DASH;
      }),
    },
    {
      key: 'period',
      label: f.label('adminBilling.columns.period'),
      cell: cell((row) => periodCell(row, f)),
    },
    {
      key: 'total',
      label: f.label('adminBilling.columns.total'),
      align: 'right',
      cell: cell((row) => {
        const amount = f.money(row.total, row.currency);
        return amount
          ? {
              kind: 'text',
              value: amount,
              class: 'font-medium tabular-nums text-ink-900',
            }
          : DASH;
      }),
    },
    {
      key: 'status',
      label: f.label('adminBilling.columns.status'),
      cell: cell((row) => {
        const key = adminInvoiceStatusKey(row.status?.slug);
        return {
          kind: 'pill',
          text: key ? f.label(key) : (row.status?.name ?? '—'),
          tone: invoiceStatusTone(row.status?.slug),
        };
      }),
    },
    {
      key: 'issued',
      label: f.label('adminBilling.columns.issued'),
      cell: cell((row) => ({
        kind: 'text',
        value: f.date(row.created_at) || '—',
        class: 'text-ink-500',
      })),
    },
    {
      key: 'paid',
      label: f.label('adminBilling.columns.paid'),
      cell: cell((row) =>
        row.paid_at
          ? { kind: 'text', value: f.date(row.paid_at), class: 'text-ink-500' }
          : DASH,
      ),
    },
    {
      key: 'pdf',
      label: f.label('adminBilling.columns.pdf'),
      cell: cell((row) => pdfCell(row, f)),
    },
  ];
}
