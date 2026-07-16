import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { format, parseISO } from 'date-fns';
import { DecimalPipe } from '@angular/common';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { catchError, debounceTime, map, of, startWith, switchMap } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { HostelDetail, User } from '@hostelhive/data-access';
import { HostelsApi, UsersApi } from '@services';
import {
  Button,
  Card,
  DataTable,
  DateRangeValue,
  DropdownOption,
  EmptyState,
  ErrorState,
  FilterGroup,
  FilterValues,
  GlobalFilter,
  PaginationConfig,
  Search,
  Skeleton,
  SortState,
  StatusPill,
} from '@hostelhive/ui';
import type { StatusTone } from '@hostelhive/ui';
import { downloadCsv } from '@util/csv';
import { AdminApi } from '@services';
import {
  DetailState,
  loadDetail,
  resolveHostelImages,
} from '@features/admin/data/drawer-detail';
import {
  Contract,
  ContractAgg,
  ContractFilter,
  ContractStatus,
  ContractStatusOption,
  ContractsPage,
  PaymentState,
} from '@hostelhive/data-access';
import { AdminShell } from '@features/admin/admin-shell/admin-shell';
import { isNetworkError } from '@util/network-error';
import { ADMIN_CONTRACTS_TABLE_COLS } from '@app/util/table-configs/admin-contracts-table-cols';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: ContractsPage | null;
}

/** Sortable columns — the value is the API property used in `sort[<field>]`. */
type SortField = 'price';

// Tone/label per known status slug; statusMeta() falls back for any slug not listed here.
const STATUS_META: Record<
  string,
  { tone: StatusTone; label: string; dot: boolean }
> = {
  draft: { tone: 'warn', label: 'Draft', dot: false },
  active: { tone: 'ok', label: 'Active', dot: true },
  expired: { tone: 'neutral', label: 'Expired', dot: false },
  completed: { tone: 'neutral', label: 'Completed', dot: false },
  refunded: { tone: 'danger', label: 'Refunded', dot: false },
};

const PAYMENT_META: Record<PaymentState, { tone: StatusTone; label: string }> =
  {
    paid: { tone: 'ok', label: 'Paid' },
    pending: { tone: 'warn', label: 'Pending' },
    failed: { tone: 'danger', label: 'Failed' },
    refunded: { tone: 'neutral', label: 'Refunded' },
  };

/**
 * Contracts console (mockup 27). Status-filter chips + hostel search + server-side pagination drive
 * a reactive table of contracts; each row opens a read-only detail panel.
 */
@Component({
  selector: 'hh-admin-contracts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    AdminShell,
    Card,
    Button,
    DataTable,
    Search,
    GlobalFilter,
    StatusPill,
    EmptyState,
    ErrorState,
    Skeleton,
  ],
  templateUrl: './admin-contracts.html',
})
export class AdminContracts {
  private readonly api = inject(AdminApi);
  private readonly hostels = inject(HostelsApi);
  private readonly users = inject(UsersApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  protected readonly filter = signal<ContractFilter>(
    (this.route.snapshot.queryParams['status'] as ContractFilter) ?? 'all',
  );
  protected readonly page = signal(1);
  protected readonly selected = signal<Contract | null>(null);
  protected readonly imgIndex = signal(0); // active slide in the drawer's hostel image carousel
  private readonly refresh = signal(0);

  /** Active sort column + direction → `sort[<field>]=<dir>`; null until the user sorts a column. */
  protected readonly sortField = signal<SortField | null>(null);
  protected readonly sortDir = signal<'asc' | 'desc'>('desc');

  // Hostel search: field type (name / id) controlled via the scoped-search dropdown; term debounced.
  protected readonly searchFieldOptions: DropdownOption[] = [
    { value: 'name', label: 'Hostel name' },
    { value: 'id', label: 'Hostel ID' },
  ];
  protected readonly searchField = signal<'name' | 'id'>('name');
  protected readonly searchTerm = signal('');
  private readonly debouncedTerm = toSignal(
    toObservable(this.searchTerm).pipe(
      debounceTime(300),
      map((t) => t.trim()),
    ),
    { initialValue: '' },
  );

  /** End-date range filter (YYYY-MM-DD) → f[end_date][gte] / f[end_date][lte]. */
  protected readonly endFrom = signal('');
  protected readonly endTo = signal('');

  /** Global filter panel groups — reactive so Status options populate once the API loads. */
  protected readonly filterGroups = computed<FilterGroup[]>(() => [
    {
      key: 'status',
      label: 'Status',
      icon: 'ti-tag',
      fields: [
        {
          key: 'status',
          type: 'radio',
          options: [
            { value: 'all', label: 'All statuses' },
            ...this.statuses().map((s) => ({ value: s.slug, label: s.name })),
          ],
          allValue: 'all',
        },
      ],
    },
    {
      key: 'endDate',
      label: 'Date range',
      icon: 'ti-calendar',
      fields: [
        {
          key: 'endDate',
          type: 'date-range',
          label: 'Contract end date',
        },
      ],
    },
  ]);
  protected readonly globalFilters = signal<FilterValues>({
    status: (this.route.snapshot.queryParams['status'] as string) ?? 'all',
  });

  /** Status options + stat-card aggregates from the contracts API, persisted across reloads. */
  protected readonly statuses = signal<ContractStatusOption[]>([]);
  protected readonly aggs = signal<ContractAgg[]>([]);

  private readonly query = computed(() => {
    this.refresh();
    return {
      filter: this.filter(),
      page: this.page(),
      field: this.searchField(),
      term: this.debouncedTerm(),
      endFrom: this.endFrom(),
      endTo: this.endTo(),
      sortField: this.sortField(),
      sortDir: this.sortDir(),
    };
  });

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      switchMap((q) => {
        const search = q.term
          ? q.field === 'id'
            ? { hostelId: q.term }
            : { hostelName: q.term }
          : undefined;
        const dateRange =
          q.endFrom || q.endTo
            ? { endFrom: q.endFrom, endTo: q.endTo }
            : undefined;
        const sort = q.sortField
          ? { field: q.sortField, dir: q.sortDir }
          : undefined;
        return this.api
          .contracts(q.filter, q.page, search, dateRange, sort)
          .pipe(
            map((data): ViewState => ({ loading: false, error: false, networkError: false, data })),
            startWith<ViewState>({ loading: true, error: false, networkError: false, data: null }),
            catchError((err) =>
              of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null }),
            ),
          );
      }),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  // Persist the API's tab statuses + card aggs across reloads (state resets to null while loading).
  private readonly _persistMeta = effect(() => {
    const d = this.state().data;
    if (d) {
      this.statuses.set(d.statuses);
      this.aggs.set(d.aggs);
    }
  });

  /** Page count — the API's own `total_pages`, falling back to total / pageSize. */
  protected readonly totalPages = computed(() => {
    const d = this.state().data;
    if (!d) return 1;
    return Math.max(1, d.totalPages ?? Math.ceil(d.total / (d.pageSize || 1)));
  });

  /** Condensed page list with ellipses, e.g. [1, 2, 3, -1, 27]. */
  protected readonly pageNumbers = computed<number[]>(() => {
    const total = this.totalPages();
    const current = this.page();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: number[] = [1];
    const lo = Math.max(2, current - 1);
    const hi = Math.min(total - 1, current + 1);
    if (lo > 2) pages.push(-1);
    for (let i = lo; i <= hi; i++) pages.push(i);
    if (hi < total - 1) pages.push(-1);
    pages.push(total);
    return pages;
  });

  /* ---- drawer sub-details: hostel + host, fetched reactively for the open contract ---- */
  private readonly selectedHostelId = computed(
    () => this.selected()?.hostelId ?? null,
  );
  private readonly selectedHostId = computed(
    () => this.selected()?.hostId ?? null,
  );

  /** The open contract's hostel (`GET /api/hostels/:id`) — reloads when the selection changes. */
  protected readonly hostelState = toSignal(
    toObservable(this.selectedHostelId).pipe(
      switchMap((id) => loadDetail(id, (x) => this.hostels.getById(x))),
    ),
    {
      initialValue: {
        loading: false,
        error: false,
        data: null,
      } as DetailState<HostelDetail>,
    },
  );

  /** The open contract's host (`GET /api/users/:id`). */
  protected readonly hostState = toSignal(
    toObservable(this.selectedHostId).pipe(
      switchMap((id) => loadDetail(id, (x) => this.users.getById(x))),
    ),
    {
      initialValue: {
        loading: false,
        error: false,
        data: null,
      } as DetailState<User>,
    },
  );

  /** Image URLs for the open hostel (banner + image attachments) — drives the drawer carousel. */
  protected readonly hostelImages = computed<string[]>(() => {
    const h = this.hostelState().data;
    return h ? resolveHostelImages(h) : [];
  });
  /** Current carousel slide, clamped to the available images. */
  protected readonly currentImageIndex = computed(() => {
    const n = this.hostelImages().length;
    return n ? Math.min(this.imgIndex(), n - 1) : 0;
  });
  /** Advance the carousel by `dir` (wraps around). */
  protected slideImg(dir: number): void {
    const n = this.hostelImages().length;
    if (n <= 1) return;
    this.imgIndex.set((((this.currentImageIndex() + dir) % n) + n) % n);
  }
  protected goImg(i: number): void {
    this.imgIndex.set(i);
  }

  protected readonly tableCols = ADMIN_CONTRACTS_TABLE_COLS;
  protected readonly contractsRowId = (row: unknown) => (row as Contract).id;

  protected readonly tableSortState = computed<SortState | null>(() =>
    this.sortField() ? { key: 'amount', dir: this.sortDir() } : null,
  );

  protected readonly paginationConf = computed<PaginationConfig | null>(() => {
    const d = this.state().data;
    if (!d || this.totalPages() <= 1) return null;
    return {
      page: this.page(),
      total: d.total,
      totalPages: this.totalPages(),
      hasNextPage: this.page() < this.totalPages(),
      itemLabel: 'contract',
    };
  });

  protected onTableSort(s: SortState | null): void {
    if (!s) { this.sortField.set(null); }
    else { this.sortField.set('price'); this.sortDir.set(s.dir); }
    this.page.set(1);
  }

  protected goToPage(p: number): void {
    if (p < 1 || p > this.totalPages() || p === this.page()) return;
    this.page.set(p);
  }
  /** Toggle direction when re-clicking the active column, else sort that column (highest first). */
  protected toggleSort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortField.set(field);
      this.sortDir.set('desc');
    }
    this.page.set(1); // a new sort starts from page 1
  }
  /** Tabler icon for a column header — direction arrow when active, neutral arrows otherwise. */
  protected sortIcon(field: SortField): string {
    if (this.sortField() !== field) return 'ti-arrows-sort text-ink-300';
    return this.sortDir() === 'asc' ? 'ti-arrow-up' : 'ti-arrow-down';
  }
  protected onSearchTerm(term: string): void {
    this.searchTerm.set(term);
    this.page.set(1);
  }
  protected onSearchField(v: string | string[] | null): void {
    this.searchField.set(v === 'id' ? 'id' : 'name');
    this.searchTerm.set('');
    this.page.set(1);
  }
  protected applyGlobalFilters(v: FilterValues): void {
    this.filter.set(((v['status'] as string | undefined) ?? 'all') as ContractFilter);
    const dr = v['endDate'] as DateRangeValue | undefined;
    this.endFrom.set(dr?.from ?? '');
    this.endTo.set(dr?.to ?? '');
    this.page.set(1);
  }
  protected clearDateRange(): void {
    this.filter.set('all');
    this.endFrom.set('');
    this.endTo.set('');
    this.searchField.set('name');
    this.globalFilters.set({ status: 'all' });
    this.page.set(1);
  }

  protected open(c: Contract): void {
    this.selected.set(c);
    this.imgIndex.set(0); // reset the hostel image carousel for the newly opened contract
    // Enrich the drawer with the full contract (accurate payment state from the /:id show endpoint).
    if (c.contractId == null) return;
    this.api
      .getContract(c.contractId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (full) =>
          this.selected.update((s) =>
            s && s.contractId === full.contractId
              ? {
                  ...s,
                  ...full,
                  hostelId: full.hostelId ?? s.hostelId,
                  hostId: full.hostId ?? s.hostId,
                }
              : s,
          ),
        error: () => {
          /* keep the row data if the detail fetch fails (e.g. backend unreachable) */
        },
      });
  }
  protected close(): void {
    this.selected.set(null);
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  /** CSV export of the currently-loaded page — client-side download via the shared helper. */
  protected exportCsv(): void {
    const rows = this.state().data?.items ?? [];
    if (!rows.length) return;
    downloadCsv(
      `hostelhive-contracts-${this.filter()}-p${this.page()}`,
      [
        'Contract',
        'Hostel',
        'Hostel ID',
        'Host',
        'Plan',
        'Term',
        'Status',
        'Payment',
        'Amount (PKR)',
      ],
      rows.map((c) => [
        c.id,
        c.hostelName ?? '',
        c.hostelId ?? '',
        c.host,
        c.plan,
        c.term ?? '',
        this.statusMeta(c.status).label,
        this.paymentMeta(c.payment).label,
        c.amount,
      ]),
    );
  }

  protected statusMeta(s: ContractStatus) {
    return (
      STATUS_META[s] ?? {
        tone: 'neutral' as StatusTone,
        label: s ? s.charAt(0).toUpperCase() + s.slice(1) : '—',
        dot: false,
      }
    );
  }
  protected paymentMeta(p: PaymentState) {
    return PAYMENT_META[p];
  }

  protected rowClass(c: Contract): string {
    const base = 'cursor-pointer transition hover:bg-surface';
    return c.status === 'draft' ? `${base} bg-warn/5` : base;
  }

  /** Accent colour for a stat-card count, by status slug. */
  protected aggTextClass(slug: string): string {
    switch (slug) {
      case 'active':
        return 'text-ok';
      case 'draft':
        return 'text-warn';
      case 'refunded':
        return 'text-danger';
      default:
        return 'text-ink-900';
    }
  }

  /* ---- drawer detail formatting ---- */
  /** e.g. 'Boys · Building' from the hostel's gender + property type. */
  protected hostelTypeLabel(h: HostelDetail): string {
    return [h.gender_type, h.property_type]
      .filter(Boolean)
      .map(cap)
      .join(' · ');
  }
  protected hostelAddress(h: HostelDetail): string {
    return [h.area, h.city, h.state].filter(Boolean).join(', ') || '—';
  }
  /** Up to two initials for the host avatar, e.g. 'Alice Example' → 'AE'. */
  protected initials(name: string): string {
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('') || '?'
    );
  }
  /** 'Joined' month + year, e.g. 'Jun 2026'. */
  protected joinedLabel(iso: string): string {
    try { return format(parseISO(iso), 'MMM yyyy'); } catch { return ''; }
  }
}

/** Capitalise the first letter (e.g. 'building' → 'Building', 'co-living' → 'Co-living'). */
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
