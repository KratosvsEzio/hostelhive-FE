import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, finalize, map, of, switchMap } from 'rxjs';
import { Button, Skeleton } from '@hostelhive/ui';
import { Product } from '@hostelhive/data-access';
import { HostPropertyStore, ProductsApi, SubscriptionApi, SubscriptionStore } from '@services';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import {
  countPaidListingPurchases,
  effectivePrice,
  hasListingDiscount,
} from '@util/product-pricing';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';

interface PageState {
  loading: boolean;
  error: boolean;
  product: Product | null;
  allProducts: Product[];
  paidListingCount: number;
}

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
  selector: 'hh-subscription-checkout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, LocaleLink, DashboardLayout, Button, Skeleton, TranslocoPipe],
  templateUrl: './subscription-checkout.html',
})
export class SubscriptionCheckout {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productsApi = inject(ProductsApi);
  private readonly subApi = inject(SubscriptionApi);
  private readonly store = inject(HostPropertyStore);
  private readonly subStore = inject(SubscriptionStore);

  protected readonly paying = signal(false);
  protected readonly paid = signal(false);
  protected readonly payError = signal(false);

  /** Pre-select the product from the route URL synchronously. */
  protected readonly selectedIds = signal<ReadonlySet<number>>(
    new Set([+(this.route.snapshot.paramMap.get('productId') ?? 0)]),
  );

  protected readonly state = toSignal(
    this.route.paramMap.pipe(
      map((pm) => +(pm.get('productId') ?? 0)),
      switchMap((productId) =>
        combineLatest({
          products: this.productsApi.list(),
          payments: this.store.selected()
            ? this.subApi.paymentHistory(this.store.selected())
            : of([]),
        }).pipe(
          map(
            ({ products, payments }): PageState => ({
              loading: false,
              error: false,
              product: products.find((p) => p.id === productId) ?? null,
              allProducts: products,
              paidListingCount: countPaidListingPurchases(payments),
            }),
          ),
          catchError(() =>
            of<PageState>({
              loading: false,
              error: true,
              product: null,
              allProducts: [],
              paidListingCount: 0,
            }),
          ),
        ),
      ),
    ),
    {
      initialValue: {
        loading: true,
        error: false,
        product: null,
        allProducts: [],
        paidListingCount: 0,
      } as PageState,
    },
  );

  protected readonly selectedProductList = computed(() => {
    const ids = this.selectedIds();
    return this.state().allProducts.filter((p) => ids.has(p.id));
  });

  protected readonly totalPrice = computed(() => {
    const count = this.state().paidListingCount;
    return this.selectedProductList().reduce(
      (sum, p) => sum + effectivePrice(p, count),
      0,
    );
  });

  protected readonly backLink = computed(
    () => `/host/${this.store.selected()}/subscription`,
  );

  protected isSelected(productId: number): boolean {
    return this.selectedIds().has(productId);
  }

  protected toggleProduct(productId: number): void {
    const ids = new Set(this.selectedIds());
    if (ids.has(productId)) {
      ids.delete(productId);
    } else {
      ids.add(productId);
    }
    this.selectedIds.set(ids);
  }

  protected hasDiscount(product: Product): boolean {
    return hasListingDiscount(product, this.state().paidListingCount);
  }

  protected displayPrice(product: Product): number {
    return effectivePrice(product, this.state().paidListingCount);
  }

  protected periodLabel(product: Product): string {
    const d = product.duration;
    return d && d <= 20 ? `${d} days` : 'mo';
  }

  protected features(product: Product): string[] {
    return (
      PRODUCT_FEATURES[product.name] ??
      (product.description ? [product.description] : [])
    );
  }

  protected pay(): void {
    const hostelId = this.store.selected();
    const ids = [...this.selectedIds()];
    if (!ids.length || !hostelId || this.paying() || this.paid()) return;
    this.paying.set(true);
    this.payError.set(false);
    this.subApi
      .createOrder(hostelId, ids)
      .pipe(finalize(() => this.paying.set(false)))
      .subscribe({
        next: () => {
          this.paid.set(true);
          // The order just changed the subscription, so the cached contract is stale. Without this
          // the shell's gate keeps reading the pre-purchase (expired) contract and bounces the host
          // back to the subscription page from every other page until a full reload.
          this.subStore.clear();
          setTimeout(() => {
            void this.router.navigate([
              '/host',
              hostelId,
              'subscription',
              'current',
            ]);
          }, 1500);
        },
        error: () => this.payError.set(true),
      });
  }
}
