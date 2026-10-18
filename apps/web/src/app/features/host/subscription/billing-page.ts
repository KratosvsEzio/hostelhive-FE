import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  viewChild,
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
  PlanSubscribe,
  billingHistoryPath,
  isSafepayBilled,
  isSafepayTrial,
  planButton,
} from '@app/shared/billing/billing-labels';
import { BillingMoneyPipe } from '@app/shared/billing/billing-money.pipe';
import { PlanCard } from '@app/shared/billing/plan-card';
import { CurrentPlanAction, CurrentPlanCard } from './current-plan-card';
import { PaymentDue } from './payment-due';
import { SafepayCheckout } from './safepay-checkout';
import { SavedCard, SavedCardAction } from './saved-card';

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
  | { kind: 'resume' }
  | { kind: 'saveCard' }
  | { kind: 'removeCard' }
  | { kind: 'autoRenew'; enabled: boolean };

/**
 * A refused plan change, shown where it was asked for: that plan card, the current plan card
 * when `planId` is null, or the saved-card block when `onCard` is set.
 */
interface PlanChangeError {
  planId: string | null;
  onCard: boolean;
  message: string | null;
  messageKey: string;
}

/** Plan states that renew, and so the only ones the auto-renew switch is offered on. */
const LIVE_STATUSES: readonly string[] = ['active', 'past-due'];

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
  /** Subscribing through Safepay instead, offered only beside Choose plan. */
  subscribe: PlanSubscribe | null;
  subscribeDisabled: boolean;
  subscribeLoading: boolean;
}

/** The checkout refusal that a hostel without a country gets, matched exactly as the server words it. */
const COUNTRY_REQUIRED = "Set the hostel's country first";

const SKELETON_PLANS = [0, 1, 2, 3] as const;

const CHANGE_FAILED: Record<PlanChange['kind'], string> = {
  schedule: 'hostBilling.scheduleFailed',
  undo: 'hostBilling.undoFailed',
  cancel: 'hostBilling.cancelFailed',
  resume: 'hostBilling.resumeFailed',
  saveCard: 'hostBilling.saveCardFailed',
  removeCard: 'hostBilling.removeCardFailed',
  autoRenew: 'hostBilling.autoRenewFailed',
};

/**
 * A hostel's HostelHive billing: the current plan, any unpaid invoice, the card saved for
 * automatic renewal, and one card per plan with the single action the server allows. A plan the
 * hostel can buy also offers subscribing through Safepay, with a free trial when the server has one.
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
    SavedCard,
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
  private readonly safepay = inject(SafepayCheckout);
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
  /** The plan a Safepay subscription is starting for, until the browser leaves for Safepay. */
  protected readonly subscribingPlanId = linkedSignal<string, string | null>({
    source: this.hostelId,
    computation: () => null,
  });
  /** The plan waiting on the host to confirm that subscribing leaves the unpaid invoice open. */
  protected readonly confirmingSubscribe = linkedSignal<
    string,
    BillingPlan | null
  >({
    source: this.hostelId,
    computation: () => null,
  });

  /** One billing write at a time: a checkout, subscription start, plan change or card action locks every other one. */
  protected readonly busy = computed(
    () =>
      this.pendingPlanId() !== null ||
      this.subscribingPlanId() !== null ||
      this.pendingChange() !== null,
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
    return error && !error.onCard && error.planId === null ? error : null;
  });

  protected readonly removingCard = linkedSignal<string, boolean>({
    source: this.hostelId,
    computation: () => false,
  });

  protected readonly savedCardBusy = computed<SavedCardAction | null>(() => {
    switch (this.pendingChange()?.kind) {
      case 'saveCard':
        return 'save';
      case 'removeCard':
        return 'remove';
      case 'autoRenew':
        return 'autoRenew';
      default:
        return null;
    }
  });

  protected readonly savedCardError = computed(() => {
    const error = this.planChangeError();
    return error?.onCard ? error : null;
  });

  /**
   * What the auto-renew switch shows. `hh-toggle` flips itself on click, so this mirrors each
   * flip, and a refused change writes the server's value back; every new summary resets it.
   */
  protected readonly autoRenewSwitch = linkedSignal<HostBilling | null, boolean>(
    {
      source: this.billing,
      computation: (b) => b?.auto_renew ?? false,
    },
  );

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

  /** Safepay keeps its own card for a plan it bills, so the block is for invoice-billed plans. */
  protected readonly showSavedCard = computed(() => {
    const sub = this.subscription();
    return !!sub && !isSafepayBilled(sub);
  });

  protected readonly planLive = computed(() =>
    LIVE_STATUSES.includes(this.subscription()?.status.slug ?? ''),
  );

  protected readonly safepayTrial = computed(() =>
    isSafepayTrial(this.subscription()),
  );

  /** Why no plan can be changed while Safepay bills this one: the server's words, said once above the plans. */
  protected readonly safepayReason = computed(() => {
    if (!isSafepayBilled(this.subscription())) return null;
    return this.billing()?.plans.find((p) => p.reason)?.reason ?? null;
  });

  /** Safepay is not started while a bank transfer for the unpaid invoice is being checked. */
  protected readonly transferUnderReview = computed(
    () => !!this.billing()?.open_invoice?.awaiting_verification,
  );

  protected readonly cancellingAtPeriodEnd = computed(
    () => !!this.subscription()?.cancel_at_period_end,
  );

  /** The renewal date the saved card is charged on, while it renews the plan. */
  protected readonly autoChargeOn = computed(() => {
    const sub = this.subscription();
    return this.billing()?.auto_renew &&
      sub?.status.slug === 'active' &&
      !isSafepayBilled(sub)
      ? sub.current_period_end
      : null;
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
    const hideReason = this.countryMissing() || this.safepayReason() !== null;
    const error = this.checkoutError();
    const changeError = this.planChangeError();
    const subscribing = this.subscribingPlanId();
    const subscribeBlocked = blocked || this.transferUnderReview();
    return b.plans.map((plan) => {
      const button = planButton(plan, b.subscription);
      const subscribe = button.subscribe ?? null;
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
        subscribe,
        subscribeDisabled: !!subscribe && subscribeBlocked,
        subscribeLoading: subscribing === plan.id,
      };
    });
  });

  private readonly savedCardBlock = viewChild(SavedCard, { read: ElementRef });

  /** A link to `#saved-card` is waiting for the block to render so it can be scrolled to. */
  private readonly savedCardScrollPending = signal(false);

  constructor() {
    // A page restored from the back-forward cache still shows the spinner it left for Safepay with.
    this.safepay.restored$.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.pendingChange()?.kind === 'saveCard') {
        this.pendingChange.set(null);
      }
      this.subscribingPlanId.set(null);
    });

    // The router does no anchor scrolling (see core/scroll-reset), so a link to the block, such
    // as the banner's Update card, is scrolled to here, once per navigation, when it renders.
    this.route.fragment.pipe(takeUntilDestroyed()).subscribe((fragment) => {
      this.savedCardScrollPending.set(fragment === 'saved-card');
    });
    effect(() => {
      if (!this.savedCardScrollPending()) return;
      const block = this.savedCardBlock()?.nativeElement as
        | HTMLElement
        | undefined;
      if (!block) return;
      this.savedCardScrollPending.set(false);
      block.scrollIntoView?.({ block: 'start' });
    });
  }

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

  /** A plan card's Safepay subscribe button. An unpaid invoice stays open, so the host confirms that first. */
  protected onSubscribe(view: PlanView): void {
    if (!view.subscribe || view.subscribeDisabled || this.busy()) return;
    if (this.billing()?.open_invoice) {
      this.confirmingSubscribe.set(view.plan);
      return;
    }
    this.subscribe(view.plan);
  }

  protected confirmSubscribe(): void {
    const plan = this.confirmingSubscribe();
    this.confirmingSubscribe.set(null);
    if (plan) this.subscribe(plan);
  }

  protected dismissSubscribe(): void {
    this.confirmingSubscribe.set(null);
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

  /** Leaves for Safepay to save or replace the card; the page is unloading once it answers. */
  protected saveCard(): void {
    const id = this.hostelId();
    if (!id || this.busy()) return;
    const change: PlanChange = { kind: 'saveCard' };
    const epoch = this.loaded();
    this.pendingChange.set(change);
    this.checkoutError.set(null);
    this.planChangeError.set(null);
    this.safepay
      .startCardSave(id, this.billing()?.saved_card ?? null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // The browser is leaving for Safepay, so the button keeps its spinner until it does.
        error: (err: ApiError) => {
          if (this.pendingChange() === change) this.pendingChange.set(null);
          if (this.hostelId() === id && this.loaded() === epoch) {
            this.showChangeError(change, err);
          }
        },
      });
  }

  protected openRemoveCard(): void {
    if (this.busy()) return;
    this.removingCard.set(true);
  }

  protected confirmRemoveCard(): void {
    const open = this.removingCard();
    this.removingCard.set(false);
    if (!open) return;
    this.runChange({ kind: 'removeCard' }, (id) => this.api.removeCard(id));
  }

  protected dismissRemoveCard(): void {
    this.removingCard.set(false);
  }

  protected setAutoRenew(enabled: boolean): void {
    this.autoRenewSwitch.set(enabled);
    this.runChange({ kind: 'autoRenew', enabled }, (id) =>
      this.api.setAutoRenew(id, enabled),
    );
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
          // The switch flipped itself on click; put it back to what the server last said.
          if (change.kind === 'autoRenew') {
            this.autoRenewSwitch.set(this.billing()?.auto_renew ?? false);
          }
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
      onCard:
        change.kind === 'saveCard' ||
        change.kind === 'removeCard' ||
        change.kind === 'autoRenew',
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

  /** Leaves for Safepay to subscribe to `plan`; the page is unloading once it answers. */
  private subscribe(plan: BillingPlan): void {
    const id = this.hostelId();
    if (!id || this.busy()) return;
    this.subscribingPlanId.set(plan.id);
    this.checkoutError.set(null);
    this.planChangeError.set(null);
    this.safepay
      .startSubscribe(id, plan.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // The browser is leaving for Safepay, so the button keeps its spinner until it does.
        error: (err: ApiError) => {
          if (this.hostelId() !== id) return;
          this.subscribingPlanId.set(null);
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
