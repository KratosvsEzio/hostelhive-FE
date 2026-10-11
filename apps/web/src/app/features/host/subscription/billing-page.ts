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
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
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
  StatusPill,
} from '@hostelhive/ui';
import { BillingApi } from '@services';
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
import { CurrentPlanCard } from './current-plan-card';
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

interface PlanView {
  plan: BillingPlan;
  button: PlanButton;
  disabled: boolean;
  loading: boolean;
  /** The server's own explanation for an unavailable plan, or null when it is not shown. */
  reason: string | null;
  /** The refusal from this card's own checkout, shown under its button. */
  error: CheckoutError | null;
}

/** The checkout refusal that a hostel without a country gets, matched exactly as the server words it. */
const COUNTRY_REQUIRED = "Set the hostel's country first";

const SKELETON_PLANS = [0, 1, 2, 3] as const;

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
    StatusPill,
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

  protected readonly state = toSignal(
    toObservable(
      computed(() => ({ id: this.hostelId(), r: this.refresh() })),
    ).pipe(
      switchMap(({ id }) => {
        if (!id) return of<BillingView>({ kind: 'none' });
        return this.api.billing(id).pipe(
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

  protected readonly canCheckout = computed(() =>
    this.session.hasPermission('core:Invoice:create'),
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
    const blocked = !this.canCheckout() || pending !== null;
    const hideReason = this.countryMissing();
    const error = this.checkoutError();
    return b.plans.map((plan) => {
      const button = planButton(plan, b.subscription);
      return {
        plan,
        button,
        disabled: button.disabled || (button.kind === 'checkout' && blocked),
        loading: pending === plan.id,
        reason:
          plan.action === 'unavailable' && !hideReason && plan.reason
            ? plan.reason
            : null,
        error: error?.planId === plan.id ? error : null,
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
    if (view.disabled || view.button.kind !== 'checkout') return;
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

  private checkout(plan: BillingPlan): void {
    const id = this.hostelId();
    if (!id || this.pendingPlanId() !== null) return;
    this.pendingPlanId.set(plan.id);
    this.checkoutError.set(null);
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
