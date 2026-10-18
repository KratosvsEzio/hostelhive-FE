import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Card, StatusPill } from '@hostelhive/ui';
import type { OpenInvoice, SavedCard } from '@hostelhive/data-access';
import { LocaleLink } from '@core/i18n/locale-link';
import { ApiDate } from '@util/api-date';
import { invoiceKindKey } from '@app/shared/billing/billing-labels';
import { BillingMoneyPipe } from '@app/shared/billing/billing-money.pipe';

/** The automatic renewal charge: the saved card's label and the raw API date it is charged on. */
interface AutoCharge {
  card: string;
  date: string;
}

/**
 * The hostel's unpaid HostelHive invoice: number, amount, what it is for, its deadline and a
 * Pay link to the payment step.
 *
 * While a bank transfer against it awaits confirmation, Pay gives way to an "under review"
 * pill, since paying again would double-pay. `canPay` hides Pay for people who may see billing
 * but not pay it. A renewal that the saved card will be charged for says so, with Pay kept.
 *
 * `<hh-payment-due [invoice]="billing.open_invoice" [payLink]="payLink" />`
 */
@Component({
  selector: 'hh-payment-due',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Card,
    Button,
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
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="font-display text-lg font-bold text-ink-900">
            {{ 'hostBilling.paymentDueTitle' | transloco }}
          </h2>
          <p class="mt-1 text-sm text-ink-500" data-field="number">
            {{
              'hostBilling.invoiceNumber'
                | transloco: { number: invoice().number }
            }}
          </p>
          <p class="mt-2 text-2xl font-bold text-ink-900" data-field="amount">
            <bdi>{{ invoice().total | billingMoney: invoice().currency }}</bdi>
          </p>
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
          @if (autoCharge(); as charge) {
            <p
              class="mt-1 text-sm text-ink-700"
              data-field="auto-charge"
            >
              {{
                'hostBilling.autoChargeNotice'
                  | transloco
                    : {
                        card: isolate(charge.card),
                        date: (charge.date | apiDate: 'd MMM yyyy'),
                      }
              }}
            </p>
          }
          @if (!underReview() && invoice().expires_at) {
            <p
              class="mt-1 text-sm font-medium text-ink-700"
              data-field="pay-by"
            >
              {{
                'hostBilling.payBy'
                  | transloco
                    : {
                        date:
                          (invoice().expires_at
                          | apiDate: 'd MMM yyyy, h:mm a'),
                      }
              }}
            </p>
          }
        </div>
        @if (underReview()) {
          <div class="max-w-xs">
            <hh-status-pill tone="warn" [dot]="true">{{
              'hostBilling.underReview' | transloco
            }}</hh-status-pill>
            <p class="mt-2 text-sm text-ink-600">
              {{ 'hostBilling.underReviewHint' | transloco }}
            </p>
          </div>
        } @else if (canPay()) {
          <a hh-button color="primary" size="md" [routerLink]="payLink()">
            {{ 'hostBilling.pay' | transloco }}
          </a>
        }
      </div>
    </hh-card>
  `,
})
export class PaymentDue {
  readonly invoice = input.required<OpenInvoice>();
  /** Absolute path of the payment step for this invoice. */
  readonly payLink = input.required<string>();
  readonly canPay = input(true);
  /** Whether the saved card renews the plan, as the billing payload says. */
  readonly autoRenew = input(false);
  readonly card = input<SavedCard | null>(null);
  /** The raw API date the renewal is charged on: the subscription's period end. */
  readonly chargeOn = input<string | null>(null);

  // Only a renewal is charged automatically; Pay stays, since paying first is still allowed.
  protected readonly autoCharge = computed<AutoCharge | null>(() => {
    const card = this.card();
    const invoice = this.invoice();
    const date = this.chargeOn() ?? invoice.period_start;
    if (!this.autoRenew() || !card || invoice.kind !== 'renewal') return null;
    if (this.underReview() || !date) return null;
    return { card: card.label, date };
  });

  protected readonly underReview = computed(
    () => this.invoice().awaiting_verification,
  );

  // An unknown kind still has a period worth showing, without a label this app cannot name.
  protected readonly purposeKey = computed(
    () => invoiceKindKey(this.invoice().kind) ?? 'hostBilling.forPeriod',
  );

  protected readonly hasPeriod = computed(
    () => !!this.invoice().period_start && !!this.invoice().period_end,
  );

  /** Unicode isolates around an interpolated card label, the plain-text form of `<bdi>`. */
  protected isolate(text: string): string {
    return `⁨${text}⁩`;
  }
}
