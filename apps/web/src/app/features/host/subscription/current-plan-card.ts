import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Card, StatusPill } from '@hostelhive/ui';
import type { BillingSubscription } from '@hostelhive/data-access';
import { ApiDate } from '@util/api-date';
import {
  BILLING_FEATURES,
  isSafepayBilled,
  isSafepayTrial,
  statusTone,
} from '@app/shared/billing/billing-labels';

/** One line under the plan name: an i18n key and, when the copy names one, its raw API date. */
interface CurrentPlanLine {
  key: string;
  date?: string;
}

/** A plan change the card offers; the page runs it and reports which one is in flight. */
export type CurrentPlanAction = 'undo' | 'resume' | 'cancel';

/** The pending switch: the scheduled plan's name and the raw API date it takes effect. */
interface ScheduledSwitch {
  plan: string;
  date: string;
}

/**
 * The hostel's current plan: name, status badge, the date that matters for its status, a
 * pending plan switch, and what is switched on right now.
 *
 * `features` is the billing payload's own list rather than the plan's, so a past-due plan
 * correctly shows Boost off. With `canChange`, an active plan offers Undo beside a pending
 * switch, Resume plan beside its end date while cancelling, and Cancel plan otherwise. The
 * page runs each action and reports back through `busy` and `locked`; a card-level error is
 * projected into the bottom of the card. `autoRenew` is the billing payload's own flag, and turns
 * an invoice-billed plan's renewal line into an automatic one. A plan Safepay bills says so, and
 * shows the end of its free trial instead of a renewal while Safepay reports one.
 *
 * `<hh-current-plan-card [subscription]="billing.subscription" [features]="billing.features" />`
 */
@Component({
  selector: 'hh-current-plan-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card, NgTemplateOutlet, StatusPill, TranslocoPipe, ApiDate],
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
        <div aria-live="polite" data-testid="plan-status">
          @for (line of lines(); track line.key) {
            <div class="mt-1 flex flex-wrap items-center gap-x-2">
              <p class="text-sm text-ink-600" [attr.data-line]="line.key">
                {{
                  line.key
                    | transloco: { date: (line.date | apiDate: 'd MMM yyyy') }
                }}
              </p>
              @if (line.key === 'hostBilling.endsOn' && canResume()) {
                <ng-container [ngTemplateOutlet]="resumeButton" />
              }
            </div>
          }
          @if (canResume() && !sub.current_period_end) {
            <div class="mt-1">
              <ng-container [ngTemplateOutlet]="resumeButton" />
            </div>
          }
          @if (switchTo(); as next) {
            <div class="mt-1 flex flex-wrap items-center gap-x-2">
              <p
                class="text-sm text-ink-600"
                data-line="hostBilling.switchesTo"
              >
                {{
                  'hostBilling.switchesTo'
                    | transloco
                      : {
                          plan: next.plan,
                          date: (next.date | apiDate: 'd MMM yyyy'),
                        }
                }}
              </p>
              @if (canChange()) {
                <button
                  hh-button
                  type="button"
                  variant="text"
                  size="sm"
                  data-testid="card-undo"
                  [attr.aria-label]="
                    'hostBilling.undoSwitchLabel'
                      | transloco: { plan: next.plan }
                  "
                  [disabled]="locked()"
                  [loading]="busy() === 'undo'"
                  (click)="undo.emit()"
                >
                  {{ 'hostBilling.undo' | transloco }}
                </button>
              }
            </div>
          }
        </div>
        <ng-template #resumeButton>
          <button
            hh-button
            type="button"
            variant="text"
            color="primary"
            size="sm"
            data-testid="card-resume"
            [disabled]="locked()"
            [loading]="busy() === 'resume'"
            (click)="resume.emit()"
          >
            {{ 'hostBilling.resumePlan' | transloco }}
          </button>
        </ng-template>
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
      @if (canCancel()) {
        <div class="mt-4 flex justify-end">
          <button
            hh-button
            type="button"
            variant="text"
            color="default"
            size="sm"
            data-testid="card-cancel"
            [disabled]="locked()"
            [loading]="busy() === 'cancel'"
            (click)="cancelPlan.emit()"
          >
            {{ 'hostBilling.cancelPlan' | transloco }}
          </button>
        </div>
      }
      <ng-content />
    </hh-card>
  `,
})
export class CurrentPlanCard {
  readonly subscription = input.required<BillingSubscription | null>();
  readonly features = input.required<readonly string[]>();
  readonly canChange = input(false);
  readonly autoRenew = input(false);
  readonly busy = input<CurrentPlanAction | null>(null);
  readonly locked = input(false);
  readonly undo = output<void>();
  // Resuming the plan, not the native "resume" event.
  // eslint-disable-next-line @angular-eslint/no-output-native
  readonly resume = output<void>();
  readonly cancelPlan = output<void>();

  protected readonly tone = computed(() =>
    statusTone(this.subscription()?.status.slug),
  );

  protected readonly lines = computed<readonly CurrentPlanLine[]>(() => {
    const sub = this.subscription();
    return sub ? statusLines(sub, this.autoRenew()) : [];
  });

  // A cancel wins at period end, so a switch is only shown on an active plan that renews.
  protected readonly switchTo = computed<ScheduledSwitch | null>(() => {
    const sub = this.subscription();
    const next = sub?.scheduled_plan;
    const date = sub?.current_period_end;
    if (!sub || !isActive(sub) || sub.cancel_at_period_end || !next || !date) {
      return null;
    }
    return { plan: next.name, date };
  });

  protected readonly canResume = computed(() => {
    const sub = this.subscription();
    return (
      !!sub && isActive(sub) && sub.cancel_at_period_end && this.canChange()
    );
  });

  protected readonly canCancel = computed(() => {
    const sub = this.subscription();
    return (
      !!sub && isActive(sub) && !sub.cancel_at_period_end && this.canChange()
    );
  });

  // Fixed order regardless of the payload's; a feature this app has no label for is skipped.
  protected readonly featureKeys = computed<readonly string[]>(() => {
    const on = this.features();
    return BILLING_FEATURES.filter((f) => on.includes(f.code)).map(
      (f) => f.labelKey,
    );
  });
}

function isActive(sub: BillingSubscription): boolean {
  return sub.status.slug === 'active';
}

/** The date lines a status calls for; a line whose date the API left null is dropped. */
function statusLines(
  sub: BillingSubscription,
  autoRenew: boolean,
): CurrentPlanLine[] {
  const end = sub.current_period_end;
  const dated = (key: string, date: string | null): CurrentPlanLine[] =>
    date ? [{ key, date }] : [];

  // A plan Safepay bills says so, until it is cancelling and no longer billed at all.
  const billedBy: CurrentPlanLine[] =
    isSafepayBilled(sub) && !sub.cancel_at_period_end
      ? [{ key: 'hostBilling.billedBySafepay' }]
      : [];

  switch (sub.status.slug) {
    case 'active':
      if (sub.cancel_at_period_end) return dated('hostBilling.endsOn', end);
      if (isSafepayTrial(sub)) {
        return [...billedBy, ...dated('hostBilling.freeTrialUntil', end)];
      }
      if (isSafepayBilled(sub)) {
        return [...billedBy, ...dated('hostBilling.renewsOn', end)];
      }
      return dated(
        autoRenew
          ? 'hostBilling.renewsAutomaticallyOn'
          : 'hostBilling.renewsOn',
        end,
      );
    case 'past-due':
      return [
        ...billedBy,
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
