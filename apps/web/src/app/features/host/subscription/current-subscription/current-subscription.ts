import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  catchError,
  combineLatest,
  finalize,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import type { Observable } from 'rxjs';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusPill,
  Toast,
} from '@hostelhive/ui';
import type { StatusTone } from '@hostelhive/ui';
import {
  Product,
  SubscriptionContract as Contract,
  SubscriptionContractStatus as ContractStatus,
} from '@hostelhive/data-access';
import { HostPropertyStore, ProductsApi, SubscriptionApi, SubscriptionStore } from '@services';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: { contract: Contract | null; currentProduct: Product | undefined } | null;
}

const STATUS_META: Record<ContractStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  'pending-payment': { label: 'Pending payment', tone: 'warn' },
  active: { label: 'Active', tone: 'ok' },
  expired: { label: 'Expired', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

@Component({
  selector: 'hh-current-subscription',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    DashboardLayout,
    Badge,
    Button,
    Card,
    EmptyState,
    ErrorState,
    Skeleton,
    StatusPill,
    Toast,
  ],
  templateUrl: './current-subscription.html',
})
export class CurrentSubscription {
  private readonly api = inject(SubscriptionApi);
  private readonly productsApi = inject(ProductsApi);
  private readonly store = inject(HostPropertyStore);
  private readonly subStore = inject(SubscriptionStore);

  private readonly refresh = signal(0);
  protected readonly busy = signal(false);
  protected readonly notice = signal<{
    tone: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  protected readonly state = toSignal(
    combineLatest({
      hostelId: toObservable(this.store.selected),
      refresh: toObservable(this.refresh),
    }).pipe(
      switchMap(({ hostelId }) =>
        combineLatest({
          sub: hostelId
            ? this.api.currentSubscription(hostelId)
            : of({ contract: null as Contract | null, featuredUntil: null as string | null }),
          products: this.productsApi.list(),
        }).pipe(
          map(({ sub, products }): ViewState => ({
            loading: false,
            error: false,
            networkError: false,
            data: {
              contract: sub.contract,
              currentProduct: sub.contract
                ? products.find((p) => String(p.id) === sub.contract!.planId)
                : undefined,
            },
          })),
          startWith<ViewState>({ loading: true, error: false, networkError: false, data: null }),
          catchError((err) =>
            of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null }),
          ),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  protected statusMeta(status: ContractStatus) {
    return STATUS_META[status];
  }

  protected daysRemaining(contract: Contract): number | null {
    if (!contract.renewsAt) return null;
    const ms = new Date(contract.renewsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  }

  protected reload(): void {
    this.refresh.update((n) => n + 1);
  }

  protected renew(): void {
    this.run(this.api.renew(), {
      tone: 'info',
      text: 'Renewal checkout started. Awaiting payment...',
    });
  }

  protected simulateWebhook(): void {
    this.run(this.api.activate(), {
      tone: 'success',
      text: 'Payment confirmed — your plan is active.',
    });
  }

  protected cancel(): void {
    this.run(this.api.cancel(), {
      tone: 'info',
      text: 'Your plan has been cancelled.',
    });
  }

  private run(
    action$: Observable<unknown>,
    success: { tone: 'success' | 'error' | 'info'; text: string } | null,
  ): void {
    this.busy.set(true);
    this.notice.set(null);
    action$.pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        if (success) this.notice.set(success);
        this.subStore.clear();
        this.reload();
      },
      error: (err: Error) =>
        this.notice.set({ tone: 'error', text: err.message }),
    });
  }
}
