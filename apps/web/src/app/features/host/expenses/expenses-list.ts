import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, fromEvent, map, of, startWith, switchMap } from 'rxjs';
import { format } from 'date-fns';
import {
  Button,
  ConfirmModal,
  ContextMenu,
  ContextMenuDivider,
  DataTable,
  DateRange,
  DateRangePicker,
  Dropdown,
  DropdownOption,
  EmptyState,
  ErrorState,
  Skeleton,
  SortState,
} from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { NotificationService } from '@core/notification.service';
import { toToastCopy } from '@core/errors/api-error-message';
import { ApiError } from '@hostelhive/data-access';
import { expensesTableCols } from '@app/util/table-configs/expenses-table-cols';
import { dayRangeStart, dayRangeEnd } from '@util/date-range-filter';
import { ExpenseCharts } from './expense-charts';
import {
  ExpenseFormOptions,
  ExpenseListItem,
  HostelsApi,
  HostPropertyStore,
} from '@services';

interface ListState {
  loading: boolean;
  error: boolean;
  items: ExpenseListItem[];
}

/**
 * Host expenses list — a data table (matching the tenants list). Fetches all expenses once
 * per landing (keyed on the hostel), filters by expense type + date range client-side (the
 * endpoint's `f[...]` params don't cover these), and offers per-row view / edit / delete.
 */
@Component({
  selector: 'hh-expenses-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    RouterLink,
    DashboardLayout,
    Button,
    Dropdown,
    DateRangePicker,
    DataTable,
    ContextMenu,
    ContextMenuDivider,
    EmptyState,
    ErrorState,
    Skeleton,
    ConfirmModal,
    ExpenseCharts,
  ],
  templateUrl: './expenses-list.html',
})
export class ExpensesList {
  private readonly hostelsApi = inject(HostelsApi);
  private readonly propertyStore = inject(HostPropertyStore);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly todayIso = format(new Date(), 'yyyy-MM-dd');

  /** Absolute base for navigation, matching the app convention (`/host/:id/expenses`). */
  protected readonly base = computed(() => `/host/${this.propertyStore.selected()}/expenses`);

  // ── filters ─────────────────────────────────────────────────────────────
  protected readonly typeFilter = signal(''); // '' = all types
  protected readonly fromDate = signal<string | null>(null);
  protected readonly toDate = signal<string | null>(null);
  protected readonly hasFilters = computed(
    () => !!this.typeFilter() || !!this.fromDate() || !!this.toDate(),
  );

  private readonly refresh = signal(0);
  private readonly hostelId = computed(() =>
    this.propertyStore.properties().length > 0 ? this.propertyStore.selected() : '',
  );

  // Expense-type options, reused for the filter dropdown and the table's Type column labels.
  private readonly formOptions = toSignal(
    toObservable(this.hostelId).pipe(
      switchMap((id) => {
        const empty: ExpenseFormOptions = { expenseTypes: [], itemUnits: [] };
        return id
          ? this.hostelsApi.expenseFormOptions(id).pipe(catchError(() => of(empty)))
          : of(empty);
      }),
    ),
    { initialValue: { expenseTypes: [], itemUnits: [] } as ExpenseFormOptions },
  );

  protected readonly typeOptions = computed<DropdownOption[]>(() => [
    { value: '', label: 'All types' },
    ...this.formOptions()
      .expenseTypes.map((t) => ({ value: t.slug, label: t.name })),
  ]);

  private readonly typeLabels = computed(() => {
    const m: Record<string, string> = {};
    for (const t of this.formOptions().expenseTypes) m[t.slug] = t.name;
    return m;
  });

  // ── table ───────────────────────────────────────────────────────────────
  /** Columns are recomputed when the slug→label map loads, so the table re-renders with names. */
  protected readonly tableCols = computed(() => expensesTableCols(this.typeLabels()));
  protected readonly rowId = (row: unknown) => (row as ExpenseListItem).id;
  protected readonly menuActionActive = (row: unknown) =>
    this.menuOpenId() === (row as ExpenseListItem).id;

  // ── list — re-fetched when hostel, type filter, date range, or retry counter changes ──
  private readonly fetchKey = computed(() => ({
    hostelId: this.hostelId(),
    type: this.typeFilter(),
    from: this.fromDate(),
    to: this.toDate(),
    refresh: this.refresh(),
  }));
  private readonly state = toSignal(
    toObservable(this.fetchKey).pipe(
      switchMap(({ hostelId, type, from, to }) => {
        if (!hostelId) return of<ListState>({ loading: true, error: false, items: [] });
        const params: Record<string, string> = {};
        if (type) params['f[expense_type]'] = type;
        // Date range is filtered server-side, with the day spanned start-to-end (00:00:00 → 23:59:59)
        // so same-day rows aren't excluded and older rows past the page-size cap are still reachable.
        if (from) params['f[expense_date][gte]'] = dayRangeStart(from);
        if (to) params['f[expense_date][lte]'] = dayRangeEnd(to);
        return this.hostelsApi.listExpenses(hostelId, params).pipe(
          map((r): ListState => ({ loading: false, error: false, items: r.items })),
          startWith<ListState>({ loading: true, error: false, items: [] }),
          catchError(() => of<ListState>({ loading: false, error: true, items: [] })),
        );
      }),
    ),
    { initialValue: { loading: true, error: false, items: [] } as ListState },
  );

  protected readonly loading = computed(() => this.state().loading);
  protected readonly error = computed(() => this.state().error);
  /** All fetched expenses for the active type + date range — feeds the charts (which follow
   *  the selected range) and, minus optimistic deletes, the table. */
  protected readonly allItems = computed(() => this.state().items);

  // ── delete ──────────────────────────────────────────────────────────────
  /** The expense awaiting delete confirmation — drives the confirm modal. */
  protected readonly deletePending = signal<ExpenseListItem | null>(null);
  /** Optimistically-removed ids — hidden from the list at once, restored on failure. */
  private readonly deletedIds = signal<ReadonlySet<string>>(new Set());

  // ── row action menu ─────────────────────────────────────────────────────
  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly menuPos = signal<{ top: number; right: number } | null>(null);

  /** Table sort — Amount, Date and Created-at are sortable; defaults to newest-created first. */
  protected readonly sortState = signal<SortState | null>({ key: 'createdAt', dir: 'desc' });
  protected onSort(s: SortState | null): void {
    this.sortState.set(s);
  }

  /** Optimistic deletes, then the active sort — client-side. Type and date-range filtering
   *  are server-side (`f[expense_type]`, `f[expense_date][gte|lte]`). */
  protected readonly items = computed(() => {
    const deleted = this.deletedIds();
    const sort = this.sortState();
    const filtered = deleted.size
      ? this.allItems().filter((e) => !deleted.has(e.id))
      : this.allItems();
    if (!sort) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    // Dates parse to Date so the response's mixed UTC/offset ISO strings compare chronologically
    // (lexicographic would misorder `+05:00` vs `Z`); amount compares numerically.
    const compare = (a: ExpenseListItem, b: ExpenseListItem): number => {
      switch (sort.key) {
        case 'amount': return a.amount - b.amount;
        case 'date': return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'createdAt': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        default: return 0;
      }
    };
    return [...filtered].sort((a, b) => dir * compare(a, b));
  });

  constructor() {
    // Close the row menu when the page scrolls (its position is anchored to the trigger).
    fromEvent(window, 'scroll', { capture: true, passive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.closeMenu());
  }

  protected typeLabel(slug: string): string {
    return this.typeLabels()[slug] || slug;
  }

  protected displayDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : format(d, 'd MMM yyyy');
  }

  // ── filters ──
  protected onTypeFilter(v: string | string[] | null): void {
    if (typeof v === 'string') this.typeFilter.set(v);
  }

  protected onDateRange(range: DateRange): void {
    this.fromDate.set(range.from);
    this.toDate.set(range.to);
  }

  protected clearFilters(): void {
    this.typeFilter.set('');
    this.fromDate.set(null);
    this.toDate.set(null);
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  // ── navigation + row menu ──
  protected goToDetail(row: ExpenseListItem): void {
    this.closeMenu();
    void this.router.navigate([this.base(), row.id]);
  }

  protected goToEdit(row: ExpenseListItem): void {
    this.closeMenu();
    void this.router.navigate([this.base(), row.id, 'edit']);
  }

  protected onRowAction(ev: { row: unknown; event: MouseEvent }): void {
    this.toggleMenu((ev.row as ExpenseListItem).id, ev.event);
  }

  protected toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    if (this.menuOpenId() === id) {
      this.closeMenu();
      return;
    }
    this.menuOpenId.set(id);
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuPos.set({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  protected closeMenu(): void {
    this.menuOpenId.set(null);
    this.menuPos.set(null);
  }

  // ── delete ──
  protected askDelete(e: ExpenseListItem): void {
    this.closeMenu();
    this.deletePending.set(e);
  }

  protected confirmDelete(): void {
    const e = this.deletePending();
    const hostelId = this.propertyStore.selected();
    if (!e || !hostelId) return;

    // Optimistic: hide the row and close the modal, then delete in the background.
    this.deletedIds.update((s) => new Set(s).add(e.id));
    this.deletePending.set(null);

    this.hostelsApi.deleteExpense(hostelId, e.id).subscribe({
      error: (err: ApiError) => {
        this.deletedIds.update((s) => {
          const n = new Set(s);
          n.delete(e.id);
          return n;
        });
        const { title, message } = toToastCopy(err);
        this.notifications.show({ kind: 'error', title, message }, 0);
      },
    });
  }

  protected cancelDelete(): void {
    this.deletePending.set(null);
  }
}
