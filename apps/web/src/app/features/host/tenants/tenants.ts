import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  catchError,
  filter,
  fromEvent,
  map,
  of,
  startWith,
  switchMap,
  take,
} from 'rxjs';
import { NavigationEnd, NavigationStart } from '@angular/router';
import {
  Button,
  Card,
  ContextMenu,
  ContextMenuDivider,
  DataTable,
  EmptyState,
  ErrorState,
  FilterChips,
  PaginationConfig,
  Search,
  Skeleton,
} from '@hostelhive/ui';

import { HostOpsApi, HostPropertyStore } from '@services';
import { Tenant, TenantStatus } from '@hostelhive/data-access';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { SubscriptionGate } from '@layout/components/subscription-gate/subscription-gate';
import { isSubscriptionError } from '@util/subscription-error';
import { isNetworkError } from '@util/network-error';
import { PAGE_SIZE } from '@util/pagination';
import { TENANTS_TABLE_COLS } from '@app/util/table-configs/tenants-table-cols';
import { TenantFormDrawer } from './tenant-form-drawer/tenant-form-drawer';

interface ViewState {
  loading: boolean;
  error: boolean;
  subscriptionError: boolean;
  networkError: boolean;
  data: Tenant[] | null;
  total: number;
  statuses?: { name: string; slug: string; count: number; dispositionId: number }[];
}

/** What the URL is asking the form drawer to show, or `null` when it should stay closed. */
interface FormRequest {
  mode: 'create' | 'edit';
  tenantId?: string;
  roomId?: string;
}

const TONES = ['sky', 'cream', 'mint'] as const;

@Component({
  selector: 'hh-tenants',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    SubscriptionGate,
    Button,
    Card,
    DataTable,
    FilterChips,
    ContextMenu,
    ContextMenuDivider,
    Skeleton,
    Search,
    EmptyState,
    ErrorState,
    TenantFormDrawer,
  ],
  templateUrl: './tenants.html',
})
export class Tenants {
  private readonly api = inject(HostOpsApi);
  private readonly store = inject(HostPropertyStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly refresh = signal(0);
  private readonly local = signal<Tenant[] | null>(null);

  protected readonly search = signal('');
  protected readonly statusFilter = signal(
    this.route.snapshot.queryParams['status'] ?? 'all',
  );
  protected readonly statuses = signal<{ name: string; slug: string; count: number; dispositionId: number }[]>([]);
  protected readonly tabs = computed(() => [
    { label: 'All', value: 'all' },
    ...this.statuses().map((s) => ({ label: s.name, value: s.slug })),
  ]);
  protected readonly page = signal(1);
  protected readonly formRequest = signal<FormRequest | null>(null);
  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly menuPos = signal<{ top: number; right: number } | null>(null);
  private readonly deletedIds = signal(new Set<string>());

  private readonly fetchKey = computed(() => ({
    hostelId: this.store.selected(),
    page: this.page(),
    search: this.search(),
    statusFilter: this.statusFilter(),
    refresh: this.refresh(),
  }));

  private readonly fetched = toSignal(
    toObservable(this.fetchKey).pipe(
      switchMap(({ hostelId, page, search, statusFilter }) => {
        if (!hostelId)
          return of<ViewState>({ loading: false, error: false, subscriptionError: false, networkError: false, data: null, total: 0 });
        const filters: Record<string, string> = {};
        if (search.trim()) filters['s[full_name]'] = search.trim();
        if (statusFilter !== 'all') filters['f[status.slug]'] = statusFilter;
        return this.api.renters(hostelId, page, PAGE_SIZE, filters).pipe(
          map((res): ViewState => ({
            loading: false, error: false, subscriptionError: false, networkError: false,
            data: res.renters, total: res.total,
            statuses: res.statuses,
          })),
          startWith<ViewState>({ loading: true, error: false, subscriptionError: false, networkError: false, data: null, total: 0 }),
          catchError((err) => {
            const sub = isSubscriptionError(err);
            const net = isNetworkError(err);
            return of<ViewState>({ loading: false, error: !sub, subscriptionError: sub, networkError: net, data: null, total: 0 });
          }),
        );
      }),
    ),
    { initialValue: { loading: true, error: false, subscriptionError: false, networkError: false, data: null, total: 0 } as ViewState },
  );

  private readonly _persistStatuses = effect(() => {
    const s = this.fetched().statuses;
    if (s?.length) this.statuses.set(s);
  });

  protected readonly state = computed<ViewState>(() => {
    const base = this.fetched();
    const overlay = this.local();
    return overlay && !base.loading && !base.error
      ? { ...base, data: overlay }
      : base;
  });

  protected readonly filtered = computed<Tenant[]>(() => {
    const data = this.state().data ?? [];
    const deleted = this.deletedIds();
    return deleted.size ? data.filter((t) => !deleted.has(t.id)) : data;
  });

  protected readonly totalPages = computed(() => {
    const total = this.state().total;
    return total > 0 ? Math.ceil(total / PAGE_SIZE) : null;
  });

  protected readonly hasNextPage = computed(() => {
    const pages = this.totalPages();
    if (pages !== null) return this.page() < pages;
    return (this.state().data?.length ?? 0) >= PAGE_SIZE;
  });

  constructor() {
    fromEvent(window, 'scroll', { capture: true, passive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.closeMenu());

    // Close panel immediately when navigating away
    this.router.events.pipe(
      filter(e => e instanceof NavigationStart),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.formRequest.set(null));

    // Drive the form drawer from the URL
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      startWith(null),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.syncFromRoute());
  }

  // ── Tenant list methods ───────────────────────────────────────────────────

  protected toneFor(index: number): (typeof TONES)[number] {
    return TONES[index % TONES.length];
  }

  protected readonly tableCols = TENANTS_TABLE_COLS;
  protected readonly tenantsRowId = (row: unknown) => (row as Tenant).id;

  protected readonly paginationConf = computed<PaginationConfig | null>(() => {
    const total = this.state().total;
    const pages = this.totalPages();
    if (!pages || pages <= 1) return null;
    return {
      page: this.page(),
      total,
      totalPages: pages,
      hasNextPage: this.hasNextPage(),
      itemLabel: 'tenant',
    };
  });

  protected readonly menuActionActive = (row: unknown) =>
    this.menuOpenId() === (row as Tenant).id;

  private readonly inactiveDispositionId = computed(() =>
    this.statuses().find((s) => s.slug === 'inactive')?.dispositionId ?? 0,
  );
  private readonly activeDispositionId = computed(() =>
    this.statuses().find((s) => s.slug === 'active')?.dispositionId ?? 0,
  );

  protected setInactive(t: Tenant): void {
    this.closeMenu();
    const hostelId = this.store.selected();
    const dispositionId = this.inactiveDispositionId();
    if (!hostelId || !dispositionId) return;
    this.api.patchRenter(hostelId, t.id, { disposition_id: dispositionId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.applyStatus(t.id, 'inactive') });
  }

  protected setActive(t: Tenant): void {
    this.closeMenu();
    const hostelId = this.store.selected();
    const dispositionId = this.activeDispositionId();
    if (!hostelId || !dispositionId) return;
    this.api.patchRenter(hostelId, t.id, { disposition_id: dispositionId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.applyStatus(t.id, 'active') });
  }

  /**
   * Reflect a status change in the table the moment the API confirms it (200), without a
   * full refetch/reload (B9). Writes through the same `local` overlay the list already
   * uses, so the pill flips instantly and stays consistent until the next real fetch.
   */
  private applyStatus(id: string, status: TenantStatus): void {
    const current = this.state().data ?? [];
    this.local.set(current.map((x) => (x.id === id ? { ...x, status } : x)));
  }

  protected onTenantAction(ev: { row: unknown; event: MouseEvent }): void {
    this.toggleMenu((ev.row as Tenant).id, ev.event);
  }

  // ── Route-driven form drawer ──────────────────────────────────────────────

  protected openCheckIn(preselectedRoomId?: string): void {
    const hostelId = this.store.selected();
    if (!hostelId) return;
    const extras = preselectedRoomId ? { queryParams: { roomId: preselectedRoomId } } : {};
    this.router.navigate(['/host', hostelId, 'tenants', 'create'], extras);
  }

  protected openEdit(t: Tenant): void {
    const hostelId = this.store.selected();
    if (!hostelId) return;
    this.router.navigate(['/host', hostelId, 'tenants', 'edit', t.id]);
  }

  protected onDrawerSaved(): void {
    this.local.set(null);
    this.refresh.update((n) => n + 1);
    this.goToList();
  }

  protected onDrawerClosed(): void {
    this.goToList();
  }

  private goToList(): void {
    const hostelId = this.store.selected();
    if (hostelId) void this.router.navigate(['/host', hostelId, 'tenants']);
  }

  private syncFromRoute(): void {
    const snapshot = this.route.snapshot;
    const seg = snapshot.url[0]?.path;

    if (seg === 'create') {
      this.formRequest.set({
        mode: 'create',
        roomId: snapshot.queryParamMap.get('roomId') ?? undefined,
      });
      return;
    }
    if (seg === 'edit') {
      this.formRequest.set({
        mode: 'edit',
        tenantId: snapshot.paramMap.get('tenantId') ?? undefined,
      });
      return;
    }
    this.formRequest.set(null);
  }

  protected toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    if (this.menuOpenId() === id) {
      this.menuOpenId.set(null);
      this.menuPos.set(null);
    } else {
      this.menuOpenId.set(id);
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.menuPos.set({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }

  protected closeMenu(): void {
    this.menuOpenId.set(null);
    this.menuPos.set(null);
  }

  protected goToProfile(t: Tenant): void {
    this.closeMenu();
    this.router.navigate(['/host', this.store.selected(), 'tenants', 'profile', t.id]);
  }

  protected setSearch(v: string): void {
    this.search.set(v);
    this.page.set(1);
    this.local.set(null);
  }

  protected setFilter(f: string): void {
    if (f === this.statusFilter()) return;
    this.statusFilter.set(f);
    this.page.set(1);
    this.local.set(null);
    void this.router.navigate([], {
      queryParams: { status: f === 'all' ? null : f },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected goToPage(n: number): void {
    this.local.set(null);
    this.page.set(n);
  }

  protected retry(): void {
    this.local.set(null);
    this.page.set(1);
    this.refresh.update((n) => n + 1);
  }
}
