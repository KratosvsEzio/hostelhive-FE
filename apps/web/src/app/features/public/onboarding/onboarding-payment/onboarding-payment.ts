import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Product } from '@hostelhive/data-access';
import { ProductsApi } from '@services';
import { Badge, BadgeVariant, Button } from '@hostelhive/ui';
import { SessionStore } from '@app/core/auth/session-store';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';

const DRAFT_KEY = 'hh:onboarding:draft';

type GenderType = 'boys' | 'girls' | 'co-living';

@Component({
  selector: 'hh-onboarding-payment',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, LocaleLink, Badge, Button, TranslocoPipe],
  templateUrl: './onboarding-payment.html',
})
export class OnboardingPayment {
  private readonly productsApi = inject(ProductsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sessionStore = inject(SessionStore);

  /** True once the backend has granted the host role (set after first listing creation). */
  protected readonly isHost = computed(() =>
    this.sessionStore.hasRole('host', 'manager', 'warden'),
  );

  // Draft values read from localStorage
  protected readonly draftId = signal<number | null>(null);
  protected readonly hostelName = signal('');
  protected readonly city = signal('');
  protected readonly accommodationType = signal<GenderType>('boys');
  protected readonly roomCount = signal(0);
  protected readonly selectedProductIds = signal<number[]>([]);

  // Products from API
  protected readonly allProducts = signal<Product[]>([]);
  protected readonly productsLoading = signal(true);
  protected readonly productsError = signal(false);

  protected readonly selectedProducts = computed(() =>
    this.allProducts().filter((p) => this.selectedProductIds().includes(p.id)),
  );
  protected readonly total = computed(() =>
    this.selectedProducts().reduce((sum, p) => sum + +p.price, 0),
  );

  // Payment state
  protected readonly paying = signal(false);
  protected readonly paid = signal(false);
  protected readonly payError = signal(false);

  constructor() {
    this.readDraft();
    afterNextRender(() => this.loadProducts());
  }

  private readDraft(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, unknown>;
      if (typeof d['draftId'] === 'number') this.draftId.set(d['draftId']);
      if (typeof d['name'] === 'string') this.hostelName.set(d['name']);
      if (typeof d['city'] === 'string') this.city.set(d['city']);
      if (d['gender'] === 'boys' || d['gender'] === 'girls' || d['gender'] === 'co-living')
        this.accommodationType.set(d['gender']);
      if (Array.isArray(d['rooms'])) this.roomCount.set((d['rooms'] as unknown[]).length);
      if (Array.isArray(d['selectedProductIds']))
        this.selectedProductIds.set(
          (d['selectedProductIds'] as unknown[]).filter((n): n is number => typeof n === 'number'),
        );
    } catch {
      /* corrupt draft — leave defaults */
    }
  }

  protected loadProducts(): void {
    this.productsLoading.set(true);
    this.productsError.set(false);
    this.productsApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => {
          this.allProducts.set(products);
          this.productsLoading.set(false);
        },
        error: () => {
          this.productsError.set(true);
          this.productsLoading.set(false);
        },
      });
  }

  protected isSelected(id: number): boolean {
    return this.selectedProductIds().includes(id);
  }

  protected toggleProduct(id: number): void {
    this.selectedProductIds.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
    this.persistSelectedProducts();
  }

  private persistSelectedProducts(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      d['selectedProductIds'] = this.selectedProductIds();
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* best-effort */
    }
  }

  protected pay(): void {
    if (this.paying() || this.paid()) return;
    const hostelId = this.draftId();
    const productIds = this.selectedProductIds();
    if (!hostelId || !productIds.length) return;
    this.paying.set(true);
    this.payError.set(false);
    // TODO: replace with real payment API call, e.g.:
    // this.paymentsApi.pay(hostelId, productIds).subscribe(...)
    setTimeout(() => {
      this.paying.set(false);
      this.paid.set(true);
    }, 800);
  }

  protected genderLabel(): string {
    const g = this.accommodationType();
    return g === 'co-living' ? 'Co-living' : g === 'boys' ? 'Boys' : 'Girls';
  }

  protected genderBadgeVariant(): BadgeVariant {
    const g = this.accommodationType();
    return g === 'co-living' ? 'coliving' : g;
  }
}
