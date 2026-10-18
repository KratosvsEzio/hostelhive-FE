import { ColumnDef } from '@hostelhive/ui';
import type { AdminPaymentRow } from '@hostelhive/data-access';
import {
  type AdminBillingCellFormat,
  adminPaymentAmountCell,
  adminPaymentDateCell,
  adminPaymentHostelCell,
  adminPaymentInvoiceCell,
  adminPaymentMethodCell,
  adminPaymentReferenceCell,
} from './admin-billing-payments-cols';

function row(r: unknown): AdminPaymentRow {
  return r as AdminPaymentRow;
}

/**
 * Bank transfers waiting for a check, oldest first. Nothing is sortable: the queue is
 * first in, first out. The proof is not on the row, so reviewing it opens the payment.
 */
export function adminBillingVerificationCols(
  f: AdminBillingCellFormat,
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
      key: 'amount',
      label: f.label('adminBilling.columns.amount'),
      align: 'right',
      cell: (r) => adminPaymentAmountCell(row(r), f),
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
      key: 'submitted',
      label: f.label('adminBilling.columns.submitted'),
      cell: (r) => adminPaymentDateCell(row(r).created_at, f),
    },
    {
      key: 'review',
      label: '',
      cell: () => ({
        kind: 'text',
        value: f.label('adminBilling.verification.review'),
        class: 'font-medium text-brand-500',
      }),
    },
  ];
}
