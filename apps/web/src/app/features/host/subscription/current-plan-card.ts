import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Card, StatusPill } from '@hostelhive/ui';
import type { BillingSubscription } from '@hostelhive/data-access';
import { ApiDate } from '@util/api-date';
import {
  BILLING_FEATURES,
  statusTone,
} from '@app/shared/billing/billing-labels';

/** One line under the plan name: an i18n key and, when the copy names one, its raw API date. */
interface CurrentPlanLine {
  key: string;
  date?: string;
}

/**
 * The hostel's current plan: name, status badge, the date that matters for its status, a
 * pending plan switch, and what is switched on right now.
 *
 * `features` is the billing payload's own list rather than the plan's, so a past-due plan
 * correctly shows Boost off. Plan-change actions are projected into the bottom of the card.
 *
 * `<hh-current-plan-card [subscription]="billing.subscription" [features]="billing.features" />`
 */
@Component({
  selector: 'hh-current-plan-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Card, StatusPill, TranslocoPipe, ApiDate],
  host: { class: 'block' },
  template: `
    <hh-card variant="bordered">
      <p class="text-xs font-semibold uppercase tracking-wide text-ink-400">
        {{ 'hostBilling.currentPlan' | transloco }}
      </p>
      @if (subscription(); as sub) {
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <h2 class="font-display text-xl font-bold text-ink-900">
            {{ sub.plan.name }}
          </h2>
          <hh-status-pill [tone]="tone()">{{ sub.status.name }}</hh-status-pill>
        </div>
        @for (line of lines(); track line.key) {
          <p class="mt-1 text-sm text-ink-600" [attr.data-line]="line.key">
            {{
              line.key
                | transloco: { date: (line.date | apiDate: 'd MMM yyyy') }
            }}
          </p>
        }
        @if (sub.scheduled_plan; as next) {
          <p
            class="mt-1 text-sm text-ink-600"
            data-line="hostBilling.switchesTo"
          >
            {{ 'hostBilling.switchesTo' | transloco: { plan: next.name } }}
          </p>
        }
      } @else {
        <h2 class="mt-2 font-display text-xl font-bold text-ink-900">
          {{ 'hostBilling.noPlanTitle' | transloco }}
        </h2>
        <p class="mt-1 text-sm text-ink-600">
          {{ 'hostBilling.noPlanMessage' | transloco }}
        </p>
      }
      @if (featureKeys().length) {
        <div class="mt-4 border-t border-ink-100 pt-4">
          <h3 class="text-sm font-semibold text-ink-800">
            {{ 'hostBilling.activeFeatures' | transloco }}
          </h3>
          <ul class="mt-2 space-y-2 text-sm text-ink-700">
            @for (key of featureKeys(); track key) {
              <li class="flex items-start gap-3">
                <i
                  class="ti ti-circle-check mt-px shrink-0 text-base text-ok"
                  aria-hidden="true"
                ></i>
                <span>{{ key | transloco }}</span>
              </li>
            }
          </ul>
        </div>
      }
      <ng-content />
    </hh-card>
  `,
})
export class CurrentPlanCard {
  readonly subscription = input.required<BillingSubscription | null>();
  readonly features = input.required<readonly string[]>();

  protected readonly tone = computed(() =>
    statusTone(this.subscription()?.status.slug),
  );

  protected readonly lines = computed<readonly CurrentPlanLine[]>(() => {
    const sub = this.subscription();
    return sub ? statusLines(sub) : [];
  });

  // Fixed order regardless of the payload's; a feature this app has no label for is skipped.
  protected readonly featureKeys = computed<readonly string[]>(() => {
    const on = this.features();
    return BILLING_FEATURES.filter((f) => on.includes(f.code)).map(
      (f) => f.labelKey,
    );
  });
}

/** The date lines a status calls for; a line whose date the API left null is dropped. */
function statusLines(sub: BillingSubscription): CurrentPlanLine[] {
  const end = sub.current_period_end;
  const dated = (key: string, date: string | null): CurrentPlanLine[] =>
    date ? [{ key, date }] : [];

  switch (sub.status.slug) {
    case 'active':
      return dated(
        sub.cancel_at_period_end
          ? 'hostBilling.endsOn'
          : 'hostBilling.renewsOn',
        end,
      );
    case 'past-due':
      return [
        ...dated('hostBilling.wasDueOn', end),
        ...dated('hostBilling.graceUntil', sub.grace_until),
      ];
    case 'incomplete':
      return [{ key: 'hostBilling.awaitingFirstPayment' }];
    case 'expired':
    case 'canceled':
      return dated('hostBilling.endedOn', end);
    default:
      return [];
  }
}
