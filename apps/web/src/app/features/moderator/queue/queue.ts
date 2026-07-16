import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, filter, map, of, startWith, switchMap } from 'rxjs';
import {
  DataTable,
  DropdownOption,
  EmptyState,
  ErrorState,
  PaginationConfig,
  Search,
  Skeleton,
  SortState,
} from '@hostelhive/ui';
import { ModerationApi } from '@services';
import { QueueItem } from '@hostelhive/data-access';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';
import { QUEUE_TABLE_COLS } from '@app/util/table-configs/queue-table-cols';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: { items: QueueItem[]; total: number; totalPages: number } | null;
}

const PAGE_SIZE = 10;

@Component({
  selector: 'hh-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, DataTable, EmptyState, ErrorState, Search, Skeleton],
  templateUrl: './queue.html',
})
export class Queue {
  private readonly api = inject(ModerationApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly skeletons = [1, 2, 3, 4];

  protected readonly searchField = signal<'name' | 'host' | 'city'>('name');
  protected readonly searchFieldOptions: DropdownOption[] = [
    { value: 'name', label: 'Hostel name' },
    { value: 'host', label: 'Host' },
    { value: 'city', label: 'City' },
  ];
  protected readonly searchTerm = signal('');

  protected readonly page = signal(1);
  private readonly refresh = signal(0);
  protected readonly sortDir = signal<'asc' | 'desc' | null>('asc');

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly query = computed(() => ({
    r: this.refresh(),
    sort: this.sortDir(),
    page: this.page(),
    searchField: this.searchField(),
    searchTerm: this.searchTerm(),
  }));

  // Re-fetch whenever refresh counter, sort direction, page, or search changes.
  // Skip entirely during SSR � no auth token is available server-side, so the
  // request would fail and bake an error state into the SSR HTML.
  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      filter(() => this.isBrowser),
      debounceTime(300),
      switchMap((q) =>
        this.api.queue(q.page, PAGE_SIZE, q.sort, q.searchField, q.searchTerm).pipe(
          map(({ items, total, totalPages }): ViewState => ({ loading: false, error: false, networkError: false, data: { items, total, totalPages } })),
          startWith<ViewState>({ loading: true, error: false, networkError: false, data: null }),
          catchError((err) =>
            of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null }),
          ),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  protected readonly visible = computed(() => this.state().data?.items ?? []);

  constructor() {
    // Reset to page 1 whenever the search changes.
    effect(() => {
      this.searchTerm();
      this.searchField();
      this.page.set(1);
    });
  }

  protected onSearchTerm(term: string): void {
    this.searchTerm.set(term);
  }

  protected onSearchField(field: string | string[] | null): void {
    this.searchField.set((field as 'name' | 'host' | 'city') ?? 'name');
  }

  protected queueTone(hours: number): 'ok' | 'warn' | 'danger' {
    if (hours >= 48) return 'danger';
    if (hours >= 24) return 'warn';
    return 'ok';
  }

  protected queueLabel(hours: number): string {
    if (hours >= 24) {
      const days = Math.round(hours / 24);
      return `${days} day${days === 1 ? '' : 's'}`;
    }
    return `${hours} hr${hours === 1 ? '' : 's'}`;
  }

  protected readonly tableCols = QUEUE_TABLE_COLS;
  protected readonly queueRowId = (row: unknown) => (row as QueueItem).id;

  protected readonly queueSortState = computed<SortState | null>(() => {
    const d = this.sortDir();
    return d ? { key: 'hoursInQueue', dir: d } : null;
  });

  protected readonly queuePaginationConf = computed<PaginationConfig | null>(() => {
    const d = this.state().data;
    if (!d || d.totalPages <= 1) return null;
    return {
      page: this.page(),
      total: d.total,
      totalPages: d.totalPages,
      hasNextPage: this.page() < d.totalPages,
      itemLabel: 'item',
    };
  });

  protected onQueueSort(s: SortState | null): void {
    this.sortDir.set(s ? s.dir : null);
    this.page.set(1);
  }

  protected onQueueRowClick(row: unknown): void {
    this.router.navigate(['../review', (row as QueueItem).id], { relativeTo: this.route });
  }

  protected toggleSort(): void {
    const next =
      this.sortDir() === null ? 'asc' : this.sortDir() === 'asc' ? 'desc' : null;
    this.sortDir.set(next);
    this.page.set(1);
  }

  protected sortIcon(): string {
    const d = this.sortDir();
    if (d === 'asc') return 'ti-arrow-up';
    if (d === 'desc') return 'ti-arrow-down';
    return 'ti-arrows-sort';
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
