import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Card } from '@hostelhive/ui';
import type { BillingInvoice } from '@hostelhive/data-access';
import { ApiDate } from '@util/api-date';
import { invoiceKindKey } from '@app/shared/billing/billing-labels';
import { BillingMoneyPipe } from '@app/shared/billing/billing-money.pipe';

/**
 * What a HostelHive invoice is for: its plan, purpose and period, each line and the total, all
 * as the API returned them.
 *
 * It carries no invoice number, status or deadline; the page around it shows those once.
 *
 * `<hh-invoice-summary [invoice]="invoice" />`
 */
@Component({
  selector: 'hh-invoice-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Card, TranslocoPipe, ApiDate, BillingMoneyPipe],
  host: { class: 'block' },
  template: `
    <hh-card variant="bordered">
      <h2 class="font-display text-lg font-bold text-ink-900">
        {{ 'hostPayment.summaryTitle' | transloco }}
      </h2>
      @if (hasPeriod()) {
        <p class="mt-1 text-sm text-ink-600" data-field="purpose">
          {{
            purposeKey()
              | transloco
                : {
                    start: (invoice().period_start | apiDate: 'd MMM yyyy'),
                    end: (invoice().period_end | apiDate: 'd MMM yyyy'),
                  }
          }}
        </p>
      }
      <dl class="mt-4 flex flex-col gap-2 text-sm">
        @if (invoice().plan; as plan) {
          <div class="flex items-start justify-between gap-4" data-field="plan">
            <dt class="text-ink-500">{{ 'hostPayment.plan' | transloco }}</dt>
            <dd class="text-end font-medium text-ink-900">{{ plan.name }}</dd>
          </div>
        }
        @for (line of invoice().lines; track $index) {
          <div class="flex items-start justify-between gap-4" data-field="line">
            <dt class="min-w-0 text-ink-600">{{ line.description }}</dt>
            <dd class="shrink-0 text-ink-900">
              <bdi>{{ line.amount | billingMoney: invoice().currency }}</bdi>
            </dd>
          </div>
        }
        <div
          class="mt-2 flex items-start justify-between gap-4 border-t border-ink-100 pt-3"
          data-field="total"
        >
          <dt class="font-semibold text-ink-900">
            {{ 'hostPayment.total' | transloco }}
          </dt>
          <dd class="shrink-0 text-base font-bold text-ink-900">
            <bdi>{{ invoice().total | billingMoney: invoice().currency }}</bdi>
          </dd>
        </div>
      </dl>
    </hh-card>
  `,
})
export class InvoiceSummary {
  readonly invoice = input.required<BillingInvoice>();

  // An unknown kind still has a period worth showing, without a label this app cannot name.
  protected readonly purposeKey = computed(
    () => invoiceKindKey(this.invoice().kind) ?? 'hostBilling.forPeriod',
  );

  protected readonly hasPeriod = computed(
    () => !!this.invoice().period_start && !!this.invoice().period_end,
  );
}
