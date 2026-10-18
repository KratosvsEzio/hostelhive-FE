import { Location } from '@angular/common';
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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  Observable,
  catchError,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import type {
  AdminCurrency,
  AdminHostelBilling as AdminHostelBillingData,
  AdminPlan,
} from '@hostelhive/data-access';
import {
  Button,
  ConfirmModal,
  Dropdown,
  DropdownOption,
  ErrorState,
  HhLink,
  Skeleton,
} from '@hostelhive/ui';
import { AdminApi, AdminBillingApi } from '@services';
import { quiet } from '@services/quiet-request';
import { LocaleLink } from '@core/i18n/locale-link';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { AdminUtcDate } from '../shared/admin-utc-date';
import { BillingMoneyPipe } from '@app/shared/billing/billing-money.pipe';
import { CurrentPlanCard } from '@app/features/host/subscription/current-plan-card';
import {
  AdminBillingError,
  adminBillingError,
} from '../shared/admin-billing-errors';
import {
  ADMIN_BILLING_PATHS,
  AdminHostelState,
  isolate,
} from '../shared/admin-billing-labels';
import { AdminBillingTabs } from '../shared/admin-billing-tabs';
import { ADMIN_BILLING_DATE_TIME } from '../shared/admin-billing-cell-format';
import { AdminBillingEvents } from './billing-events';
import {
  AdminGrantDialog,
  GrantError,
  GrantPlan,
  GrantRequest,
} from './grant-dialog';

type HostelBillingView =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: AdminHostelBillingData }
  | { kind: 'error'; error: AdminBillingError };

/** The currency control's value; `auto` clears the override. */
type CurrencyChoice = AdminCurrency | 'auto';

const CURRENCIES: readonly AdminCurrency[] = ['PKR', 'USD'];

/** A write in flight. Compared by identity, so a write for an earlier hostel never settles a newer one. */
interface PendingWrite {
  kind: 'grant' | 'currency';
}

interface HostelName {
  id: string;
  name: string;
}

/**
 * One hostel's HostelHive billing as an admin sees it: the subscription read-only, the open
 * invoice, the billing currency with its override, and the history newest first. The admin
 * can grant a plan free of charge and override the billing currency.
 *
 * The billing envelope carries no hostel name, so it comes from the row the admin clicked
 * (router state), else from the all-listings search by id, else the page says "Hostel billing".
 * Every write answers with the whole envelope, which replaces the page's data.
 */
@Component({
  selector: 'hh-admin-hostel-billing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    AdminBillingTabs,
    AdminBillingEvents,
    AdminGrantDialog,
    CurrentPlanCard,
    Button,
    ConfirmModal,
    Dropdown,
    ErrorState,
    HhLink,
    Skeleton,
    RouterLink,
    LocaleLink,
    TranslocoPipe,
    BillingMoneyPipe,
    AdminUtcDate,
  ],
  templateUrl: './admin-hostel-billing.html',
})
export class AdminHostelBilling {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly api = inject(AdminBillingApi);
  private readonly adminApi = inject(AdminApi);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly queuePath = ADMIN_BILLING_PATHS.verification;
  protected readonly dateTime = ADMIN_BILLING_DATE_TIME;

  protected readonly hostelId = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('hostelId') ?? ''),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  private readonly refresh = signal(0);

  // A new object on every load, so a write's answer is applied only to the load it started on.
  private readonly loaded = toSignal(
    toObservable(
      computed(() => ({ id: this.hostelId(), r: this.refresh() })),
    ).pipe(
      switchMap(({ id }) => {
        if (!id) return of<HostelBillingView>({ kind: 'none' });
        return this.api.hostelBilling(id).pipe(
          map((data): HostelBillingView => ({ kind: 'ready', data })),
          startWith<HostelBillingView>({ kind: 'loading' }),
          catchError((err: unknown) =>
            of<HostelBillingView>({
              kind: 'error',
              error: adminBillingError(err),
            }),
          ),
        );
      }),
    ),
    { initialValue: { kind: 'loading' } as HostelBillingView },
  );

  // A write answers with the whole envelope, which stands in for the loaded one until the next load.
  protected readonly state = linkedSignal<HostelBillingView>(() =>
    this.loaded(),
  );

  protected readonly data = computed(() => {
    const s = this.state();
    return s.kind === 'ready' ? s.data : null;
  });

  protected readonly loadError = computed(() => {
    const s = this.state();
    return s.kind === 'error' ? s.error : null;
  });

  private readonly plansRefresh = signal(0);

  // Every plan, inactive ones included, so history can name a plan that is no longer sold.
  private readonly adminPlans = toSignal(
    toObservable(this.plansRefresh).pipe(
      switchMap(() =>
        this.api.plans().pipe(catchError(() => of<AdminPlan[] | null>(null))),
      ),
    ),
    { initialValue: null },
  );

  private readonly nameLookup = toSignal(
    toObservable(this.hostelId).pipe(switchMap((id) => this.lookUpName(id))),
    { initialValue: null },
  );

  protected readonly hostelName = computed(() => {
    const found = this.nameLookup();
    return found && found.id === this.hostelId() ? found.name : null;
  });

  private readonly planNames = computed(() => {
    const names = new Map<string, string>();
    const data = this.data();
    for (const p of data?.billing.plans ?? []) names.set(p.code, p.name);
    const sub = data?.billing.subscription;
    if (sub) names.set(sub.plan.code, sub.plan.name);
    for (const p of this.adminPlans() ?? []) names.set(p.code, p.name);
    return names;
  });

  protected readonly planName = computed(() => {
    const names = this.planNames();
    return (code: string): string => names.get(code) ?? code;
  });

  /** Active plans in position order; the billing payload's active list until the admin list arrives. */
  protected readonly grantPlans = computed<readonly GrantPlan[]>(() => {
    const all = this.adminPlans();
    if (all) {
      return all
        .filter((p) => p.active)
        .sort((a, b) => a.position - b.position);
    }
    return this.data()?.billing.plans ?? [];
  });

  /** The invoice whose bank transfer is under review, which blocks a grant until it is settled. */
  protected readonly blockingInvoice = computed(() => {
    const invoice = this.data()?.billing.open_invoice;
    return invoice?.awaiting_verification ? invoice : null;
  });

  // Reset whenever the hostel changes, so one hostel's dialog or message never shows on another's page.
  protected readonly pending = linkedSignal<string, PendingWrite | null>({
    source: this.hostelId,
    computation: () => null,
  });
  protected readonly grantOpen = linkedSignal<string, boolean>({
    source: this.hostelId,
    computation: () => false,
  });
  protected readonly grantError = linkedSignal<string, GrantError | null>({
    source: this.hostelId,
    computation: () => null,
  });
  protected readonly currencyConfirming = linkedSignal<string, boolean>({
    source: this.hostelId,
    computation: () => false,
  });
  protected readonly currencyError = linkedSignal<
    string,
    AdminBillingError | null
  >({
    source: this.hostelId,
    computation: () => null,
  });
  protected readonly notice = linkedSignal<string, string | null>({
    source: this.hostelId,
    computation: () => null,
  });

  /** One write at a time across the page. */
  protected readonly busy = computed(() => this.pending() !== null);

  protected readonly grantBusy = computed(
    () => this.pending()?.kind === 'grant',
  );
  protected readonly currencyBusy = computed(
    () => this.pending()?.kind === 'currency',
  );

  protected readonly canGrant = computed(
    () =>
      !!this.data() &&
      !this.busy() &&
      !this.blockingInvoice() &&
      this.grantPlans().length > 0,
  );

  private readonly savedCurrency = computed<CurrencyChoice>(() =>
    toChoice(this.data()?.billing_currency_override ?? null),
  );

  // Follows the saved value whenever a load or a write replaces it.
  protected readonly currencyChoice = linkedSignal<CurrencyChoice>(() =>
    this.savedCurrency(),
  );

  protected readonly currencyChanged = computed(
    () => this.currencyChoice() !== this.savedCurrency(),
  );

  private readonly autoLabel = toSignal(
    this.transloco
      .selectTranslate('adminBilling.currency.optionAuto')
      .pipe(map(String)),
    { initialValue: '' },
  );

  protected readonly currencyOptions = computed<DropdownOption[]>(() => [
    { value: 'auto', label: this.autoLabel() },
    ...CURRENCIES.map((c) => ({ value: c, label: c })),
  ]);

  /** The chosen currency when the current plan has no price in it; null when unknown or priced. */
  protected readonly currencyMissingPrice = computed(() => {
    const choice = this.currencyChoice();
    const sub = this.data()?.billing.subscription;
    if (choice === 'auto' || !sub) return null;
    const plan = this.adminPlans()?.find((p) => p.code === sub.plan.code);
    if (!plan || plan.prices[choice]) return null;
    return { plan: sub.plan.name, currency: choice };
  });

  /** Unicode isolates around an interpolated amount, the plain-text form of `<bdi>`. */
  protected readonly isolate = isolate;

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  protected openGrant(): void {
    if (!this.canGrant()) return;
    this.grantError.set(null);
    this.grantOpen.set(true);
  }

  protected closeGrant(): void {
    if (this.grantBusy()) return;
    this.grantOpen.set(false);
    this.grantError.set(null);
  }

  protected grant(request: GrantRequest): void {
    if (this.blockingInvoice()) return;
    this.grantError.set(null);
    this.run(
      { kind: 'grant' },
      (id) => this.api.grant(id, request.planId, request.months),
      () => {
        this.grantOpen.set(false);
        this.notice.set('adminBilling.grant.granted');
      },
      (error) => {
        // A 404 here is the plan: deactivated since the list was read.
        if (error.kind === 'notFound') {
          this.grantError.set({
            message: null,
            key: 'adminBilling.grant.planGone',
          });
          this.plansRefresh.update((n) => n + 1);
          return;
        }
        this.grantError.set({ message: error.message, key: error.key });
      },
    );
  }

  protected pickCurrency(value: string | string[] | null): void {
    const choice = (['auto', ...CURRENCIES] as const).find((c) => c === value);
    if (choice) this.currencyChoice.set(choice);
  }

  protected askCurrency(): void {
    if (this.busy() || !this.currencyChanged()) return;
    this.currencyError.set(null);
    this.currencyConfirming.set(true);
  }

  protected dismissCurrency(): void {
    this.currencyConfirming.set(false);
  }

  protected saveCurrency(): void {
    this.currencyConfirming.set(false);
    if (!this.currencyChanged()) return;
    const choice = this.currencyChoice();
    const currency = choice === 'auto' ? '' : choice;
    this.currencyError.set(null);
    this.run(
      { kind: 'currency' },
      (id) => this.api.setBillingCurrency(id, currency),
      () => this.notice.set('adminBilling.currency.saved'),
      (error) => this.currencyError.set(error),
    );
  }

  private run(
    write: PendingWrite,
    request: (hostelId: string) => Observable<AdminHostelBillingData>,
    done: () => void,
    failed: (error: AdminBillingError) => void,
  ): void {
    const id = this.hostelId();
    if (!id || this.busy()) return;
    const epoch = this.loaded();
    this.pending.set(write);
    this.notice.set(null);
    // Only the hostel and load it was asked on take the answer; A to B and back to A is a new load.
    const current = (): boolean =>
      this.hostelId() === id && this.loaded() === epoch;
    const settle = (): void => {
      if (this.pending() === write) this.pending.set(null);
    };
    request(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          settle();
          if (!current()) return;
          this.state.set({ kind: 'ready', data });
          done();
        },
        error: (err: unknown) => {
          settle();
          if (current()) failed(adminBillingError(err));
        },
      });
  }

  private lookUpName(id: string): Observable<HostelName | null> {
    if (!id) return of(null);
    const handed = this.handedOverName(id);
    if (handed) return of({ id, name: handed });
    // Quiet: a failed lookup only leaves the fallback title, which is not worth a toast.
    return this.adminApi.listings('all', 1, { id }, undefined, null, quiet()).pipe(
      map((page): HostelName | null => {
        const name = page.items
          .find((item) => String(item.id) === id)
          ?.name?.trim();
        // The listings mapper stands a dash in for a hostel with no name.
        return name && name !== '—' ? { id, name } : null;
      }),
      catchError(() => of(null)),
      startWith<HostelName | null>(null),
    );
  }

  /** The name the clicked row handed over, if it is this hostel's. */
  private handedOverName(id: string): string | null {
    const state = (this.router.currentNavigation()?.extras.state ??
      this.location.getState()) as Partial<AdminHostelState> | null;
    const hostel = state?.hostel;
    const name = hostel?.id === id ? hostel.name?.trim() : '';
    return name || null;
  }
}

function toChoice(override: string | null): CurrencyChoice {
  return CURRENCIES.find((c) => c === override) ?? 'auto';
}
