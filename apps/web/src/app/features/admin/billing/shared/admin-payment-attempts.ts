import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { BillingPayment } from '@hostelhive/data-access';
import { Card, StatusPill, type StatusTone } from '@hostelhive/ui';
import { AdminUtcDate } from './admin-utc-date';
import { ADMIN_BILLING_DATE_TIME } from './admin-billing-cell-format';
import { billingPaymentStatusTone } from '@app/shared/billing/billing-labels';
import { BillingMoneyPipe } from '@app/shared/billing/billing-money.pipe';
import {
  adminPaymentMethodKey,
  adminPaymentNeedsRefund,
  adminPaymentStatusKey,
} from './admin-billing-labels';

/** One attempt as an admin reads it, internal fields included. */
interface AdminAttemptView {
  id: string;
  methodKey: string;
  amount: string;
  currency: string;
  /** Our label for the status, or null to show `statusName` as returned. */
  statusKey: string | null;
  statusName: string;
  tone: StatusTone;
  reference: string | null;
  tracker: string | null;
  failureReason: string | null;
  needsRefund: boolean;
  createdAt: string;
  succeededAt: string | null;
}

function attemptView(payment: BillingPayment): AdminAttemptView {
  const slug = payment.status?.slug;
  return {
    id: payment.id,
    methodKey: adminPaymentMethodKey(payment.payment_method),
    amount: payment.amount,
    currency: payment.currency,
    statusKey: adminPaymentStatusKey(slug),
    statusName: payment.status?.name ?? '',
    tone: billingPaymentStatusTone(slug),
    reference: payment.reference || null,
    tracker: payment.gateway_reference || null,
    failureReason: payment.failure_reason || null,
    needsRefund: adminPaymentNeedsRefund(payment),
    createdAt: payment.created_at,
    succeededAt: payment.succeeded_at,
  };
}

/**
 * Every attempt to pay one invoice, newest first, as an admin needs it: method, amount in the
 * payment's own currency, status, reference, Safepay tracker, the failure reason exactly as the
 * server wrote it, and a refund callout when Safepay charged but the invoice was not paid.
 *
 * Renders nothing when there is no attempt to show, so a drawer can leave it in place.
 *
 * `<hh-admin-payment-attempts [payments]="invoice.payments" [excludeId]="payment.id" />`
 */
@Component({
  selector: 'hh-admin-payment-attempts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Card, StatusPill, TranslocoPipe, AdminUtcDate, BillingMoneyPipe],
  host: { class: 'block' },
  template: `
    @if (attempts().length) {
      <hh-card variant="bordered">
        <h2 class="font-display text-lg font-bold text-ink-900">
          {{ 'adminBilling.verification.attemptsTitle' | transloco }}
        </h2>
        <ul class="mt-3 flex flex-col divide-y divide-ink-100">
          @for (attempt of attempts(); track attempt.id) {
            <li class="flex flex-col gap-2 py-3" data-testid="attempt">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span
                  class="text-sm font-medium text-ink-900"
                  data-field="method"
                  >{{ attempt.methodKey | transloco }}</span
                >
                <span
                  class="text-sm font-semibold text-ink-900"
                  data-field="amount"
                  ><bdi>{{
                    attempt.amount | billingMoney: attempt.currency
                  }}</bdi></span
                >
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <hh-status-pill [tone]="attempt.tone" data-field="status">{{
                  attempt.statusKey
                    ? (attempt.statusKey | transloco)
                    : attempt.statusName
                }}</hh-status-pill>
                @if (attempt.needsRefund) {
                  <hh-status-pill tone="danger" data-field="refund-badge">{{
                    'adminBilling.refund.badge' | transloco
                  }}</hh-status-pill>
                }
              </div>
              <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                @if (attempt.reference) {
                  <dt class="text-ink-500">
                    {{ 'adminBilling.columns.reference' | transloco }}
                  </dt>
                  <dd class="break-all text-ink-800" data-field="reference">
                    {{ attempt.reference }}
                  </dd>
                }
                @if (attempt.tracker) {
                  <dt class="text-ink-500">
                    {{ 'adminBilling.columns.tracker' | transloco }}
                  </dt>
                  <dd class="break-all text-ink-800" data-field="tracker">
                    {{ attempt.tracker }}
                  </dd>
                }
                <dt class="text-ink-500">
                  {{ 'adminBilling.columns.created' | transloco }}
                </dt>
                <dd class="text-ink-800" data-field="created">
                  {{ attempt.createdAt | adminUtcDate: dateTime }}
                </dd>
                @if (attempt.succeededAt) {
                  <dt class="text-ink-500">
                    {{ 'adminBilling.columns.succeeded' | transloco }}
                  </dt>
                  <dd class="text-ink-800" data-field="succeeded">
                    {{ attempt.succeededAt | adminUtcDate: dateTime }}
                  </dd>
                }
                @if (attempt.failureReason) {
                  <dt class="text-ink-500">
                    {{ 'adminBilling.fields.failureReason' | transloco }}
                  </dt>
                  <dd class="text-ink-800" data-field="failure-reason">
                    {{ attempt.failureReason }}
                  </dd>
                }
              </dl>
              @if (attempt.needsRefund) {
                <p
                  class="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger"
                  role="note"
                  data-field="refund"
                >
                  {{
                    'adminBilling.refund.body'
                      | transloco: { tracker: attempt.tracker ?? '—' }
                  }}
                </p>
              }
            </li>
          }
        </ul>
      </hh-card>
    }
  `,
})
export class AdminPaymentAttempts {
  /** As returned, oldest first; shown newest first without touching the array. */
  readonly payments = input.required<readonly BillingPayment[]>();
  /** The attempt the surrounding drawer already shows in full, left out of this list. */
  readonly excludeId = input<string | null>(null);

  protected readonly dateTime = ADMIN_BILLING_DATE_TIME;

  protected readonly attempts = computed(() => {
    const excludeId = this.excludeId();
    // A payload without the array renders nothing rather than throwing.
    return [...(this.payments() ?? [])]
      .reverse()
      .filter((p) => p.id !== excludeId)
      .map(attemptView);
  });
}
