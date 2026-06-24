import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  filter,
  map,
  of,
  startWith,
  switchMap,
  take,
} from 'rxjs';
import {
  Button,
  Card,
  Dropdown,
  DropdownOption,
  EmptyState,
  ErrorState,
  FilterChips,
  NoResults,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import { HostOpsApi, HostPropertyStore } from '@services';
import { UtilityBill, UtilityType, UtilityTypeMeta } from '@hostelhive/data-access';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { SubscriptionGate } from '@layout/components/subscription-gate/subscription-gate';
import { isSubscriptionError } from '@util/subscription-error';
import { isNetworkError } from '@util/network-error';
import { PAGE_SIZE } from '@util/pagination';

interface ViewState {
  loading: boolean;
  error: boolean;
  subscriptionError: boolean;
  networkError: boolean;
  bills: UtilityBill[] | null;
  total: number;
  statuses?: { name: string; slug: string; count: number }[];
  aggs?: { billToPay: number; received: number; balance: number };
}

@Component({
  selector: 'hh-utilities',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    DashboardLayout,
    SubscriptionGate,
    Button,
    Card,
    Dropdown,
    FilterChips,
    NoResults,
    Skeleton,
    EmptyState,
    ErrorState,
    StatusPill,
  ],
  templateUrl: './utilities.html',
})
export class Utilities {
  private readonly api = inject(HostOpsApi);
  private readonly store = inject(HostPropertyStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refresh = signal(0);
  private readonly expandedIds = signal(new Set<string>());

  protected readonly statusFilter = signal('all');
  protected readonly statuses = signal<{ name: string; slug: string; count: number }[]>([]);
  protected readonly tabs = computed(() => [
    { label: 'All', value: 'all' },
    ...this.statuses().map((s) => ({ label: `${s.name} (${s.count})`, value: s.slug })),
  ]);
  protected readonly page = signal(1);
  protected readonly roomFilter = signal('');
  protected readonly tenantFilter = signal('');
  protected readonly aggs = signal<{ billToPay: number; received: number; balance: number } | null>(null);
  protected readonly currentMonthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Room filter dropdown (server-side search)
  protected readonly roomDropdownOptions = signal<DropdownOption[]>([]);
  protected readonly roomLoading = signal(false);
  private readonly hostelId$ = toObservable(this.store.selected);
  private readonly roomLoad$ = new Subject<string>();

  // Tenant filter dropdown (server-side search)
  protected readonly tenantDropdownOptions = signal<DropdownOption[]>([]);
  protected readonly tenantLoading = signal(false);
  private readonly tenantLoad$ = new Subject<string>();

  private readonly fetchKey = computed(() => ({
    hostelId: this.store.selected(),
    page: this.page(),
    statusFilter: this.statusFilter(),
    roomFilter: this.roomFilter(),
    tenantFilter: this.tenantFilter(),
    refresh: this.refresh(),
  }));

  private readonly fetched = toSignal(
    toObservable(this.fetchKey).pipe(
      switchMap(({ hostelId, page, statusFilter, roomFilter, tenantFilter }) => {
        if (!hostelId) {
          return of<ViewState>({ loading: false, error: false, subscriptionError: false, networkError: false, bills: [], total: 0 });
        }
        const filters: Record<string, string> = {};
        if (statusFilter !== 'all') filters['f[status.slug]'] = statusFilter;
        if (roomFilter) filters['f[room_id]'] = roomFilter;
        if (tenantFilter) filters['f[renter_id]'] = tenantFilter;
        return this.api.utilityBills(hostelId, page, PAGE_SIZE, filters).pipe(
          map((res): ViewState => ({
            loading: false,
            error: false,
            subscriptionError: false,
            networkError: false,
            bills: res.bills,
            total: res.total,
            statuses: res.statuses,
            aggs: res.aggs,
          })),
          startWith<ViewState>({ loading: true, error: false, subscriptionError: false, networkError: false, bills: null, total: 0 }),
          catchError((err) => {
            const sub = isSubscriptionError(err);
            const net = isNetworkError(err);
            return of<ViewState>({ loading: false, error: !sub, subscriptionError: sub, networkError: net, bills: null, total: 0 });
          }),
        );
      }),
    ),
    { initialValue: { loading: true, error: false, subscriptionError: false, networkError: false, bills: null, total: 0 } as ViewState },
  );

  private readonly _persistStatuses = effect(() => {
    const s = this.fetched().statuses;
    if (s?.length) this.statuses.set(s);
  });

  private readonly _persistAggs = effect(() => {
    const a = this.fetched().aggs;
    if (a) this.aggs.set(a);
  });

  protected readonly state = this.fetched;
  protected readonly bills = computed<UtilityBill[]>(() => this.state().bills ?? []);

  protected readonly totalPages = computed(() => {
    const total = this.state().total;
    return total > 0 ? Math.ceil(total / PAGE_SIZE) : null;
  });

  protected readonly hasNextPage = computed(() => {
    const pages = this.totalPages();
    if (pages !== null) return this.page() < pages;
    return (this.state().bills?.length ?? 0) >= PAGE_SIZE;
  });

  constructor() {
    // Room dropdown search pipeline
    this.roomLoad$.pipe(
      debounceTime(200),
      switchMap((query) =>
        this.hostelId$.pipe(
          filter((id): id is string => !!id),
          take(1),
          map((hostelId) => ({ query, hostelId })),
        ),
      ),
      switchMap(({ query, hostelId }) => {
        this.roomLoading.set(true);
        const filters: Record<string, string> = {};
        if (query.trim()) filters['f[room_number]'] = query.trim();
        return this.api.rooms(hostelId, 1, 20, filters).pipe(
          map((res) => res.rooms.map((r) => ({ value: r.id, label: `Room ${r.number}` } as DropdownOption))),
          catchError(() => {
            this.roomLoading.set(false);
            return EMPTY;
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((opts) => {
      this.roomDropdownOptions.set(opts);
      this.roomLoading.set(false);
    });

    // Tenant dropdown search pipeline
    this.tenantLoad$.pipe(
      debounceTime(200),
      switchMap((query) =>
        this.hostelId$.pipe(
          filter((id): id is string => !!id),
          take(1),
          map((hostelId) => ({ query, hostelId })),
        ),
      ),
      switchMap(({ query, hostelId }) => {
        this.tenantLoading.set(true);
        const filters: Record<string, string> = {};
        if (query.trim()) filters['q'] = query.trim();
        return this.api.renters(hostelId, 1, 20, filters).pipe(
          map((res) => res.renters.map((t) => ({ value: t.id, label: t.name } as DropdownOption))),
          catchError(() => {
            this.tenantLoading.set(false);
            return EMPTY;
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((opts) => {
      this.tenantDropdownOptions.set(opts);
      this.tenantLoading.set(false);
    });

    // Reload dropdowns when hostel changes
    effect(() => {
      if (this.store.selected()) {
        this.roomLoad$.next('');
        this.tenantLoad$.next('');
      }
    });
  }

  protected metaOf(type: UtilityType): UtilityTypeMeta {
    return this.api.utilityMeta(type);
  }

  protected statusTone(slug: string | undefined): 'ok' | 'warn' | 'danger' | 'neutral' {
    switch (slug) {
      case 'paid': return 'ok';
      case 'over-due': return 'danger';
      case 'due': return 'warn';
      default: return 'neutral';
    }
  }

  protected isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  protected toggleExpand(id: string): void {
    this.expandedIds.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected deleteBill(id: string): void {
    const hostelId = this.store.selected();
    if (!hostelId) return;
    this.api.deleteUtilityBill(hostelId, id).subscribe({
      next: () => this.refresh.update((n) => n + 1),
    });
  }

  protected setFilter(status: string): void {
    this.statusFilter.set(status);
    this.page.set(1);
  }

  protected setRoom(v: string | string[] | null): void {
    this.roomFilter.set(typeof v === 'string' ? v : '');
    this.page.set(1);
  }

  protected setTenant(v: string | string[] | null): void {
    this.tenantFilter.set(typeof v === 'string' ? v : '');
    this.page.set(1);
  }

  protected onRoomSearch(q: string): void {
    this.roomLoad$.next(q);
  }

  protected onTenantSearch(q: string): void {
    this.tenantLoad$.next(q);
  }

  protected clearFilters(): void {
    this.statusFilter.set('all');
    this.roomFilter.set('');
    this.tenantFilter.set('');
    this.page.set(1);
  }

  protected goToPage(p: number): void {
    this.page.set(p);
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
