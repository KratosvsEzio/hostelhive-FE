import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
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
import { format, isValid, parse } from 'date-fns';
import {
  Button,
  Card,
  CellDef,
  ColumnDef,
  DataTable,
  EmptyState,
  ErrorState,
  ExpandConfig,
  Skeleton,
  StatusPill,
  Toast,
} from '@hostelhive/ui';
import type { StatusTone } from '@hostelhive/ui';
import {
  PaymentProduct,
  Product,
  SubscriptionContract as Contract,
  SubscriptionContractStatus as ContractStatus,
  SubscriptionPayment as Payment,
} from '@hostelhive/data-access';
import { HostPropertyStore, ProductsApi, SubscriptionApi, SubscriptionStore } from '@services';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';
import {
  countPaidListingPurchases,
  DISCOUNT_PURCHASE_LIMIT,
  effectivePrice,
  hasListingDiscount,
} from '@util/product-pricing';

interface FeaturedStatus {
  active: boolean;
  expiresAt: string;
}

interface BillingData {
  contract: Contract | null;
  currentProduct: Product | undefined;
  featured: FeaturedStatus | null;
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

const PAYMENT_LABEL: Record<Payment['status'], string> = {
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  pending: 'Pending',
};

function fmtDate(s: string): string {
  if (!s) return '—';
  let d = new Date(s);
  if (!isValid(d)) d = parse(s, 'yyyy-MM-dd', new Date());
  return isValid(d) ? format(d, 'd MMM y') : '—';
}

const STATUS_META: Record<ContractStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  'pending-payment': { label: 'Pending payment', tone: 'warn' },
  active: { label: 'Active', tone: 'ok' },
  expired: { label: 'Expired', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
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
    DashboardLayout,
    Button,
    Card,
    DataTable,
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
  private readonly subStore = inject(SubscriptionStore);
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
          sub: hostelId
            ? this.api.currentSubscription(hostelId)
            : of({ contract: null as Contract | null, featuredUntil: null as string | null }),
          products: this.productsApi.list(),
          payments: hostelId ? this.api.paymentHistory(hostelId) : of<Payment[]>([]),
        }).pipe(
          map(({ sub, products, payments }): ViewState => {
            const { contract, featuredUntil } = sub;
            let featured: FeaturedStatus | null = null;
            if (featuredUntil) {
              featured = {
                active: new Date(featuredUntil).getTime() > Date.now(),
                expiresAt: featuredUntil,
              };
            }
            return {
              loading: false,
              error: false,
              networkError: false,
              data: {
                contract,
                currentProduct: contract
                  ? products.find((p) => String(p.id) === contract.planId)
                  : undefined,
                featured,
                products,
                payments,
              },
            };
          }),
          startWith<ViewState>({ loading: true, error: false, networkError: false, data: null }),
          catchError((err) =>
            of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null }),
          ),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  protected readonly paidListingCount = computed(() =>
    countPaidListingPurchases(this.state()?.data?.payments ?? []),
  );

  protected readonly discountRemaining = computed(() =>
    Math.max(0, DISCOUNT_PURCHASE_LIMIT - this.paidListingCount()),
  );

  // ── Presentation helpers ─────────────────────────────────────────────────
  protected hasDiscount(product: Product): boolean {
    return hasListingDiscount(product, this.paidListingCount());
  }

  protected displayPrice(product: Product): number {
    return effectivePrice(product, this.paidListingCount());
  }

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

  protected readonly paymentRowId = (r: unknown) => (r as Payment).id;
  protected readonly paymentCols: ColumnDef[] = [
    { key: 'date',        label: 'Date',        cell: (r) => ({ kind: 'text', value: fmtDate((r as Payment).date), class: 'whitespace-nowrap text-ink-600' }) satisfies CellDef },
    { key: 'description', label: 'Description', cell: (r) => ({ kind: 'composite', primary: (r as Payment).description, secondary: (r as Payment).products.length > 1 ? `${(r as Payment).products.length} products` : undefined }) satisfies CellDef },
    { key: 'method',      label: 'Method',      cell: (r) => ({ kind: 'text', value: (r as Payment).method, class: 'text-ink-600' }) satisfies CellDef },
    { key: 'status',      label: 'Status',      cell: (r) => ({ kind: 'pill', text: PAYMENT_LABEL[(r as Payment).status], tone: PAYMENT_TONE[(r as Payment).status] }) satisfies CellDef },
    { key: 'amount', align: 'right', label: 'Amount',  cell: (r) => ({ kind: 'currency', amount: (r as Payment).amount, class: 'font-medium text-ink-900' }) satisfies CellDef },
  ];

  protected readonly paymentExpand: ExpandConfig = {
    childRows: (r) => (r as Payment).products.length > 1 ? (r as Payment).products : [],
    childId: (s) => (s as PaymentProduct).id,
    childName: (s) => (s as PaymentProduct).name,
    nameLabel: 'Product',
    nameColSpan: 4,
    columns: [
      {
        label: 'Price', align: 'right',
        cell: (s) => ({ kind: 'currency', amount: (s as PaymentProduct).price, class: 'font-medium text-ink-900' }) satisfies CellDef,
      },
    ],
  };

  protected statusMeta(status: ContractStatus) {
    return STATUS_META[status];
  }

  protected daysRemaining(contract: Contract): number | null {
    if (!contract.renewsAt) return null;
    const ms = new Date(contract.renewsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  }

  protected featuredDaysRemaining(feat: FeaturedStatus): number {
    const ms = new Date(feat.expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
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
