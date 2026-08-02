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
} from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { NotificationService } from '@core/notification.service';
import { toToastCopy } from '@core/errors/api-error-message';
import { ApiError } from '@hostelhive/data-access';
import { expensesTableCols } from '@app/util/table-configs/expenses-table-cols';
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
      .expenseTypes.filter((t) => t.slug !== 'mess')
      .map((t) => ({ value: t.slug, label: t.name })),
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

  // ── list — fetched once per land (keyed on hostel + a retry counter) ────────
  private readonly fetchKey = computed(() => ({ hostelId: this.hostelId(), refresh: this.refresh() }));
  private readonly state = toSignal(
    toObservable(this.fetchKey).pipe(
      switchMap(({ hostelId }) => {
        if (!hostelId) return of<ListState>({ loading: true, error: false, items: [] });
        return this.hostelsApi.listExpenses(hostelId).pipe(
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
  /** All fetched expenses (unfiltered) — feeds the last-12-months charts. */
  protected readonly allItems = computed(() => this.state().items);

  // ── delete ──────────────────────────────────────────────────────────────
  /** The expense awaiting delete confirmation — drives the confirm modal. */
  protected readonly deletePending = signal<ExpenseListItem | null>(null);
  /** Optimistically-removed ids — hidden from the list at once, restored on failure. */
  private readonly deletedIds = signal<ReadonlySet<string>>(new Set());

  // ── row action menu ─────────────────────────────────────────────────────
  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly menuPos = signal<{ top: number; right: number } | null>(null);

  /** Type + date-range filter (and optimistic deletes), applied client-side. */
  protected readonly items = computed(() => {
    const type = this.typeFilter();
    const from = this.fromDate();
    const to = this.toDate();
    const deleted = this.deletedIds();
    return this.allItems().filter((e) => {
      if (deleted.has(e.id)) return false;
      if (type && e.expenseType !== type) return false;
      const day = (e.date || '').slice(0, 10); // 'yyyy-MM-dd' prefix of the ISO date
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
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
