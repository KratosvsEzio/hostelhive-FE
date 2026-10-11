import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Card } from '@hostelhive/ui';
import type { PublicPlan } from '@hostelhive/data-access';
import { BILLING_FEATURES } from './billing-labels';
import { BillingMoneyPipe } from './billing-money.pipe';

/** The plan fields a card needs, so both the public plan list and the billing screen's plans fit. */
export type PlanCardPlan = Pick<
  PublicPlan,
  'name' | 'price' | 'currency' | 'features'
>;

interface PlanCardFeatureRow {
  labelKey: string;
  included: boolean;
}

/**
 * One plan's name, monthly price and Listing / Boost / CRM checklist.
 *
 * Presentation only: the caller projects its own action (a checkout button on the billing
 * screen, a link on the pricing page) into the bottom of the card.
 *
 * `<hh-plan-card [plan]="plan"><hh-button …/></hh-plan-card>`
 */
@Component({
  selector: 'hh-plan-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Card, TranslocoPipe, BillingMoneyPipe],
  host: { class: 'block' },
  template: `
    <hh-card variant="bordered" padding="none" class="flex h-full flex-col">
      <div class="border-b border-ink-100 p-6">
        <h3 class="font-display text-xl font-bold text-ink-900">
          {{ plan().name }}
        </h3>
        @if (hasPrice()) {
          <p class="mt-3 flex flex-wrap items-baseline gap-1">
            <span class="text-3xl font-bold text-ink-900"
              ><bdi>{{
                plan().price | billingMoney: plan().currency
              }}</bdi></span
            >
            <span class="text-sm text-ink-400">{{
              'sharedBilling.perMonth' | transloco
            }}</span>
          </p>
        } @else {
          <p class="mt-3 text-sm font-medium text-ink-500">
            {{
              'sharedBilling.notAvailableIn'
                | transloco: { currency: plan().currency }
            }}
          </p>
        }
      </div>
      <ul class="flex-1 space-y-3 px-6 py-5 text-sm text-ink-700">
        @for (row of featureRows(); track row.labelKey) {
          <li
            class="flex items-start gap-3"
            [attr.data-included]="row.included"
          >
            <i
              class="ti mt-px shrink-0 text-base"
              [class.ti-circle-check]="row.included"
              [class.text-ok]="row.included"
              [class.ti-circle-x]="!row.included"
              [class.text-ink-300]="!row.included"
              aria-hidden="true"
            ></i>
            <span [class.text-ink-400]="!row.included">
              {{ row.labelKey | transloco }}
              <span class="sr-only">
                ({{
                  (row.included
                    ? 'sharedBilling.included'
                    : 'sharedBilling.notIncluded'
                  ) | transloco
                }})
              </span>
            </span>
          </li>
        }
      </ul>
      <div class="px-6 pb-6">
        <ng-content />
      </div>
    </hh-card>
  `,
})
export class PlanCard {
  readonly plan = input.required<PlanCardPlan>();

  protected readonly hasPrice = computed(() => this.plan().price !== null);

  // Listing is part of every plan; `features` only ever lists the add-ons.
  protected readonly featureRows = computed<readonly PlanCardFeatureRow[]>(
    () => {
      const features = this.plan().features;
      return BILLING_FEATURES.map(({ code, labelKey }) => ({
        labelKey,
        included: code === 'listing' || features.includes(code),
      }));
    },
  );
}
