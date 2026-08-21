import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  catchError,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import {
  Button,
  Card,
  CellDef,
  ContextMenu,
  ContextMenuDivider,
  ColumnDef,
  ConfirmModal,
  DataTable,
  DateRangeValue,
  EmptyState,
  ErrorState,
  ExpandConfig,
  FilterOption,
  FilterValues,
  GlobalFilter,
  PaginationConfig,
  Skeleton,
  SortState,
} from '@hostelhive/ui';
import { HostOpsApi, HostPropertyStore } from '@services';
import { TenantBillSplit, UtilityBill, UtilityType, UtilityTypeMeta } from '@hostelhive/data-access';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { SubscriptionGate } from '@layout/components/subscription-gate/subscription-gate';
import { isSubscriptionError } from '@util/subscription-error';
import { isNetworkError } from '@util/network-error';
import { PAGE_SIZE } from '@util/pagination';
import { dayRangeStart, dayRangeEnd } from '@util/date-range-filter';
import { API_CONFIG } from '@core/api-config';
import { utilityFilterGroups } from '@app/util/filter-configs/utility-filter-groups';
import { format, parseISO } from 'date-fns';
import { HasPermission } from '@core/auth';

function fmtDate(s?: string): string {
  if (!s) return '—';
  try { return format(parseISO(s), 'dd MMM yyyy'); } catch { return '—'; }
}

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
    HasPermission,
    RouterLink,
    DashboardLayout,
    DecimalPipe,
    SubscriptionGate,
    Button,
    Card,
    ConfirmModal,
    ContextMenu,
    ContextMenuDivider,
    DataTable,
    EmptyState,
    ErrorState,
    GlobalFilter,
    Skeleton,
  ],
  templateUrl: './utilities.html',
})
export class Utilities {
  private readonly api = inject(HostOpsApi);
  private readonly store = inject(HostPropertyStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly apiBaseUrl = inject(API_CONFIG).baseUrl;
  private readonly refresh = signal(0);

  protected readonly billRowId = (row: unknown) => (row as UtilityBill).id;
  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly menuPos = signal<{ top: number; right: number } | null>(null);
  protected readonly deletePending = signal<UtilityBill | null>(null);
  protected readonly deleting = signal(false);
  private readonly deletedIds = signal(new Set<string>());

  protected readonly statusFilter = signal(
    this.route.snapshot.queryParams['status'] ?? 'all',
  );
  protected readonly statuses = signal<{ name: string; slug: string; count: number }[]>([]);
  protected readonly page = signal(1);
  protected readonly sortState = signal<SortState>({ key: 'created_at', dir: 'desc' });
  protected readonly roomFilter = signal('');
  protected readonly tenantFilter = signal('');
  protected readonly dateFrom = signal('');
  protected readonly dateTo = signal('');
  protected readonly aggs = signal<{ billToPay: number; received: number; balance: number } | null>(null);
  protected readonly currentMonthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  private readonly fetchKey = computed(() => ({
    hostelId: this.store.selected(),
    page: this.page(),
    statusFilter: this.statusFilter(),
    roomFilter: this.roomFilter(),
    tenantFilter: this.tenantFilter(),
    dateFrom: this.dateFrom(),
    dateTo: this.dateTo(),
    refresh: this.refresh(),
    sort: this.sortState(),
  }));

  private readonly fetched = toSignal(
    toObservable(this.fetchKey).pipe(
      switchMap(({ hostelId, page, statusFilter, roomFilter, tenantFilter, dateFrom, dateTo, sort }) => {
        if (!hostelId) {
          return of<ViewState>({ loading: false, error: false, subscriptionError: false, networkError: false, bills: [], total: 0 });
        }
        const filters: Record<string, string> = {};
        if (statusFilter !== 'all') filters['f[status.slug]'] = statusFilter;
        if (roomFilter) filters['f[room_id]'] = roomFilter;
        if (tenantFilter) filters['f[renter_id]'] = tenantFilter;
        if (dateFrom) filters['f[issue_date][gte]'] = dayRangeStart(dateFrom);
        if (dateTo) filters['f[issue_date][lte]'] = dayRangeEnd(dateTo);
        if (sort) filters[`sort[${sort.key}]`] = sort.dir;
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
  protected readonly bills = computed<UtilityBill[]>(() => {
    const all = this.state().bills ?? [];
    const deleted = this.deletedIds();
    return deleted.size ? all.filter((b) => !deleted.has(b.id)) : all;
  });

  protected readonly totalPages = computed(() => {
    const total = this.state().total;
    return total > 0 ? Math.ceil(total / PAGE_SIZE) : null;
  });

  protected readonly hasNextPage = computed(() => {
    const pages = this.totalPages();
    if (pages !== null) return this.page() < pages;
    return (this.state().bills?.length ?? 0) >= PAGE_SIZE;
  });

  // ── filter panel ─────────────────────────────────────────────────────────────

  protected readonly statusOptions = computed<FilterOption[]>(() =>
    this.statuses().map((s) => ({ value: s.slug, label: `${s.name} (${s.count})` })),
  );

  protected readonly filterGroups = computed(() =>
    utilityFilterGroups(this.store.selected() ?? '', this.statusOptions(), this.apiBaseUrl),
  );

  protected readonly currentFilterValues = computed<FilterValues>(() => {
    const v: FilterValues = {};
    v['status'] = this.statusFilter();
    const room = this.roomFilter();
    if (room) v['room'] = room;
    const tenant = this.tenantFilter();
    if (tenant) v['tenant'] = tenant;
    const from = this.dateFrom();
    const to = this.dateTo();
    if (from || to) v['date'] = { from: from || undefined, to: to || undefined };
    return v;
  });

  protected onFiltersApply(values: FilterValues): void {
    const status = ((values['status'] as string) || 'all');
    const room = (values['room'] as string) || '';
    const tenant = (values['tenant'] as string) || '';
    const date = values['date'] as DateRangeValue | undefined;

    this.statusFilter.set(status);
    this.roomFilter.set(room);
    this.tenantFilter.set(tenant);
    this.dateFrom.set(date?.from ?? '');
    this.dateTo.set(date?.to ?? '');
    this.page.set(1);

    void this.router.navigate([], {
      queryParams: { status: status === 'all' ? null : status },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ── table columns ─────────────────────────────────────────────────────────────

  protected readonly tableCols = computed<ColumnDef[]>(() => [
    {
      key: 'room', label: 'Room',
      cell: (r) => {
        const b = r as UtilityBill;
        const c = b.splits?.length ?? 0;
        return { kind: 'composite', primary: `Room ${b.roomNumber}`, secondary: `${c} tenant${c !== 1 ? 's' : ''}` };
      },
    },
    {
      key: 'utility', label: 'Utility',
      cell: (r) => {
        const b = r as UtilityBill;
        const m = this.api.utilityMeta(b.type);
        return { kind: 'icon-text', icon: m.icon, text: m.label } satisfies CellDef;
      },
    },
    {
      key: 'status', label: 'Status',
      cell: (r) => {
        const b = r as UtilityBill;
        if (!b.status) return { kind: 'text', value: '—', class: 'text-xs text-ink-400' } satisfies CellDef;
        return { kind: 'pill', text: b.status.name, tone: this.statusTone(b.status.slug) } satisfies CellDef;
      },
    },
    {
      key: 'startReading', label: 'Previous units', align: 'right',
      cell: (r) => {
        const v = (r as UtilityBill).startReading;
        return { kind: 'text', value: v !== null ? v.toLocaleString() : '—', class: 'text-ink-500' } satisfies CellDef;
      },
    },
    {
      key: 'endReading', label: 'Current units', align: 'right',
      cell: (r) => {
        const v = (r as UtilityBill).endReading;
        return { kind: 'text', value: v !== null ? v.toLocaleString() : '—', class: 'text-ink-500' } satisfies CellDef;
      },
    },
    {
      key: 'units', label: 'Consumed', align: 'right',
      cell: (r) => {
        const v = (r as UtilityBill).units;
        if (v !== null) return { kind: 'text', value: v.toLocaleString(), class: 'font-medium text-ink-700' } satisfies CellDef;
        return { kind: 'text', value: 'fixed', class: 'text-xs text-ink-400' } satisfies CellDef;
      },
    },
    {
      key: 'rate', label: 'Rate', align: 'right',
      cell: (r) => {
        const v = (r as UtilityBill).rate;
        return { kind: 'text', value: v > 0 ? v.toLocaleString() : '—', class: 'text-ink-500' } satisfies CellDef;
      },
    },
    {
      key: 'total', label: 'Bill to collect', align: 'right',
      cell: (r) => ({ kind: 'currency', amount: (r as UtilityBill).total, class: 'font-medium text-ink-900' } satisfies CellDef),
    },
    {
      key: 'received', label: 'Received', align: 'right',
      cell: (r) => ({ kind: 'currency', amount: (r as UtilityBill).received, class: 'font-medium text-ok', zeroText: '—' } satisfies CellDef),
    },
    {
      key: 'balance', label: 'Balance', align: 'right',
      cell: (r) => {
        const b = r as UtilityBill;
        const bal = b.total - b.received;
        return { kind: 'currency', amount: bal, zeroText: '—', class: bal > 0 ? 'font-medium text-danger' : 'font-medium text-ink-400' } satisfies CellDef;
      },
    },
    {
      key: 'issue_date', label: 'Issued date', sortable: true,
      cell: (r) => ({ kind: 'text', value: fmtDate((r as UtilityBill).issuedDate), class: 'text-ink-500' } satisfies CellDef),
    },
    {
      key: 'created_at', label: 'Created at', sortable: true,
      cell: (r) => ({ kind: 'text', value: fmtDate((r as UtilityBill).createdAt), class: 'text-ink-500' } satisfies CellDef),
    },
  ]);

  protected readonly expandConf = computed<ExpandConfig>(() => ({
    childRows: (r) => (r as UtilityBill).splits ?? [],
    childId: (s) => (s as TenantBillSplit).id,
    childName: (s) => (s as TenantBillSplit).name,
    nameColSpan: 8,
    columns: [
      {
        label: 'Days', align: 'right',
        cell: (s) => ({ kind: 'text', value: String((s as TenantBillSplit).days), class: 'text-ink-500' } satisfies CellDef),
      },
      {
        label: 'Share', align: 'right',
        cell: (s) => ({ kind: 'currency', amount: (s as TenantBillSplit).amount, class: 'font-medium text-ink-900' } satisfies CellDef),
      },
      {
        label: 'Received', align: 'right',
        cell: (s) => ({ kind: 'currency', amount: (s as TenantBillSplit).received, class: 'font-medium text-ok', zeroText: '—' } satisfies CellDef),
      },
      {
        label: 'Balance', align: 'right',
        cell: (s) => {
          const sp = s as TenantBillSplit;
          const bal = sp.amount - sp.received;
          return { kind: 'currency', amount: bal, zeroText: '—', class: bal > 0 ? 'font-medium text-danger' : 'font-medium text-ink-400' } satisfies CellDef;
        },
      },
    ],
  }));

  protected readonly paginationConf = computed<PaginationConfig>(() => ({
    page: this.page(),
    total: this.state().total,
    totalPages: this.totalPages(),
    hasNextPage: this.hasNextPage(),
    itemLabel: 'bill',
  }));

  protected readonly menuActionActive = (row: unknown): boolean =>
    this.menuOpenId() === (row as UtilityBill).id;

  protected onSortChange(s: SortState | null): void {
    this.sortState.set(s ?? { key: 'created_at', dir: 'desc' });
    this.page.set(1);
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

  protected openMenu(b: UtilityBill, event: MouseEvent): void {
    event.stopPropagation();
    if (this.menuOpenId() === b.id) { this.menuOpenId.set(null); return; }
    const btn = event.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    this.menuPos.set({ top: r.bottom + 4, right: window.innerWidth - r.right });
    this.menuOpenId.set(b.id);
  }

  protected closeMenu(): void {
    this.menuOpenId.set(null);
  }

  protected editBill(b: UtilityBill, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    const hostelId = this.store.selected();
    if (!hostelId) return;
    this.router.navigate(['/host', hostelId, 'utilities', 'edit', b.id]);
  }

  protected promptDelete(b: UtilityBill, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.deletePending.set(b);
  }

  protected confirmDelete(): void {
    const b = this.deletePending();
    const hostelId = this.store.selected();
    if (!b || !hostelId) return;
    this.deletedIds.update((s) => { const n = new Set(s); n.add(b.id); return n; });
    this.deletePending.set(null);
    this.deleting.set(true);
    this.api.deleteUtilityBill(hostelId, b.id).subscribe({
      next: () => { this.deleting.set(false); },
      error: () => {
        this.deletedIds.update((s) => { const n = new Set(s); n.delete(b.id); return n; });
        this.deleting.set(false);
      },
    });
  }

  protected cancelDelete(): void {
    this.deletePending.set(null);
  }

  protected clearFilters(): void {
    this.statusFilter.set('all');
    this.roomFilter.set('');
    this.tenantFilter.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.page.set(1);
  }

  protected goToPage(p: number): void {
    this.page.set(p);
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
