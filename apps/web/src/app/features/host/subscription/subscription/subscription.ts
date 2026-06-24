import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
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
import {
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
  SubscriptionPayment as Payment,
} from '@hostelhive/data-access';
import { HostPropertyStore, ProductsApi, SubscriptionApi } from '@services';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';

interface BillingData {
  contract: Contract | null;
  products: Product[];
  payments: Payment[];
}

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: BillingData | null;
}

const PAYMENT_TONE: Record<Payment['status'], StatusTone> = {
  paid: 'ok',
  failed: 'danger',
  refunded: 'neutral',
  pending: 'warn',
};

const PRODUCT_FEATURES: Record<string, string[]> = {
  Listing: [
    'Create and publish your hostel listing',
    'Room & occupancy management',
    'Tenant tracking & records',
    'Billing & invoice generation',
    'Full analytics dashboard',
    'Standard support',
  ],
  'Featured Boosted': [
    'Pinned to top of search results',
    '2x more listing visibility',
    'Active for 15 days from purchase',
    'Stackable with any active subscription',
  ],
  'Lead Radar': [
    'Real-time alerts for tenants searching within 5 km',
    'Tenant phone number provided with each lead',
    'Filter leads by gender preference & budget',
    'Instant notification when a match is found',
    'Works alongside any active subscription',
  ],
};

@Component({
  selector: 'hh-subscription',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    DashboardLayout,
    Button,
    Card,
    EmptyState,
    ErrorState,
    Skeleton,
    StatusPill,
    Toast,
  ],
  templateUrl: './subscription.html',
})
export class Subscription {
  private readonly api = inject(SubscriptionApi);
  private readonly productsApi = inject(ProductsApi);
  private readonly store = inject(HostPropertyStore);
  private readonly router = inject(Router);

  protected readonly skeletons = [1, 2, 3, 4];

  private readonly refresh = signal(0);
  protected readonly busy = signal(false);
  protected readonly previewOpen = signal(false);
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
          contract: hostelId
            ? this.api.currentSubscription(hostelId)
            : of<Contract | null>(null),
          products: this.productsApi.list(),
          payments: this.api.paymentHistory(),
        }).pipe(
          map((data): ViewState => ({ loading: false, error: false, networkError: false, data })),
          startWith<ViewState>({ loading: true, error: false, networkError: false, data: null }),
          catchError((err) =>
            of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null }),
          ),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  /** True once data is loaded and the host has an active contract. */
  protected readonly hasContract = computed(() => {
    const s = this.state();
    return !s.loading && !s.error && !!s.data?.contract;
  });

  // ── Presentation helpers ─────────────────────────────────────────────────
  protected isAddOn(product: Product): boolean {
    return product.product_type === 'add_on';
  }

  protected periodLabel(product: Product): string {
    const d = product.duration;
    return d && d <= 20 ? `${d} days` : 'mo';
  }

  protected ctaLabel(product: Product): string {
    if (product.name === 'Featured Boosted') return 'Add boost';
    if (product.product_type === 'add_on') return 'Get leads';
    return 'Get started';
  }

  protected displayName(product: Product): string {
    return product.name;
  }

  protected productFeatures(product: Product): string[] {
    return PRODUCT_FEATURES[product.name] ?? (product.description ? [product.description] : []);
  }

  protected isCurrent(product: Product, contract: Contract | null): boolean {
    if (!contract) return false;
    return (
      String(product.id) === contract.planId &&
      (contract.status === 'active' || contract.status === 'pending-payment')
    );
  }

  protected paymentTone(status: Payment['status']): StatusTone {
    return PAYMENT_TONE[status];
  }

  protected paymentLabel(status: Payment['status']): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  protected checkoutProduct(product: Product): void {
    void this.router.navigate([
      '/host', this.store.selected(), 'subscription', 'checkout', product.id,
    ]);
  }

  protected reload(): void {
    this.refresh.update((n) => n + 1);
  }

  private run(
    action$: ReturnType<SubscriptionApi['checkout']>,
    success: { tone: 'success' | 'error' | 'info'; text: string } | null,
  ): void {
    this.busy.set(true);
    this.notice.set(null);
    action$.pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        if (success) this.notice.set(success);
        this.reload();
      },
      error: (err: Error) =>
        this.notice.set({ tone: 'error', text: err.message }),
    });
  }
}
