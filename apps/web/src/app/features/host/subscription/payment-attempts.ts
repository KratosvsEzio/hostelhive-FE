import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { BillingPayment } from '@hostelhive/data-access';
import { Card, HhLink, StatusPill, type StatusTone } from '@hostelhive/ui';
import { LocaleLink } from '@core/i18n/locale-link';
import { ApiDate } from '@util/api-date';
import {
  BillingAttemptNote,
  billingAttemptNote,
  billingPaymentCharged,
  billingPaymentMethodKey,
  billingPaymentStatusKey,
  billingPaymentStatusTone,
} from '@app/shared/billing/billing-labels';
import { BillingMoneyPipe } from '@app/shared/billing/billing-money.pipe';

/** One attempt as the list shows it: only the fields that may reach the screen. */
interface AttemptView {
  id: string;
  methodKey: string;
  amount: string;
  currency: string;
  /** Our label for the status, or null to show `statusName` as returned. */
  statusKey: string | null;
  statusName: string;
  tone: StatusTone;
  date: string;
  note: BillingAttemptNote | null;
  /** Our label for who started the charge, or null for a customer-made or unrecognised one. */
  initiatorKey: string | null;
}

const INITIATOR_KEYS: Record<string, string> = {
  schedule: 'hostBillingHistory.initiatedSchedule',
  upgrade: 'hostBillingHistory.initiatedUpgrade',
};

const NOTE_CLASSES: Record<BillingAttemptNote['tone'], string> = {
  danger: 'bg-danger/10 font-medium text-danger',
  neutral: 'bg-ink-50 text-ink-700',
};

function attemptView(payment: BillingPayment): AttemptView {
  const charged = billingPaymentCharged(payment);
  const slug = payment.status?.slug;
  return {
    id: payment.id,
    methodKey: billingPaymentMethodKey(payment.payment_method),
    amount: payment.amount,
    currency: payment.currency,
    statusKey: charged
      ? 'hostBillingHistory.attemptCharged'
      : billingPaymentStatusKey(slug),
    statusName: payment.status?.name ?? '',
    tone: charged ? 'danger' : billingPaymentStatusTone(slug),
    date: payment.succeeded_at ?? payment.created_at,
    note: billingAttemptNote(payment),
    initiatorKey: Object.prototype.hasOwnProperty.call(
      INITIATOR_KEYS,
      payment.initiated_by ?? '',
    )
      ? INITIATOR_KEYS[payment.initiated_by]
      : null,
  };
}

/**
 * Every attempt to pay one HostelHive invoice, newest first: how it was paid, how much in the
 * payment's own currency, where it stands, and our own note for a failed one.
 *
 * Internal fields (the failure reason, references, proof) never reach the template.
 *
 * `<hh-payment-attempts [payments]="invoice.payments" [invoiceNumber]="invoice.number" />`
 */
@Component({
  selector: 'hh-payment-attempts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Card,
    HhLink,
    StatusPill,
    RouterLink,
    LocaleLink,
    TranslocoPipe,
    ApiDate,
    BillingMoneyPipe,
  ],
  host: { class: 'block' },
  template: `
    <hh-card variant="bordered">
      <h2 class="font-display text-lg font-bold text-ink-900">
        {{ 'hostBillingHistory.attemptsTitle' | transloco }}
      </h2>
      @if (attempts().length) {
        <ul class="mt-3 flex flex-col divide-y divide-ink-100">
          @for (attempt of attempts(); track attempt.id) {
            <li class="flex flex-col gap-2 py-3" data-testid="attempt">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="flex flex-wrap items-center gap-2">
                  <span
                    class="text-sm font-medium text-ink-900"
                    data-field="method"
                    >{{ attempt.methodKey | transloco }}</span
                  >
                  @if (attempt.initiatorKey; as initiatorKey) {
                    <span
                      class="rounded-full bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-700"
                      data-field="initiator"
                      >{{ initiatorKey | transloco }}</span
                    >
                  }
                </span>
                <span
                  class="text-sm font-semibold text-ink-900"
                  data-field="amount"
                  ><bdi>{{
                    attempt.amount | billingMoney: attempt.currency
                  }}</bdi></span
                >
              </div>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <hh-status-pill [tone]="attempt.tone" data-field="status">{{
                  attempt.statusKey
                    ? (attempt.statusKey | transloco)
                    : attempt.statusName
                }}</hh-status-pill>
                <span class="text-xs text-ink-500" data-field="date">{{
                  attempt.date | apiDate: 'd MMM yyyy'
                }}</span>
              </div>
              @if (attempt.note; as note) {
                <p
                  class="rounded-xl px-3 py-2 text-sm"
                  [class]="noteClasses[note.tone]"
                  [attr.data-tone]="note.tone"
                  data-field="note"
                >
                  {{ note.key | transloco: { number: invoiceNumber() } }}
                  @if (note.contactUs) {
                    <a hhLink routerLink="/contact" data-testid="contact-us">{{
                      'common.contactUs' | transloco
                    }}</a>
                  }
                </p>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="mt-2 text-sm text-ink-600" data-testid="no-attempts">
          {{ 'hostBillingHistory.noAttempts' | transloco }}
        </p>
      }
    </hh-card>
  `,
})
export class PaymentAttempts {
  /** As returned, oldest first; shown newest first without touching the array. */
  readonly payments = input.required<BillingPayment[]>();
  readonly invoiceNumber = input.required<string>();

  protected readonly noteClasses = NOTE_CLASSES;

  protected readonly attempts = computed(() =>
    // A payload without the array still renders the empty state rather than throwing.
    [...(this.payments() ?? [])].reverse().map(attemptView),
  );
}
