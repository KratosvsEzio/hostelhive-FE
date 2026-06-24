import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { format, parseISO } from 'date-fns';
import { DecimalPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, map, of, startWith, switchMap } from 'rxjs';
import { HostelDetail, User } from '@hostelhive/data-access';
import { HostelsApi, UsersApi } from '@services';
import {
  Button,
  Card,
  DateRange,
  DateRangePicker,
  DropdownOption,
  EmptyState,
  ErrorState,
  FilterChips,
  Search,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import type { StatusTone } from '@hostelhive/ui';
import { downloadCsv } from '@hostelhive/util';
import { AdminApi } from '@services';
import {
  Payment,
  PaymentAgg,
  PaymentFilter,
  PaymentStatusOption,
  PaymentsPage,
} from '@hostelhive/data-access';
import {
  DetailState,
  loadDetail,
  resolveHostelImages,
} from '@features/admin/data/drawer-detail';
import { AdminShell } from '@features/admin/admin-shell/admin-shell';
import { isNetworkError } from '@util/network-error';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: PaymentsPage | null;
}

/** Sortable columns — the value is the API property used in `sort[<field>]`. */
type SortField = 'created_at' | 'paid_at' | 'amount';

// Tone/dot per known payment status slug; statusMeta() falls back to neutral for anything else.
const STATUS_META: Record<string, { tone: StatusTone; dot: boolean }> = {
  pending: { tone: 'warn', dot: false },
  verified: { tone: 'ok', dot: true },
  rejected: { tone: 'danger', dot: false },
  paid: { tone: 'ok', dot: true },
  failed: { tone: 'danger', dot: false },
  refunded: { tone: 'neutral', dot: false },
};

/**
 * Payments console (mockup 28). Subscription payments from `GET /api/admin/payments`: status-filter
 * chips + stat cards (from the API's `aggs` / `possible_statuses`), server-side pagination, and
 * server-side sorting on Created / Paid / Amount (`sort[<field>]`) drive a reactive table; each row
 * opens a read-only detail drawer (payment, product, hostel, host).
 */
@Component({
  selector: 'hh-admin-payments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    AdminShell,
    Card,
    Button,
    FilterChips,
    Search,
    DateRangePicker,
    StatusPill,
    EmptyState,
    ErrorState,
    Skeleton,
  ],
  templateUrl: './admin-payments.html',
})
export class AdminPayments {
  private readonly api = inject(AdminApi);
  private readonly hostels = inject(HostelsApi);
  private readonly users = inject(UsersApi);

  protected readonly filter = signal<PaymentFilter>('all');
  protected readonly page = signal(1);
  protected readonly selected = signal<Payment | null>(null);
  protected readonly imgIndex = signal(0); // active slide in the drawer's hostel image carousel
  private readonly refresh = signal(0);

  // Hostel search: pick a field (name → s[hostel.name] full-text, id → f[hostel_id] exact) and
  // type a term. The term is debounced so typing doesn't fire a request per keystroke.
  protected readonly searchField = signal<'name' | 'id'>('name');
  protected readonly searchFieldOptions: DropdownOption[] = [
    { value: 'name', label: 'Hostel name' },
    { value: 'id', label: 'Hostel ID' },
  ];
  protected readonly searchTerm = signal('');
  private readonly debouncedTerm = toSignal(
    toObservable(this.searchTerm).pipe(
      debounceTime(300),
      map((t) => t.trim()),
    ),
    { initialValue: '' },
  );

  /** Created-date range filter (YYYY-MM-DD) → f[created_at][gte] / f[created_at][lte]. */
  protected readonly createdFrom = signal('');
  protected readonly createdTo = signal('');

  /** Active sort column + direction → `sort[<field>]=<dir>`. Defaults to newest-created first. */
  protected readonly sortField = signal<SortField>('created_at');
  protected readonly sortDir = signal<'asc' | 'desc'>('desc');

  /** Status tabs + stat-card aggregates from the payments response, persisted so they don't
   *  flicker while the list re-fetches. */
  protected readonly statuses = signal<PaymentStatusOption[]>([]);
  protected readonly aggs = signal<PaymentAgg[]>([]);
  protected readonly tabs = computed<{ label: string; value: PaymentFilter }[]>(
    () => [
      { label: 'All', value: 'all' },
      ...this.statuses().map((s) => ({ label: s.name, value: s.slug })),
    ],
  );

  private readonly query = computed(() => {
    this.refresh();
    return {
      filter: this.filter(),
      page: this.page(),
      field: this.sortField(),
      dir: this.sortDir(),
      searchField: this.searchField(),
      term: this.debouncedTerm(),
      createdFrom: this.createdFrom(),
      createdTo: this.createdTo(),
    };
  });

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      switchMap((q) => {
        const search = q.term
          ? q.searchField === 'id'
            ? { hostelId: q.term }
            : { hostelName: q.term }
          : undefined;
        const dateRange =
          q.createdFrom || q.createdTo
            ? { createdFrom: q.createdFrom, createdTo: q.createdTo }
            : undefined;
        return this.api
          .payments(
            q.filter,
            q.page,
            { field: q.field, dir: q.dir },
            search,
            dateRange,
          )
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

  /** Condensed page list with ellipses, e.g. [1, 2, 3, -1, 14]. */
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

  /* ---- drawer sub-details: hostel + host, fetched reactively for the open payment ---- */
  private readonly selectedHostelId = computed(
    () => this.selected()?.hostelId ?? null,
  );
  private readonly selectedHostId = computed(
    () => this.selected()?.hostId ?? null,
  );

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
  protected readonly currentImageIndex = computed(() => {
    const n = this.hostelImages().length;
    return n ? Math.min(this.imgIndex(), n - 1) : 0;
  });

  protected readonly canExport = computed(
    () => (this.state().data?.items.length ?? 0) > 0,
  );

  protected setFilter(f: PaymentFilter): void {
    if (f === this.filter()) return;
    this.filter.set(f);
    this.page.set(1); // a new filter starts from page 1
  }
  protected onSearchTerm(term: string): void {
    this.searchTerm.set(term);
    this.page.set(1); // a new search starts from page 1
  }
  protected onSearchField(field: string | string[] | null): void {
    if (field !== 'name' && field !== 'id') return; // ignore clear / unexpected values
    this.searchField.set(field);
    this.page.set(1);
  }
  protected onDateRange(r: DateRange): void {
    this.createdFrom.set(r.from ?? '');
    this.createdTo.set(r.to ?? '');
    this.page.set(1); // a new range starts from page 1
  }
  protected clearDateRange(): void {
    this.createdFrom.set('');
    this.createdTo.set('');
    this.page.set(1);
  }
  protected goToPage(p: number): void {
    if (p < 1 || p > this.totalPages() || p === this.page()) return;
    this.page.set(p);
  }
  /** Toggle direction when re-clicking the active column, else switch column (newest/highest first). */
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
  protected slideImg(dir: number): void {
    const n = this.hostelImages().length;
    if (n <= 1) return;
    this.imgIndex.set((((this.currentImageIndex() + dir) % n) + n) % n);
  }
  protected goImg(i: number): void {
    this.imgIndex.set(i);
  }

  protected open(p: Payment): void {
    this.selected.set(p);
    this.imgIndex.set(0); // reset the hostel image carousel for the newly opened payment
  }
  protected close(): void {
    this.selected.set(null);
  }
  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  /** CSV export of the currently-loaded page — client-side Blob download (no package). */
  protected exportCsv(): void {
    const rows = this.state().data?.items ?? [];
    if (!rows.length) return;

    downloadCsv(
      `hostelhive-payments-${this.filter()}-p${this.page()}`,
      [
        'Payment',
        'Host',
        'Plan',
        'Method',
        'Transaction ID',
        'Status',
        'Amount (PKR)',
      ],
      rows.map((p) => [
        p.id,
        p.host,
        p.plan ?? '',
        this.methodLabel(p.method),
        p.transactionId ?? '',
        p.statusName,
        p.amount,
      ]),
    );
  }

  protected statusMeta(slug: string): { tone: StatusTone; dot: boolean } {
    return STATUS_META[slug] ?? { tone: 'neutral', dot: false };
  }

  /** Title-case the raw backend method, e.g. 'online' → 'Online'. */
  protected methodLabel(m: string): string {
    return m ? m.charAt(0).toUpperCase() + m.slice(1) : '—';
  }
  /** Humanise the raw product type for the badge, e.g. 'add_on' → 'add on' (the template's
   *  `capitalize` then renders it as 'Add On'); 'subscription' stays 'subscription' → 'Subscription'. */
  protected productTypeLabel(t: string): string {
    return t.replace(/[_-]+/g, ' ');
  }
  /** e.g. 'Jun 8, 2026'; '—' when absent. */
  protected dateLabel(iso: string | null): string {
    if (!iso) return '—';
    try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return '—'; }
  }

  protected hostelTypeLabel(h: HostelDetail): string {
    return [h.gender_type, h.property_type]
      .filter(Boolean)
      .map(cap)
      .join(' · ');
  }
  protected hostelAddress(h: HostelDetail): string {
    return [h.area, h.city, h.state].filter(Boolean).join(', ') || '—';
  }
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
  protected joinedLabel(iso: string): string {
    try { return format(parseISO(iso), 'MMM yyyy'); } catch { return ''; }
  }


  /** Accent colour for a stat-card count, by status slug. */
  protected aggTextClass(slug: string): string {
    switch (slug) {
      case 'verified':
        return 'text-ok';
      case 'pending':
        return 'text-warn';
      case 'rejected':
        return 'text-danger';
      default:
        return 'text-ink-900';
    }
  }
}

/** Capitalise the first letter (e.g. 'building' → 'Building', 'co-living' → 'Co-living'). */
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
