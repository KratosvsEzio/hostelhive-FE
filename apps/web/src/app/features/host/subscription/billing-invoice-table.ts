import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { BillingInvoiceRow } from '@hostelhive/data-access';
import { StatusPill, type StatusTone } from '@hostelhive/ui';
import { LocaleLink } from '@core/i18n/locale-link';
import { LocaleStore } from '@core/i18n/locale-store';
import { localiseCommands } from '@core/i18n/locale-commands';
import { ApiDate } from '@util/api-date';
import {
  billingInvoiceKindLabelKey,
  billingInvoicePath,
  billingInvoiceStatusKey,
  invoiceStatusTone,
} from '@app/shared/billing/billing-labels';
import { BillingMoneyPipe } from '@app/shared/billing/billing-money.pipe';

/** The history filter and page a detail link carries, so its back link can return to them. */
export interface BillingHistoryQuery {
  status?: string;
  page?: number;
}

/** The router-state key under which a detail link hands its {@link BillingHistoryQuery} over. */
export const BILLING_HISTORY_STATE_KEY = 'billingHistoryQuery';

/** What a row's receipt cell shows: the PDF, a "Preparing…" link to the detail, or a dash. */
type ReceiptCell = 'pdf' | 'preparing' | 'none';

interface RowView {
  row: BillingInvoiceRow;
  link: string;
  kindKey: string | null;
  statusKey: string | null;
  tone: StatusTone;
  receipt: ReceiptCell;
  hasPeriod: boolean;
}

/**
 * One page of a hostel's billing history: a table from `sm` up, stacked cards below it.
 *
 * Both layouts render the same row views. A row opens its invoice when clicked anywhere but on
 * a link; every link to the detail carries the history query in router state for the back link.
 * Amounts stay the server's decimal strings and only pass through `billingMoney`.
 */
@Component({
  selector: 'hh-billing-invoice-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    LocaleLink,
    TranslocoPipe,
    StatusPill,
    ApiDate,
    BillingMoneyPipe,
  ],
  host: { class: 'block' },
  template: `
    <div
      class="hidden overflow-x-auto rounded-2xl border border-ink-100 bg-white sm:block"
    >
      <table class="w-full text-sm" data-testid="invoice-table">
        <caption class="sr-only">
          {{
            'hostBillingHistory.tableCaption' | transloco
          }}
        </caption>
        <thead class="bg-surface text-xs text-ink-500">
          <tr>
            <th scope="col" class="px-4 py-3 text-start font-medium">
              {{ 'hostBillingHistory.colInvoice' | transloco }}
            </th>
            <th scope="col" class="px-4 py-3 text-start font-medium">
              {{ 'hostBillingHistory.colDate' | transloco }}
            </th>
            <th scope="col" class="px-4 py-3 text-start font-medium">
              {{ 'hostBillingHistory.colType' | transloco }}
            </th>
            <th scope="col" class="px-4 py-3 text-start font-medium">
              {{ 'hostBillingHistory.colPeriod' | transloco }}
            </th>
            <th scope="col" class="px-4 py-3 text-end font-medium">
              {{ 'hostBillingHistory.colTotal' | transloco }}
            </th>
            <th scope="col" class="px-4 py-3 text-start font-medium">
              {{ 'hostBillingHistory.colStatus' | transloco }}
            </th>
            <th scope="col" class="px-4 py-3 text-start font-medium">
              {{ 'hostBillingHistory.colReceipt' | transloco }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-ink-100">
          @for (v of views(); track v.row.id) {
            <tr
              class="cursor-pointer transition hover:bg-surface"
              [attr.data-invoice]="v.row.id"
              (click)="openRow($event, v)"
            >
              <td
                class="px-4 py-3 font-medium text-ink-900"
                data-field="number"
              >
                <ng-container
                  [ngTemplateOutlet]="numberLink"
                  [ngTemplateOutletContext]="{ $implicit: v }"
                />
              </td>
              <td class="px-4 py-3 text-ink-600" data-field="date">
                {{ v.row.created_at | apiDate: 'd MMM yyyy' }}
              </td>
              <td class="px-4 py-3 text-ink-600" data-field="kind">
                {{ v.kindKey ? (v.kindKey | transloco) : '—' }}
              </td>
              <td class="px-4 py-3 text-ink-600" data-field="period">
                <ng-container
                  [ngTemplateOutlet]="period"
                  [ngTemplateOutletContext]="{ $implicit: v }"
                />
              </td>
              <td
                class="px-4 py-3 text-end font-medium text-ink-900 tabular-nums"
                data-field="total"
              >
                <bdi>{{ v.row.total | billingMoney: v.row.currency }}</bdi>
              </td>
              <td class="px-4 py-3" data-field="status">
                <ng-container
                  [ngTemplateOutlet]="status"
                  [ngTemplateOutletContext]="{ $implicit: v }"
                />
              </td>
              <td class="px-4 py-3" data-field="receipt">
                <ng-container
                  [ngTemplateOutlet]="receipt"
                  [ngTemplateOutletContext]="{ $implicit: v }"
                />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <ul class="flex flex-col gap-3 sm:hidden" data-testid="invoice-cards">
      @for (v of views(); track v.row.id) {
        <li
          class="cursor-pointer rounded-2xl border border-ink-100 bg-white p-4 transition hover:bg-surface"
          [attr.data-invoice]="v.row.id"
          (click)="openRow($event, v)"
        >
          <div class="flex items-start justify-between gap-3">
            <span class="font-medium text-ink-900" data-field="number">
              <ng-container
                [ngTemplateOutlet]="numberLink"
                [ngTemplateOutletContext]="{ $implicit: v }"
              />
            </span>
            <span
              class="font-medium text-ink-900 tabular-nums"
              data-field="total"
            >
              <bdi>{{ v.row.total | billingMoney: v.row.currency }}</bdi>
            </span>
          </div>
          <dl class="mt-2 flex flex-col gap-1 text-xs text-ink-600">
            <div class="flex gap-2">
              <dt class="text-ink-500">
                {{ 'hostBillingHistory.colDate' | transloco }}
              </dt>
              <dd data-field="date">
                {{ v.row.created_at | apiDate: 'd MMM yyyy' }}
              </dd>
            </div>
            <div class="flex gap-2">
              <dt class="text-ink-500">
                {{ 'hostBillingHistory.colType' | transloco }}
              </dt>
              <dd data-field="kind">
                {{ v.kindKey ? (v.kindKey | transloco) : '—' }}
              </dd>
            </div>
            <div class="flex gap-2">
              <dt class="text-ink-500">
                {{ 'hostBillingHistory.colPeriod' | transloco }}
              </dt>
              <dd data-field="period">
                <ng-container
                  [ngTemplateOutlet]="period"
                  [ngTemplateOutletContext]="{ $implicit: v }"
                />
              </dd>
            </div>
          </dl>
          <div class="mt-3 flex items-center justify-between gap-3">
            <span data-field="status">
              <ng-container
                [ngTemplateOutlet]="status"
                [ngTemplateOutletContext]="{ $implicit: v }"
              />
            </span>
            <span class="text-sm" data-field="receipt">
              <ng-container
                [ngTemplateOutlet]="receipt"
                [ngTemplateOutletContext]="{ $implicit: v }"
              />
            </span>
          </div>
        </li>
      }
    </ul>

    <ng-template #numberLink let-v>
      <a
        class="text-ink-900 hover:underline"
        [routerLink]="v.link"
        [state]="linkState()"
        data-testid="invoice-link"
        ><bdi>{{ v.row.number }}</bdi></a
      >
    </ng-template>

    <ng-template #period let-v>
      @if (v.hasPeriod) {
        <bdi>{{
          'hostBilling.forPeriod'
            | transloco
              : {
                  start: (v.row.period_start | apiDate: 'd MMM yyyy'),
                  end: (v.row.period_end | apiDate: 'd MMM yyyy'),
                }
        }}</bdi>
      } @else {
        —
      }
    </ng-template>

    <ng-template #status let-v>
      <hh-status-pill [tone]="v.tone" [attr.data-tone]="v.tone">{{
        v.statusKey ? (v.statusKey | transloco) : v.row.status?.name
      }}</hh-status-pill>
    </ng-template>

    <ng-template #receipt let-v>
      @switch (v.receipt) {
        @case ('pdf') {
          <a
            class="font-medium text-brand-600 hover:underline"
            [href]="v.row.invoice_pdf_url"
            target="_blank"
            rel="noopener noreferrer"
            [attr.aria-label]="
              'hostBillingHistory.pdfAria' | transloco: { number: v.row.number }
            "
            data-testid="pdf-link"
            >{{ 'hostBillingHistory.pdf' | transloco }}</a
          >
        }
        @case ('preparing') {
          <a
            class="text-ink-500 hover:underline"
            [routerLink]="v.link"
            [state]="linkState()"
            data-testid="pdf-preparing"
            >{{ 'hostBillingHistory.preparingShort' | transloco }}</a
          >
        }
        @default {
          <span class="text-ink-400" data-testid="pdf-none">—</span>
        }
      }
    </ng-template>
  `,
})
export class BillingInvoiceTable {
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleStore);

  readonly rows = input.required<BillingInvoiceRow[]>();
  readonly hostelId = input.required<string>();
  readonly historyQuery = input<BillingHistoryQuery>({});

  protected readonly linkState = computed(() => ({
    [BILLING_HISTORY_STATE_KEY]: this.historyQuery(),
  }));

  protected readonly views = computed<readonly RowView[]>(() => {
    const hostelId = this.hostelId();
    return this.rows().map((row) => ({
      row,
      link: billingInvoicePath(hostelId, row.id),
      kindKey: billingInvoiceKindLabelKey(row.kind),
      statusKey: billingInvoiceStatusKey(row.status?.slug),
      tone: invoiceStatusTone(row.status?.slug),
      receipt: receiptCell(row),
      hasPeriod: !!row.period_start && !!row.period_end,
    }));
  });

  /** A click anywhere on a row opens its invoice, unless it landed on one of the row's links. */
  protected openRow(event: MouseEvent, view: RowView): void {
    const target = event.target as Element | null;
    if (target?.closest('a')) return;
    const url = localiseCommands(view.link, this.locale.active()) as string;
    void this.router.navigateByUrl(url, { state: this.linkState() });
  }
}

function receiptCell(row: BillingInvoiceRow): ReceiptCell {
  if (row.invoice_pdf_url) return 'pdf';
  return row.status?.slug === 'paid' ? 'preparing' : 'none';
}
