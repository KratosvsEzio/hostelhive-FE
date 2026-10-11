import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Observable,
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import type {
  ApiError,
  BillingInvoice,
  BillingPlan,
  HostBilling,
} from '@hostelhive/data-access';
import {
  Button,
  ConfirmModal,
  ErrorState,
  HhLink,
  Skeleton,
} from '@hostelhive/ui';
import { BillingApi, HostBillingStore } from '@services';
import { SessionStore } from '@core/auth/session-store';
import { LocaleLink } from '@core/i18n/locale-link';
import { LocaleStore } from '@core/i18n/locale-store';
import { localiseCommands } from '@core/i18n/locale-commands';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { ApiDate } from '@util/api-date';
import { isNetworkError } from '@util/network-error';
import {
  PlanButton,
  billingHistoryPath,
  planButton,
} from '@app/shared/billing/billing-labels';
import { BillingMoneyPipe } from '@app/shared/billing/billing-money.pipe';
import { PlanCard } from '@app/shared/billing/plan-card';
import { CurrentPlanAction, CurrentPlanCard } from './current-plan-card';
import { PaymentDue } from './payment-due';

type BillingView =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'ready'; billing: HostBilling }
  | { kind: 'forbidden' }
  | { kind: 'error'; networkError: boolean };

/** A refused checkout: the server's own words when it gave any (never for a 403), else one of ours. */
interface CheckoutError {
  planId: string;
  message: string | null;
  messageKey: string;
  countryRequired: boolean;
}

/** A plan change in flight. An Undo's `planId` is the plan card it came from, or null for the current plan card. */
type PlanChange =
  | { kind: 'schedule'; planId: string }
  | { kind: 'undo'; planId: string | null }
  | { kind: 'cancel' }
  | { kind: 'resume' };

/** A refused plan change, shown where it was asked for: that plan card, or the current plan card when `planId` is null. */
interface PlanChangeError {
  planId: string | null;
  message: string | null;
  messageKey: string;
}

interface PlanView {
  plan: BillingPlan;
  button: PlanButton;
  disabled: boolean;
  loading: boolean;
  /** A scheduled switch to this plan that the session may undo from its card. */
  canUndo: boolean;
  undoLoading: boolean;
  /** The server's own explanation for an unavailable plan, or null when it is not shown. */
  reason: string | null;
  /** The refusal from this card's own checkout, shown under its button. */
  error: CheckoutError | null;
  /** The refusal from a plan change asked for on this card. */
  changeError: PlanChangeError | null;
}

/** The checkout refusal that a hostel without a country gets, matched exactly as the server words it. */
const COUNTRY_REQUIRED = "Set the hostel's country first";

const SKELETON_PLANS = [0, 1, 2, 3] as const;

const CHANGE_FAILED: Record<PlanChange['kind'], string> = {
  schedule: 'hostBilling.scheduleFailed',
  undo: 'hostBilling.undoFailed',
  cancel: 'hostBilling.cancelFailed',
  resume: 'hostBilling.resumeFailed',
};

/**
 * A hostel's HostelHive billing: the current plan, any unpaid invoice, and one card per plan
 * with the single action the server allows.
 *
 * Every price, proration and action comes from the server. A checkout creates (or reuses) an
 * invoice and hands it to the payment step; nothing here is cached, so returning to the page
 * reads the billing summary again.
 */
@Component({
  selector: 'hh-billing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    CurrentPlanCard,
    PaymentDue,
    PlanCard,
    Button,
    ConfirmModal,
    ErrorState,
    HhLink,
    Skeleton,
    RouterLink,
    LocaleLink,
    NgTemplateOutlet,
    TranslocoPipe,
    BillingMoneyPipe,
    ApiDate,
  ],
  templateUrl: './billing-page.html',
})
export class BillingPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(BillingApi);
  private readonly billingStore = inject(HostBillingStore);
  private readonly session = inject(SessionStore);
  private readonly locale = inject(LocaleStore);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly skeletonPlans = SKELETON_PLANS;

  // The hostel id sits on an ancestor route and is not inherited here, so every level is read.
  protected readonly hostelId = toSignal(
    combineLatest(this.route.pathFromRoot.map((r) => r.paramMap)).pipe(
      map(
        (maps) =>
          maps
            .map((m) => m.get('hostelId'))
            .filter((id): id is string => !!id)
            .at(-1) ?? '',
      ),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  private readonly refresh = signal(0);

  // A new object on every load, so an action's response is applied only to the load it started on.
  private readonly loaded = toSignal(
    toObservable(
      computed(() => ({ id: this.hostelId(), r: this.refresh() })),
    ).pipe(
      switchMap(({ id }) => {
        if (!id) return of<BillingView>({ kind: 'none' });
        return this.api.billing(id).pipe(
          tap((b) => this.billingStore.accept(id, b)),
          map((billing): BillingView => ({ kind: 'ready', billing })),
          startWith<BillingView>({ kind: 'loading' }),
          catchError((err: ApiError) =>
            of<BillingView>(
              err?.status === 403
                ? { kind: 'forbidden' }
                : { kind: 'error', networkError: isNetworkError(err) },
            ),
          ),
        );
      }),
    ),
    { initialValue: { kind: 'loading' } as BillingView },
  );

  // A plan change answers with the whole summary, which stands in for the loaded one until the next load.
  protected readonly state = linkedSignal<BillingView>(() => this.loaded());

  protected readonly billing = computed(() => {
    const s = this.state();
    return s.kind === 'ready' ? s.billing : null;
  });

  protected readonly networkError = computed(() => {
    const s = this.state();
    return s.kind === 'error' && s.networkError;
  });

  // Reset whenever the hostel changes, so one hostel's checkout never shows on another's page.
  protected readonly pendingPlanId = linkedSignal<string, string | null>({
    source: this.hostelId,
    computation: () => null,
  });
  protected readonly checkoutError = linkedSignal<string, CheckoutError | null>(
    {
      source: this.hostelId,
      computation: () => null,
    },
  );
  protected readonly replacing = linkedSignal<string, BillingPlan | null>({
    source: this.hostelId,
    computation: () => null,
  });
  protected readonly pendingChange = linkedSignal<string, PlanChange | null>({
    source: this.hostelId,
    computation: () => null,
  });
  protected readonly planChangeError = linkedSignal<
    string,
    PlanChangeError | null
  >({
    source: this.hostelId,
    computation: () => null,
  });
  protected readonly downgrading = linkedSignal<string, BillingPlan | null>({
    source: this.hostelId,
    computation: () => null,
  });
  protected readonly cancelling = linkedSignal<string, boolean>({
    source: this.hostelId,
    computation: () => false,
  });

  /** One billing write at a time: a checkout or any plan change locks every other action. */
  protected readonly busy = computed(
    () => this.pendingPlanId() !== null || this.pendingChange() !== null,
  );

  protected readonly cardBusy = computed<CurrentPlanAction | null>(() => {
    const change = this.pendingChange();
    switch (change?.kind) {
      case 'undo':
        return change.planId === null ? 'undo' : null;
      case 'cancel':
      case 'resume':
        return change.kind;
      default:
        return null;
    }
  });

  protected readonly cardChangeError = computed(() => {
    const error = this.planChangeError();
    return error?.planId === null ? error : null;
  });

  protected readonly canCheckout = computed(() =>
    this.session.hasPermission('core:Invoice:create'),
  );
  protected readonly canChangePlan = computed(() =>
    this.session.hasPermission('core:Subscription:update'),
  );
  protected readonly canPay = computed(() =>
    this.session.hasPermission('core:Invoice:create_payment'),
  );
  protected readonly canEditHostel = computed(() =>
    this.session.hasPermission('host:Hostel:show'),
  );

  protected readonly canViewHistory = computed(() =>
    this.session.hasPermission('core:Invoice:index'),
  );

  protected readonly historyLink = computed(() =>
    billingHistoryPath(this.hostelId()),
  );

  protected readonly profileLink = computed(
    () => `/host/${this.hostelId()}/profile`,
  );

  protected readonly payLink = computed(() => {
    const invoice = this.billing()?.open_invoice;
    return invoice
      ? `/host/${this.hostelId()}/subscription/pay/${invoice.id}`
      : '';
  });

  /** No country means no prices: said once above the plans instead of on every card. */
  protected readonly subscription = computed(
    () => this.billing()?.subscription ?? null,
  );

  /** A renewal invoice already out, which a plan change leaves open. */
  protected readonly openRenewal = computed(() => {
    const invoice = this.billing()?.open_invoice;
    return invoice?.kind === 'renewal' ? invoice : null;
  });

  protected readonly countryMissing = computed(() => {
    const b = this.billing();
    return (
      !!b &&
      b.country_code === null &&
      b.plans.some((p) => p.action === 'unavailable')
    );
  });

  protected readonly planViews = computed<readonly PlanView[]>(() => {
    const b = this.billing();
    if (!b) return [];
    const pending = this.pendingPlanId();
    const change = this.pendingChange();
    const busy = this.busy();
    const canChange = this.canChangePlan();
    const blocked = !this.canCheckout() || busy;
    const hideReason = this.countryMissing();
    const error = this.checkoutError();
    const changeError = this.planChangeError();
    return b.plans.map((plan) => {
      const button = planButton(plan, b.subscription);
      return {
        plan,
        button,
        disabled:
          button.disabled ||
          (button.kind === 'checkout' && blocked) ||
          (button.kind === 'downgrade' && (busy || !canChange)),
        loading:
          pending === plan.id ||
          (change?.kind === 'schedule' && change.planId === plan.id),
        canUndo: button.kind === 'scheduled' && canChange,
        undoLoading: change?.kind === 'undo' && change.planId === plan.id,
        reason:
          plan.action === 'unavailable' && !hideReason && plan.reason
            ? plan.reason
            : null,
        error: error?.planId === plan.id ? error : null,
        changeError: changeError?.planId === plan.id ? changeError : null,
      };
    });
  });

  /** Unicode isolates around an interpolated amount, the plain-text form of `<bdi>`. */
  protected isolate(text: string): string {
    return `\u2068${text}\u2069`;
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  /** The one entry point for a plan card's button. */
  protected onPlanAction(view: PlanView): void {
    if (view.disabled || this.busy()) return;
    if (view.button.kind === 'downgrade') {
      this.downgrading.set(view.plan);
      return;
    }
    if (view.button.kind !== 'checkout') return;
    const open = this.billing()?.open_invoice;
    // Checkout may void the unpaid invoice, and only the server knows whether it will.
    if (open && !open.awaiting_verification) {
      this.replacing.set(view.plan);
      return;
    }
    this.checkout(view.plan);
  }

  protected confirmReplace(): void {
    const plan = this.replacing();
    this.replacing.set(null);
    if (plan) this.checkout(plan);
  }

  protected cancelReplace(): void {
    this.replacing.set(null);
  }

  protected confirmDowngrade(): void {
    const plan = this.downgrading();
    this.downgrading.set(null);
    if (!plan) return;
    this.runChange({ kind: 'schedule', planId: plan.id }, (id) =>
      this.api.scheduleDowngrade(id, plan.id),
    );
  }

  protected dismissDowngrade(): void {
    this.downgrading.set(null);
  }

  /** `planId` is the plan card the Undo was clicked on, or null for the current plan card. */
  protected undoSwitch(planId: string | null): void {
    this.runChange({ kind: 'undo', planId }, (id) =>
      this.api.unscheduleDowngrade(id),
    );
  }

  protected openCancel(): void {
    if (this.busy()) return;
    this.cancelling.set(true);
  }

  protected confirmCancel(): void {
    const open = this.cancelling();
    this.cancelling.set(false);
    if (!open) return;
    this.runChange({ kind: 'cancel' }, (id) => this.api.cancelSubscription(id));
  }

  protected dismissCancel(): void {
    this.cancelling.set(false);
  }

  protected resumePlan(): void {
    this.runChange({ kind: 'resume' }, (id) => this.api.resumeSubscription(id));
  }

  private runChange(
    change: PlanChange,
    request: (hostelId: string) => Observable<HostBilling>,
  ): void {
    const id = this.hostelId();
    if (!id || this.busy()) return;
    const epoch = this.loaded();
    this.pendingChange.set(change);
    this.checkoutError.set(null);
    this.planChangeError.set(null);
    // Only the hostel and load it was asked on take the answer; A to B and back to A is a new load.
    const current = (): boolean =>
      this.hostelId() === id && this.loaded() === epoch;
    // Identity, not null: after a hostel round trip a newer change may already be pending.
    const settle = (): void => {
      if (this.pendingChange() === change) this.pendingChange.set(null);
    };
    request(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (billing) => {
          settle();
          if (current()) {
            this.state.set({ kind: 'ready', billing });
            this.billingStore.accept(id, billing);
          }
        },
        error: (err: ApiError) => {
          settle();
          if (current()) this.showChangeError(change, err);
        },
      });
  }

  private showChangeError(change: PlanChange, err: ApiError): void {
    const status = err?.status;
    // Only actions the summary offered can be asked for, so a 422 or 404 means it is out of date.
    const stale = status === 422 || status === 404;
    this.planChangeError.set({
      planId:
        change.kind === 'schedule' || change.kind === 'undo'
          ? change.planId
          : null,
      message: stale ? (err?.serverMessages?.[0] ?? null) : null,
      messageKey:
        status === 403
          ? 'hostBilling.planChangeForbidden'
          : CHANGE_FAILED[change.kind],
    });
    if (stale) this.retry();
  }

  private checkout(plan: BillingPlan): void {
    const id = this.hostelId();
    if (!id || this.busy()) return;
    this.pendingPlanId.set(plan.id);
    this.checkoutError.set(null);
    this.planChangeError.set(null);
    this.api
      .checkout(id, plan.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoice) => {
          if (this.hostelId() !== id) return;
          this.pendingPlanId.set(null);
          this.openPayment(id, invoice);
        },
        error: (err: ApiError) => {
          if (this.hostelId() !== id) return;
          this.pendingPlanId.set(null);
          this.showCheckoutError(plan.id, err);
        },
      });
  }

  private openPayment(hostelId: string, invoice: BillingInvoice): void {
    // Prefixed here rather than by the bare-URL redirect, which would drop the handed-over invoice.
    const commands = localiseCommands(
      ['/host', hostelId, 'subscription', 'pay', invoice.id],
      this.locale.active(),
    ) as unknown[];
    void this.router.navigate(commands, { state: { invoice } });
  }

  private showCheckoutError(planId: string, err: ApiError): void {
    const server = err?.serverMessages?.[0] ?? null;
    const forbidden = err?.status === 403;
    this.checkoutError.set({
      planId,
      // The server's 403 text is a generic authorization notice, so ours always replaces it.
      message: forbidden ? null : server,
      messageKey: forbidden
        ? 'hostBilling.checkoutForbidden'
        : 'hostBilling.checkoutFailed',
      countryRequired: server === COUNTRY_REQUIRED,
    });
    // Both mean the page is out of date: a transfer is now under review, or the plan is gone.
    const transferPending =
      !!server && /bank transfer/i.test(server) && /verification/i.test(server);
    if (transferPending || err?.status === 404) this.retry();
  }
}
