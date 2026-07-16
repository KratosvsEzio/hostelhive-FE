import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { format, parseISO } from 'date-fns';
import { ActivatedRoute, Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, map, of, startWith, switchMap } from 'rxjs';
import {
  AdminListing,
  AdminListingAgg,
  AdminListingStatusOption,
  AdminListingsPage,
} from '@hostelhive/data-access';
import { AdminApi } from '@services';
import {
  Button,
  Card,
  DataTable,
  DropdownOption,
  EmptyState,
  ErrorState,
  FilterGroup,
  FilterValues,
  GlobalFilter,
  NestedSelectValue,
  PaginationConfig,
  Search,
  Skeleton,
  SortState,
} from '@hostelhive/ui';
import type { StatusTone } from '@hostelhive/ui';
import { AdminShell } from '@features/admin/admin-shell/admin-shell';
import { isNetworkError } from '@util/network-error';
import { ADMIN_LISTINGS_TABLE_COLS } from '@app/util/table-configs/admin-listings-table-cols';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: AdminListingsPage | null;
}

type SortField = 'created_at' | 'starting_price';

const DISPOSITION_META: Record<
  string,
  { tone: StatusTone; label: string; dot: boolean }
> = {
  published: { tone: 'ok', label: 'Published', dot: true },
  'in-review': { tone: 'warn', label: 'In review', dot: false },
  'pending-review': { tone: 'warn', label: 'In review', dot: false },
  changes: { tone: 'warn', label: 'Changes requested', dot: false },
  paused: { tone: 'neutral', label: 'Paused', dot: false },
  rejected: { tone: 'danger', label: 'Rejected', dot: false },
  removed: { tone: 'danger', label: 'Removed', dot: false },
  draft: { tone: 'neutral', label: 'Draft', dot: false },
  active: { tone: 'ok', label: 'Active', dot: true },
};

@Component({
  selector: 'hh-admin-listings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    AdminShell,
    Button,
    Card,
    DataTable,
    EmptyState,
    ErrorState,
    GlobalFilter,
    Search,
    Skeleton,
  ],
  templateUrl: './admin-listings.html',
})
export class AdminListings {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly statusFilter = signal<string | null>(null);
  protected readonly dispositionFilter = signal<string | null>(null);
  protected readonly globalFilters = signal<FilterValues>({});
  protected readonly page = signal(1);
  protected readonly searchField = signal<'name' | 'id'>('name');
  protected readonly searchFieldOptions: DropdownOption[] = [
    { value: 'name', label: 'Hostel name' },
    { value: 'id', label: 'Hostel ID' },
  ];
  protected readonly searchTerm = signal('');
  protected readonly sortField = signal<SortField>('created_at');
  protected readonly sortDir = signal<'asc' | 'desc'>('desc');
  private readonly refresh = signal(0);

  protected readonly statuses = signal<AdminListingStatusOption[]>([]);
  protected readonly aggs = signal<AdminListingAgg[]>([]);

  protected readonly filterGroups = computed<FilterGroup[]>(() => [
    {
      key: 'status',
      label: 'Status',
      icon: 'ti-tag',
      fields: [{
        key: 'status',
        type: 'nested-select',
        nestedGroups: this.statuses().map((s) => ({
          value: s.slug,
          label: s.name,
          items: (s.dispositions ?? []).map((d) => ({ value: d.slug, label: d.name })),
        })),
      }],
    },
  ]);


  private readonly debouncedTerm = toSignal(
    toObservable(this.searchTerm).pipe(
      debounceTime(300),
      map((t) => t.trim()),
    ),
    { initialValue: '' },
  );

  private readonly query = computed(
    () => {
      this.refresh();
      return {
        statusSlug: this.statusFilter(),
        dispositionSlug: this.dispositionFilter(),
        page: this.page(),
        searchField: this.searchField(),
        term: this.debouncedTerm(),
        sortField: this.sortField(),
        sortDir: this.sortDir(),
      };
    },
    {
      equal: (a, b) =>
        a.statusSlug === b.statusSlug &&
        a.dispositionSlug === b.dispositionSlug &&
        a.page === b.page &&
        a.searchField === b.searchField &&
        a.term === b.term &&
        a.sortField === b.sortField &&
        a.sortDir === b.sortDir,
    },
  );

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      switchMap((q) =>
        this.api
          .listings(
            q.statusSlug ?? 'all',
            q.page,
            q.term ? { [q.searchField]: q.term } : undefined,
            { field: q.sortField, dir: q.sortDir },
            q.dispositionSlug,
          )
          .pipe(
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

  private readonly _persistMeta = effect(() => {
    const d = this.state().data;
    if (d?.statuses.length) this.statuses.set(d.statuses);
    if (d?.aggs.length) this.aggs.set(d.aggs);
  });

  protected readonly totalPages = computed(() => {
    const d = this.state().data;
    if (!d) return 1;
    return Math.max(1, d.totalPages ?? Math.ceil(d.total / (d.pageSize || 1)));
  });

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

  protected goToPage(p: number): void {
    if (p < 1 || p > this.totalPages() || p === this.page()) return;
    this.page.set(p);
  }

  protected applyGlobalFilters(v: FilterValues): void {
    const ns = v['status'] as NestedSelectValue | undefined;
    this.statusFilter.set(ns?.group ?? null);
    this.dispositionFilter.set(ns?.item ?? null);
    this.page.set(1);
  }

  protected clearFilters(): void {
    this.statusFilter.set(null);
    this.dispositionFilter.set(null);
    this.globalFilters.set({});
    this.searchField.set('name');
    this.searchTerm.set('');
    this.page.set(1);
  }

  protected onSearchTerm(term: string): void {
    this.searchTerm.set(term);
    this.page.set(1);
  }

  protected onSearchField(field: string | string[] | null): void {
    this.searchField.set(field === 'id' ? 'id' : 'name');
    this.searchTerm.set('');
    this.page.set(1);
  }

  protected readonly tableCols = ADMIN_LISTINGS_TABLE_COLS;
  protected readonly listingsRowId = (row: unknown) => String((row as AdminListing).id);

  protected readonly tableSortState = computed<SortState>(() => ({
    key: this.sortField(),
    dir: this.sortDir(),
  }));

  protected readonly listingsPaginationConf = computed<PaginationConfig | null>(() => {
    const d = this.state().data;
    if (!d || this.totalPages() <= 1) return null;
    return {
      page: this.page(),
      total: d.total,
      totalPages: this.totalPages(),
      hasNextPage: this.page() < this.totalPages(),
      itemLabel: 'listing',
    };
  });

  protected onTableSort(s: SortState | null): void {
    if (!s) { this.sortField.set('created_at'); this.sortDir.set('desc'); }
    else { this.sortField.set(s.key as SortField); this.sortDir.set(s.dir); }
    this.page.set(1);
  }

  protected onRowClick(row: unknown): void {
    this.router.navigate(['../review', (row as AdminListing).id], { relativeTo: this.route });
  }

  protected toggleSort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortField.set(field);
      this.sortDir.set('desc');
    }
    this.page.set(1);
  }

  protected sortIcon(field: SortField): string {
    if (this.sortField() !== field) return 'ti-arrows-sort text-ink-300';
    return this.sortDir() === 'asc' ? 'ti-arrow-up' : 'ti-arrow-down';
  }

  protected aggTextClass(slug: string): string {
    switch (slug) {
      case 'active': return 'text-ok';
      case 'inactive': return 'text-ink-400';
      default: return 'text-warn';
    }
  }

  protected aggSubline(a: AdminListingAgg): string {
    return a.dispositions
      .filter((d) => d.count > 0)
      .map((d) => `${d.count} ${d.name}`)
      .join(' · ') || '—';
  }

  protected statusMeta(
    l: AdminListing,
  ): { tone: StatusTone; label: string; dot: boolean } {
    const slug = l.dispositionSlug ?? l.statusSlug;
    return (
      DISPOSITION_META[slug] ?? {
        tone: 'neutral' as StatusTone,
        label: slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : '—',
        dot: false,
      }
    );
  }

  protected typeLabel(l: AdminListing): string {
    return [cap(l.genderType), cap(l.propertyType)].filter(Boolean).join(' · ');
  }

  protected locationLabel(l: AdminListing): string {
    return [l.city, l.area].filter(Boolean).join(' · ') || l.state || '—';
  }

  protected dateLabel(iso: string | null): string {
    if (!iso) return '—';
    try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return '—'; }
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
