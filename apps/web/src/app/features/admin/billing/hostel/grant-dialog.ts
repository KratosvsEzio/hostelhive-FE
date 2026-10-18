import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { combineLatest, map } from 'rxjs';
import { ConfirmModal, Dropdown, DropdownOption } from '@hostelhive/ui';
import type {
  AdminPlan,
  BillingSubscription,
  OpenInvoice,
} from '@hostelhive/data-access';
import { AdminUtcDate } from '../shared/admin-utc-date';

/** A plan the dialog can grant. */
export type GrantPlan = Pick<AdminPlan, 'id' | 'code' | 'name'>;

/** What the admin confirmed; `planId` goes back exactly as the API returned it. */
export interface GrantRequest {
  planId: string;
  months: number;
}

/** A refused grant: the server's own words when it gave any, else one of our keys. */
export interface GrantError {
  message: string | null;
  key: string;
}

const MONTHS = Array.from({ length: 24 }, (_, i) => i + 1);

/** The backend's `Subscription#live?`: a grant to one of these extends it instead of starting now. */
const LIVE_STATUSES: readonly string[] = ['active', 'past-due'];

/**
 * Grants a hostel a plan free of charge for 1 to 24 months, stating what the grant does to
 * this hostel before it is sent.
 *
 * A live subscription is extended from its current period end, switching plan straight away
 * when the plan differs, keeping a pending cancellation and dropping a scheduled switch. Any
 * other subscription starts the plan today. An open invoice is closed either way. The page
 * sends the request and reports back through `busy` and `error`.
 */
@Component({
  selector: 'hh-admin-grant-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmModal, Dropdown, TranslocoPipe, AdminUtcDate],
  template: `
    <hh-confirm-modal
      icon="ti-gift"
      tone="info"
      size="md"
      [title]="'adminBilling.grant.title' | transloco"
      [confirmLabel]="'adminBilling.grant.confirm' | transloco"
      [cancelLabel]="'adminBilling.common.cancel' | transloco"
      [confirmDisabled]="busy() || !plan()"
      (confirm)="submit()"
      (cancel)="cancelled.emit()"
    >
      <div class="flex flex-col gap-4 text-ink-700">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label
              class="text-sm font-medium text-ink-800"
              for="admin-grant-plan"
              >{{ 'adminBilling.grant.plan' | transloco }}</label
            >
            <hh-dropdown
              variant="field"
              controlId="admin-grant-plan"
              data-testid="grant-plan"
              [options]="planOptions()"
              [value]="planId()"
              [disabled]="busy()"
              (valueChange)="pickPlan($event)"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              class="text-sm font-medium text-ink-800"
              for="admin-grant-months"
              >{{ 'adminBilling.grant.months' | transloco }}</label
            >
            <hh-dropdown
              variant="field"
              controlId="admin-grant-months"
              data-testid="grant-months"
              [options]="monthOptions()"
              [value]="monthsValue()"
              [disabled]="busy()"
              (valueChange)="pickMonths($event)"
            />
          </div>
        </div>

        @if (plan(); as chosen) {
          <ul class="flex flex-col gap-2" data-testid="grant-effects">
            @if (extendsFrom(); as date) {
              <li data-testid="grant-extends">
                {{
                  'adminBilling.grant.extends'
                    | transloco
                      : {
                          months: months(),
                          plan: chosen.name,
                          date: (date | adminUtcDate: 'd MMM yyyy'),
                        }
                }}
              </li>
            } @else {
              <li data-testid="grant-starts-now">
                {{
                  'adminBilling.grant.startsNow'
                    | transloco: { plan: chosen.name, months: months() }
                }}
              </li>
            }
            @if (switchFrom(); as current) {
              <li data-testid="grant-switch-now">
                {{
                  'adminBilling.grant.switchNow'
                    | transloco: { current, plan: chosen.name }
                }}
              </li>
            }
            @if (voids(); as number) {
              <li class="text-warn" data-testid="grant-voids">
                {{ 'adminBilling.grant.voids' | transloco: { number } }}
              </li>
            }
            @if (keepsCancel()) {
              <li class="text-warn" data-testid="grant-keeps-cancel">
                {{ 'adminBilling.grant.keepsCancel' | transloco }}
              </li>
            }
            @if (dropsSwitchTo(); as scheduled) {
              <li class="text-warn" data-testid="grant-drops-switch">
                {{
                  'adminBilling.grant.dropsSwitch'
                    | transloco: { plan: scheduled }
                }}
              </li>
            }
            <li class="text-ink-500" data-testid="grant-receipt">
              {{ 'adminBilling.grant.receipt' | transloco }}
            </li>
          </ul>
        }

        @if (error(); as e) {
          <p
            class="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger"
            role="alert"
            data-testid="grant-error"
          >
            {{ e.message ?? (e.key | transloco) }}
          </p>
        }
      </div>
    </hh-confirm-modal>
  `,
})
export class AdminGrantDialog {
  private readonly transloco = inject(TranslocoService);

  readonly subscription = input.required<BillingSubscription | null>();
  readonly openInvoice = input.required<OpenInvoice | null>();
  /** Active plans, in the order to offer them. */
  readonly plans = input.required<readonly GrantPlan[]>();
  readonly busy = input(false);
  readonly error = input<GrantError | null>(null);

  readonly confirmed = output<GrantRequest>();
  readonly cancelled = output<void>();

  // The current plan when it can still be granted, else the first; kept while it stays on offer.
  protected readonly planId = linkedSignal<readonly GrantPlan[], string | null>(
    {
      source: this.plans,
      computation: (plans, previous) => {
        if (previous?.value && plans.some((p) => p.id === previous.value)) {
          return previous.value;
        }
        const code = this.subscription()?.plan.code;
        return (plans.find((p) => p.code === code) ?? plans[0])?.id ?? null;
      },
    },
  );

  protected readonly months = signal(1);
  protected readonly monthsValue = computed(() => String(this.months()));

  protected readonly plan = computed(
    () => this.plans().find((p) => p.id === this.planId()) ?? null,
  );

  protected readonly planOptions = computed<DropdownOption[]>(() =>
    this.plans().map((p) => ({ value: p.id, label: p.name })),
  );

  private readonly monthLabels = toSignal(
    combineLatest(
      MONTHS.map((count) =>
        this.transloco.selectTranslate('adminBilling.grant.monthsOption', {
          count,
        }),
      ),
    ).pipe(map((labels) => labels.map(String))),
    { initialValue: MONTHS.map(String) },
  );

  protected readonly monthOptions = computed<DropdownOption[]>(() => {
    const labels = this.monthLabels();
    return MONTHS.map((n, i) => ({ value: String(n), label: labels[i] }));
  });

  private readonly live = computed(() => {
    const sub = this.subscription();
    return !!sub && LIVE_STATUSES.includes(sub.status.slug);
  });

  /** The live period's end, which the granted months follow; null when the plan starts today. */
  protected readonly extendsFrom = computed(() =>
    this.live() ? (this.subscription()?.current_period_end ?? null) : null,
  );

  /** The live plan's name when the grant swaps it for another one now. */
  protected readonly switchFrom = computed(() => {
    const sub = this.subscription();
    const chosen = this.plan();
    if (!this.live() || !sub || !chosen) return null;
    return sub.plan.code === chosen.code ? null : sub.plan.name;
  });

  // An invoice with a transfer under review blocks the grant before this dialog can open.
  protected readonly voids = computed(() => {
    const invoice = this.openInvoice();
    return invoice && !invoice.awaiting_verification ? invoice.number : null;
  });

  // Extending a live plan leaves its cancellation in place; a fresh start clears it.
  protected readonly keepsCancel = computed(
    () => this.live() && !!this.subscription()?.cancel_at_period_end,
  );

  protected readonly dropsSwitchTo = computed(() =>
    this.live() ? (this.subscription()?.scheduled_plan?.name ?? null) : null,
  );

  protected pickPlan(value: string | string[] | null): void {
    if (typeof value === 'string') this.planId.set(value);
  }

  protected pickMonths(value: string | string[] | null): void {
    const n = MONTHS.find((m) => String(m) === value);
    if (n) this.months.set(n);
  }

  protected submit(): void {
    const chosen = this.plan();
    if (!chosen || this.busy()) return;
    this.confirmed.emit({ planId: chosen.id, months: this.months() });
  }
}
