import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Button,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  Toggle,
} from '@hostelhive/ui';
import type { AdminCurrency, AdminPlan } from '@hostelhive/data-access';
import { AdminBillingApi } from '@services';
import { BILLING_FEATURES } from '@app/shared/billing/billing-labels';
import { AdminShell } from '@features/admin/admin-shell/admin-shell';
import {
  AdminBillingError,
  adminBillingError,
} from '../shared/admin-billing-errors';
import { AdminBillingTabs } from '../shared/admin-billing-tabs';
import {
  PLAN_CURRENCIES,
  PlanDraft,
  PlanEdits,
  PlanNameError,
  PlanPriceError,
  planDeactivates,
  planDraft,
  planIsDirty,
  planIsValid,
  planNameError,
  planPriceError,
  planUpdate,
} from './plan-edit';

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden';

const PRICE_LABEL_KEYS: Record<AdminCurrency, string> = {
  PKR: 'adminBilling.plans.pricePkr',
  USD: 'adminBilling.plans.priceUsd',
};

const SKELETON_ROWS = [0, 1, 2];

interface PriceFieldView {
  currency: AdminCurrency;
  labelKey: string;
  value: string;
  /** The server has no price in this currency yet. */
  missing: boolean;
  error: PlanPriceError | null;
}

interface PlanRowView {
  plan: AdminPlan;
  draft: PlanDraft;
  featureKeys: readonly string[];
  nameError: PlanNameError | null;
  prices: readonly PriceFieldView[];
  dirty: boolean;
  saving: boolean;
  error: AdminBillingError | null;
}

function without<T>(record: Record<string, T>, id: string): Record<string, T> {
  const next = { ...record };
  delete next[id];
  return next;
}

function withoutId(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

/**
 * HostelHive's plans with their names, availability and prices, each saved on its own.
 *
 * Edits are kept per plan apart from the server's copy, so saving one plan, or reloading the
 * list, never throws away what the admin typed into another. Prices stay the strings typed:
 * they are checked against a pattern and sent as they are, never read as numbers.
 */
@Component({
  selector: 'hh-admin-plans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AdminShell,
    AdminBillingTabs,
    Button,
    ConfirmModal,
    EmptyState,
    ErrorState,
    Input,
    Skeleton,
    Toggle,
    TranslocoPipe,
  ],
  templateUrl: './admin-plans.html',
})
export class AdminPlans {
  private readonly api = inject(AdminBillingApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly skeletonRows = SKELETON_ROWS;

  protected readonly loadState = signal<LoadState>('loading');
  protected readonly networkError = signal(false);
  private readonly plans = signal<readonly AdminPlan[]>([]);
  private readonly edits = signal<Record<string, PlanEdits>>({});
  private readonly saving = signal<ReadonlySet<string>>(new Set());
  /** Plans whose Save was pressed; their field errors show from then on. */
  private readonly attempted = signal<ReadonlySet<string>>(new Set());
  private readonly rowErrors = signal<Record<string, AdminBillingError>>({});

  /** The name of the plan saved last, for the notice. */
  protected readonly savedName = signal<string | null>(null);
  protected readonly pageError = signal<AdminBillingError | null>(null);
  /** The plan waiting on the deactivation confirm. */
  protected readonly confirming = signal<AdminPlan | null>(null);

  private loadSub: Subscription | null = null;

  protected readonly rows = computed<readonly PlanRowView[]>(() => {
    const edits = this.edits();
    const saving = this.saving();
    const attempted = this.attempted();
    const errors = this.rowErrors();
    return [...this.plans()]
      .sort((a, b) => a.position - b.position)
      .map((plan) => {
        const draft = planDraft(plan, edits[plan.id]);
        const showErrors = attempted.has(plan.id);
        return {
          plan,
          draft,
          featureKeys: featureKeys(plan.features),
          nameError: showErrors ? planNameError(draft.name) : null,
          prices: PLAN_CURRENCIES.map((currency) => ({
            currency,
            labelKey: PRICE_LABEL_KEYS[currency],
            value: draft.prices[currency],
            missing: plan.prices[currency] === undefined,
            error: showErrors ? planPriceError(plan, draft, currency) : null,
          })),
          dirty: planIsDirty(plan, draft),
          saving: saving.has(plan.id),
          error: errors[plan.id] ?? null,
        };
      });
  });

  constructor() {
    this.load();
  }

  /** A background reload keeps the list on screen and every unsaved edit in place. */
  protected load(background = false): void {
    this.loadSub?.unsubscribe();
    if (!background) {
      this.loadState.set('loading');
      this.networkError.set(false);
    }
    this.loadSub = this.api
      .plans()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plans) => {
          this.plans.set(plans);
          this.loadState.set('ready');
        },
        error: (err: unknown) => {
          const error = adminBillingError(err);
          if (background) {
            this.pageError.set(error);
            return;
          }
          this.networkError.set(error.kind === 'network');
          this.loadState.set(error.kind === 'forbidden' ? 'forbidden' : 'error');
        },
      });
  }

  protected setName(id: string, name: string): void {
    this.patch(id, { name });
  }

  protected setActive(id: string, active: boolean): void {
    this.patch(id, { active });
  }

  protected setPrice(id: string, currency: AdminCurrency, value: string): void {
    const prices = { ...this.edits()[id]?.prices, [currency]: value };
    this.patch(id, { prices });
  }

  protected save(id: string): void {
    const plan = this.plans().find((p) => p.id === id);
    if (!plan || this.saving().has(id)) return;
    this.attempted.update((set) => new Set(set).add(id));
    const draft = planDraft(plan, this.edits()[id]);
    if (!planIsValid(plan, draft) || !planIsDirty(plan, draft)) return;
    if (planDeactivates(plan, draft)) {
      this.confirming.set(plan);
      return;
    }
    this.send(plan, draft);
  }

  protected confirmDeactivate(): void {
    const pending = this.confirming();
    this.confirming.set(null);
    if (!pending) return;
    const plan = this.plans().find((p) => p.id === pending.id);
    if (!plan || this.saving().has(plan.id)) return;
    this.send(plan, planDraft(plan, this.edits()[plan.id]));
  }

  protected cancelDeactivate(): void {
    this.confirming.set(null);
  }

  private patch(id: string, change: PlanEdits): void {
    this.edits.update((all) => ({ ...all, [id]: { ...all[id], ...change } }));
  }

  private send(plan: AdminPlan, draft: PlanDraft): void {
    const id = plan.id;
    this.saving.update((set) => new Set(set).add(id));
    this.rowErrors.update((all) => without(all, id));
    this.savedName.set(null);
    this.pageError.set(null);
    this.api
      .updatePlan(id, planUpdate(plan, draft))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.plans.update((plans) =>
            plans.map((p) => (p.id === id ? saved : p)),
          );
          this.edits.update((all) => without(all, id));
          this.attempted.update((set) => withoutId(set, id));
          this.saving.update((set) => withoutId(set, id));
          this.savedName.set(saved.name);
        },
        error: (err: unknown) => {
          this.saving.update((set) => withoutId(set, id));
          const error = adminBillingError(err);
          if (error.kind === 'notFound') {
            // The copy promises a refreshed list; drafts survive because they are kept apart.
            this.pageError.set(error);
            this.load(true);
            return;
          }
          this.rowErrors.update((all) => ({ ...all, [id]: error }));
        },
      });
  }
}

// Fixed order whatever the payload's; a feature this app has no label for is skipped.
function featureKeys(features: readonly string[]): readonly string[] {
  return BILLING_FEATURES.filter((f) => features.includes(f.code)).map(
    (f) => f.labelKey,
  );
}
