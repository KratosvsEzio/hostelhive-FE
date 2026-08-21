import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { format } from 'date-fns';
import {
  BarChart,
  BarChartBar,
  BarChartTick,
  Button,
  ConfirmModal,
  ContextMenu,
  ContextMenuDivider,
  DataTable,
  EmptyState,
  PaginationConfig,
  Skeleton,
  TabItem,
  Tabs,
} from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { NotificationService } from '@core/notification.service';
import { MobileApp } from '@core/mobile-app';
import { toToastCopy } from '@core/errors/api-error-message';
import { ApiError } from '@hostelhive/data-access';
import {
  DailyMealConfirmation,
  ExpenseListItem,
  GroceryExpenseStat,
  HostelsApi,
  HostPropertyStore,
  MessOverviewCards,
} from '@services';
import { MessService } from './mess.service';
import { MEAL_META, MEAL_ORDER, MealType } from './mess-notifications.service';
import { GROCERY_TABLE_COLS } from '@app/util/table-configs/grocery-table-cols';
import { PAGE_SIZE } from '@util/pagination';

/** View state for the KPI cards fetched from `mess_overview_cards`. */
interface OverviewState {
  loading: boolean;
  error: boolean;
  data: MessOverviewCards | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface SpendPoint { label: string; value: number }
interface ChartTick  { value: number; bottomPct: number; label: string }
interface ChartBar   { label: string; value: number; pct: number }

// ── Area chart ───────────────────────────────────────────────────────────────
interface DayData {
  dayLabel: string;
  tooltipLabel: string;
  breakfast: number;
  lunch: number;
  dinner: number;
}

interface AreaChart {
  days: DayData[];
  paths: Record<MealType, { area: string; line: string }>;
  ticks: { value: number; y: number; label: string }[];
  pointsX: number[];
  pointsY: Record<MealType, number[]>;
  /** Per-day flag for "draw this day's x-axis label" — see {@link labelFlags}. */
  showLabel: boolean[];
}

/**
 * Which days get an x-axis label: every `step`th, plus the final day so the range always
 * reads end-to-end. The last stepped label is dropped when the final one would land on top
 * of it — otherwise a series whose length isn't a multiple of `step` renders the two
 * overprinted (e.g. "14 Aug" over "16 Aug" on a 31-day series at step 7).
 */
function labelFlags(n: number, step: number): boolean[] {
  const flags = new Array<boolean>(n).fill(false);
  if (n === 0) return flags;

  const stepped: number[] = [];
  for (let i = 0; i < n; i += step) stepped.push(i);

  const last = n - 1;
  if (stepped.length && last - stepped[stepped.length - 1] < step * 0.6) stepped.pop();
  if (last > 0) stepped.push(last);

  for (const i of stepped) flags[i] = true;
  return flags;
}

/** Blank grocery page — shared by the initial value, the loading frame and the error frame. */
const EMPTY_EXPENSES = {
  loading: true,
  error: false,
  items: [] as ExpenseListItem[],
  total: 0,
  totalPages: 1,
};


/**
 * SVG geometry for the confirmations area chart, in CSS pixels.
 *
 * The viewBox is derived from the element's *measured* width so it always renders 1:1.
 * A fixed viewBox is only correct at one container width: a 600-unit box in the desktop
 * two-column grid renders ~382px wide, scaling every 10px label down to 6.4px, which is
 * why this chart read as tiny next to the grocery chart (plain HTML, so its 10px text is
 * always 10px). Deriving the box means font sizes here mean the same thing they do there.
 */
interface ChartGeom {
  vw: number;
  vh: number;
  /** Plot insets: left, right, top, bottom. */
  cl: number;
  cr: number;
  ct: number;
  cb: number;
  font: number;
  /** Baseline for the x-axis day labels. */
  labelY: number;
  tipW: number;
  tipH: number;
  /** Half-width of a day's invisible hover/tap strip. */
  hitHalf: number;
}

/** Plot height in px, matching the grocery chart's 10rem so the two cards sit level. */
const PLOT_H = 160;

function geomFor(width: number, phone: boolean): ChartGeom {
  const vw = Math.max(240, Math.round(width));
  const font = phone ? 11 : 10;
  const ct = 14;
  const cb = ct + (phone ? PLOT_H + 40 : PLOT_H);
  return {
    vw,
    vh: cb + 24,
    cl: 30,
    cr: vw - 6,
    ct,
    cb,
    font,
    labelY: cb + 16,
    tipW: 112,
    tipH: 78,
    hitHalf: Math.max(4, Math.round((vw - 36) / 60)),
  };
}
const AREA_FILL = 1.0;

function niceAxis(peak: number): { step: number; ceiling: number } {
  const rawStep = peak / 5;
  const exp = Math.pow(10, Math.floor(Math.log10(Math.max(1, rawStep))));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * exp).find((s) => s >= rawStep) ?? rawStep;
  return { step, ceiling: step * 5 };
}

function smoothLine(xs: number[], ys: number[]): string {
  let d = `M ${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 1; i < xs.length; i++) {
    const cpx = ((xs[i - 1] + xs[i]) / 2).toFixed(1);
    d += ` C ${cpx},${ys[i - 1].toFixed(1)} ${cpx},${ys[i].toFixed(1)} ${xs[i].toFixed(1)},${ys[i].toFixed(1)}`;
  }
  return d;
}

/** Build the trend chart straight from the backend's daily series (one point per day). */
function buildAreaChart(series: DailyMealConfirmation[], g: ChartGeom): AreaChart {
  const CL = g.cl, CB = g.cb;
  const CW = g.cr - g.cl;
  const CH = g.cb - g.ct;
  const days: DayData[] = series.map((d) => {
    // Parse as local midnight so the day label never shifts across the date line.
    const label = format(new Date(d.date + 'T00:00:00'), 'd MMM');
    return { dayLabel: label, tooltipLabel: label, breakfast: d.breakfast, lunch: d.lunch, dinner: d.dinner };
  });

  const n = days.length;
  const peak = Math.max(1, ...days.flatMap((d) => [d.breakfast, d.lunch, d.dinner]));
  const { step, ceiling } = niceAxis(peak);
  const yFor = (v: number) => CB - (v / ceiling) * CH * AREA_FILL;
  const pointsX = Array.from({ length: n }, (_, i) =>
    n <= 1 ? CL + CW / 2 : CL + (i / (n - 1)) * CW,
  );

  const pointsY: Record<MealType, number[]> = {
    breakfast: days.map((d) => yFor(d.breakfast)),
    lunch:     days.map((d) => yFor(d.lunch)),
    dinner:    days.map((d) => yFor(d.dinner)),
  };

  const makePath = (ys: number[]) => {
    if (!n) return { line: '', area: '' };
    const line = smoothLine(pointsX, ys);
    return { line, area: `${line} L ${pointsX[n - 1].toFixed(1)},${CB} L ${pointsX[0].toFixed(1)},${CB} Z` };
  };

  const ticks: AreaChart['ticks'] = [];
  for (let v = 0; v <= ceiling + step * 0.001; v += step) {
    ticks.push({ value: Math.round(v), y: yFor(v), label: String(Math.round(v)) });
  }

  return {
    days,
    paths: {
      breakfast: makePath(pointsY.breakfast),
      lunch:     makePath(pointsY.lunch),
      dinner:    makePath(pointsY.dinner),
    },
    ticks, pointsX, pointsY,
    // ~64px per label: enough for "17 Jul" at 10px without crowding.
    showLabel: labelFlags(n, Math.max(1, Math.ceil(n / Math.max(1, Math.floor(CW / 64))))),
  };
}

function buildSpendChart(
  points: SpendPoint[],
  maxFill = 88,
): { bars: ChartBar[]; ticks: ChartTick[] } {
  const rawPeak = Math.max(1, ...points.map((p) => p.value));
  const rawStep = rawPeak / 5;
  const exp = Math.pow(10, Math.floor(Math.log10(Math.max(1, rawStep))));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * exp).find((s) => s >= rawStep) ?? rawStep;
  const ceiling = step * 5;

  const bars: ChartBar[] = points.map((p) => ({
    label: p.label,
    value: p.value,
    pct: (p.value / ceiling) * maxFill,
  }));

  const ticks: ChartTick[] = [];
  for (let v = 0; v <= ceiling + step * 0.001; v += step) {
    ticks.push({
      value: Math.round(v),
      bottomPct: (v / ceiling) * maxFill,
      label: v === 0 ? '0' : v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v),
    });
  }
  return { bars, ticks };
}

@Component({
  selector: 'hh-mess-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    RouterLink,
    DashboardLayout,
    BarChart,
    Button,
    ConfirmModal,
    ContextMenu,
    ContextMenuDivider,
    DataTable,
    EmptyState,
    Skeleton,
    Tabs,
  ],
  templateUrl: './mess-list.html',
})
export class MessList {
  protected readonly svc = inject(MessService);
  private readonly hostelsApi = inject(HostelsApi);
  private readonly propertyStore = inject(HostPropertyStore);
  private readonly mobile = inject(MobileApp);

  protected readonly mealOrder = MEAL_ORDER;
  protected readonly mealMeta = MEAL_META;

  protected readonly chartMode = signal<'month' | 'day'>('month');

  // ── Area chart ─────────────────────────────────────────────────────────────
  protected readonly hoveredDayIndex = signal<number | null>(null);

  /** Measured width of the chart box, kept live by a ResizeObserver. */
  private readonly destroyRef = inject(DestroyRef);
  private readonly chartW = signal(600);
  private readonly chartBox = viewChild<ElementRef<HTMLElement>>('chartBox');

  /**
   * Keep the viewBox matched to the element's real width so the chart renders 1:1 and its
   * font sizes mean CSS pixels. An effect, not afterNextRender: the chart sits behind an
   * @if that only resolves once the data lands, so a one-shot hook runs while the element
   * does not exist yet. viewChild is a signal, so this re-runs the moment it appears.
   */
  private readonly _measureChart = effect((onCleanup) => {
    const el = this.chartBox()?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) this.chartW.set(w);
    });
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });

  protected readonly geom = computed(() =>
    geomFor(this.chartW(), this.mobile.isMobile()),
  );
  protected readonly chartViewBox = computed(() => {
    const g = this.geom();
    return `0 0 ${g.vw} ${g.vh}`;
  });

  protected readonly confirmAreaChart = computed(() =>
    buildAreaChart(this.dailyConfirmations(), this.geom()),
  );

  /** Resolved hovered-day data — null when nothing is hovered. */
  protected readonly hoveredDay = computed(() => {
    const idx = this.hoveredDayIndex();
    if (idx === null) return null;
    const chart = this.confirmAreaChart();
    return { idx, day: chart.days[idx], x: chart.pointsX[idx], y: chart.pointsY };
  });

  // ── KPI cards — driven by GET /mess_overview_cards ─────────────────────────
  // Waits for the host property store to resolve the selected hostel, then fetches its
  // aggregates. Charts + the entry list below still read the seeded services until they
  // get their own endpoints.
  private readonly overviewKey = computed(() =>
    this.propertyStore.properties().length > 0 ? this.propertyStore.selected() : '',
  );

  private readonly overview = toSignal(
    toObservable(this.overviewKey).pipe(
      switchMap((hostelId) => {
        if (!hostelId) {
          return of<OverviewState>({ loading: true, error: false, data: null });
        }
        return this.hostelsApi.messOverviewCards(hostelId).pipe(
          map((data): OverviewState => ({ loading: false, error: false, data })),
          startWith<OverviewState>({ loading: true, error: false, data: null }),
          catchError(() => of<OverviewState>({ loading: false, error: true, data: null })),
        );
      }),
    ),
    { initialValue: { loading: true, error: false, data: null } as OverviewState },
  );

  /**
   * 30-day daily meal-confirmation series from GET /daily_meal_confirmation, feeding the trend
   * chart. Shares the overviewKey (waits for the selected hostel); falls back to an empty series
   * on error/no-hostel — the chart renders a flat baseline rather than breaking.
   */
  private readonly dailyConfirmations = toSignal(
    toObservable(this.overviewKey).pipe(
      switchMap((hostelId) =>
        hostelId
          ? this.hostelsApi
              .dailyMealConfirmation(hostelId)
              .pipe(catchError(() => of<DailyMealConfirmation[]>([])))
          : of<DailyMealConfirmation[]>([]),
      ),
    ),
    { initialValue: [] as DailyMealConfirmation[] },
  );

  protected readonly cardsLoading = computed(() => this.overview().loading);
  protected readonly cardsError = computed(() => this.overview().error);

  protected readonly totalToday = computed(() => this.overview().data?.confirmations.total ?? 0);
  protected readonly mealCounts = computed<Record<MealType, number>>(() => {
    const byMeal = this.overview().data?.confirmations.byMeal ?? {};
    return {
      breakfast: byMeal['breakfast'] ?? 0,
      lunch: byMeal['lunch'] ?? 0,
      dinner: byMeal['dinner'] ?? 0,
    };
  });
  protected readonly monthlySpend = computed(() => this.overview().data?.expense.monthlySpend ?? 0);
  protected readonly entryCount = computed(() => this.overview().data?.expense.entryCount ?? 0);
  protected readonly totalSubscribers = computed(() => this.overview().data?.renters.totalUnique ?? 0);
  protected readonly renterCounts = computed<Record<MealType, number>>(() => {
    const byMeal = this.overview().data?.renters.byMeal ?? {};
    return {
      breakfast: byMeal['breakfast'] ?? 0,
      lunch: byMeal['lunch'] ?? 0,
      dinner: byMeal['dinner'] ?? 0,
    };
  });
  /** Mess charges invoiced last month (PKR) — the P&L revenue basis. */
  protected readonly lastMonthCharges = computed(() => this.overview().data?.invoice.lastMonthCharges ?? 0);
  protected readonly lastMonthSpend = computed(() => this.overview().data?.expense.lastMonthSpend ?? 0);
  /** Last month's mess profit/loss = charges invoiced − groceries spent. Positive = profit. */
  protected readonly lastMonthPnl = computed(() => this.lastMonthCharges() - this.lastMonthSpend());
  protected readonly lastMonthPnlAbs = computed(() => Math.abs(this.lastMonthPnl()));
  /** True once there's a charge or a last-month spend to reckon — otherwise the card dashes. */
  protected readonly hasPnl = computed(() => this.lastMonthCharges() > 0 || this.lastMonthSpend() > 0);

  /** Month-over-month grocery-spend change as a signed %, or null when there's no prior month
   *  to compare against or nothing spent yet this month. */
  protected readonly spendDelta = computed(() => {
    const last = this.lastMonthSpend();
    if (last <= 0 || this.monthlySpend() <= 0) return null;
    return Math.round(((this.monthlySpend() - last) / last) * 100);
  });

  protected readonly spendChartTabs: TabItem[] = [
    { value: 'month', label: 'Month' },
    { value: 'day', label: 'Day' },
  ];

  private readonly spendKey = computed(() => ({
    hostelId: this.propertyStore.properties().length > 0 ? this.propertyStore.selected() : '',
    interval: this.chartMode(),
  }));

  private readonly spendStats = toSignal(
    toObservable(this.spendKey).pipe(
      switchMap(({ hostelId, interval }) =>
        hostelId
          ? this.hostelsApi
              .groceryExpenseStats(hostelId, interval)
              .pipe(catchError(() => of<GroceryExpenseStat[]>([])))
          : of<GroceryExpenseStat[]>([]),
      ),
    ),
    { initialValue: [] as GroceryExpenseStat[] },
  );

  private readonly spendChart = computed(() => {
    const data = this.spendStats();
    const mode = this.chartMode();
    const points: SpendPoint[] = data.map((d) => ({
      label:
        mode === 'month'
          ? MONTHS[parseInt(d.date.split('-')[1], 10) - 1]
          : String(parseInt(d.date.split('-')[2], 10)),
      value: d.total_amount,
    }));
    return buildSpendChart(points);
  });

  protected readonly spendBars = computed<BarChartBar[]>(() => this.spendChart().bars);

  protected readonly spendYTicks = computed<BarChartTick[]>(() =>
    [...this.spendChart().ticks].reverse().map((t) => ({ label: t.label })),
  );

  protected readonly spendBarGap = computed(() =>
    this.chartMode() === 'month' ? 'gap-2 sm:gap-3' : 'gap-px',
  );

  /** Taller on phones, matching the confirmations chart — a 10rem plot under a full-width
   *  card reads as a sliver once the axis and labels take their share. */
  protected readonly spendHeight = computed(() =>
    this.mobile.isMobile() ? '14rem' : '10rem',
  );

  /**
   * Day mode always thins the 30 labels out. Month mode fits all 12 on a wide card, but on
   * a phone ~267px of plot gives each label ~22px — less than "Sep" needs — so show every
   * other month there.
   */
  protected readonly spendXLabelStep = computed(() => {
    if (this.chartMode() === 'day') return 5;
    return this.mobile.isMobile() ? 2 : 1;
  });

  // ── Expense entries (real API, filtered to "mess" type) ─────────────────
  private readonly notifications = inject(NotificationService);
  private readonly refresh = signal(0);

  private readonly router = inject(Router);

  /** 1-based page of the grocery table. */
  private readonly groceryPage = signal(1);

  private readonly expenseFetchKey = computed(() => ({
    hostelId: this.overviewKey(),
    page: this.groceryPage(),
    r: this.refresh(),
  }));

  private readonly expenseState = toSignal(
    toObservable(this.expenseFetchKey).pipe(
      switchMap(({ hostelId, page }) => {
        if (!hostelId) return of(EMPTY_EXPENSES);
        return this.hostelsApi
          .listExpenses(hostelId, {
            's[expense_type]': 'groceries',
            page: String(page),
            limit: String(PAGE_SIZE),
          })
          .pipe(
            map((r) => ({
              loading: false,
              error: false,
              items: r.items,
              total: r.total,
              totalPages: r.totalPages,
            })),
            startWith(EMPTY_EXPENSES),
            catchError(() => of({ ...EMPTY_EXPENSES, loading: false, error: true })),
          );
      }),
    ),
    { initialValue: EMPTY_EXPENSES },
  );

  protected readonly entriesLoading = computed(() => this.expenseState().loading);
  protected readonly entries = computed(() => this.expenseState().items);
  protected readonly entriesTotal = computed(() => this.expenseState().total);

  protected readonly removePending = signal<ExpenseListItem | null>(null);
  private readonly deletedIds = signal<ReadonlySet<string>>(new Set());

  protected readonly visibleEntries = computed(() => {
    const deleted = this.deletedIds();
    return this.entries().filter((e) => !deleted.has(e.id));
  });

  protected displayDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : format(d, 'EEEE, MMM d yyyy');
  }

  // ── Grocery table ─────────────────────────────────────────────────────────

  protected readonly tableCols = GROCERY_TABLE_COLS;
  protected readonly rowId = (row: unknown) => (row as ExpenseListItem).id;
  protected readonly menuActionActive = (row: unknown) =>
    this.menuOpenId() === (row as ExpenseListItem).id;

  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly menuPos = signal<{ top: number; right: number } | null>(null);

  protected readonly paginationConf = computed<PaginationConfig | null>(() => {
    const totalPages = this.expenseState().totalPages;
    if (totalPages <= 1) return null;
    const page = this.groceryPage();
    return {
      page,
      total: this.expenseState().total,
      totalPages,
      hasNextPage: page < totalPages,
      itemLabel: 'grocery entry',
    };
  });

  protected goToPage(page: number): void {
    this.closeMenu();
    this.groceryPage.set(page);
  }

  /**
   * Line items, receipts and notes all live on the expense detail page already, so the row
   * opens that rather than re-implementing the breakdown inline.
   */
  protected goToDetail(row: ExpenseListItem): void {
    this.closeMenu();
    void this.router.navigate([`/host/${this.propertyStore.selected()}/expenses`, row.id]);
  }

  protected onRowAction(ev: { row: unknown; event: MouseEvent }): void {
    const id = (ev.row as ExpenseListItem).id;
    ev.event.stopPropagation();
    if (this.menuOpenId() === id) {
      this.closeMenu();
      return;
    }
    const rect = (ev.event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuOpenId.set(id);
    this.menuPos.set({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  protected closeMenu(): void {
    this.menuOpenId.set(null);
    this.menuPos.set(null);
  }

  protected promptRemove(entry: ExpenseListItem): void {
    this.closeMenu();
    this.removePending.set(entry);
  }

  protected confirmRemove(): void {
    const entry = this.removePending();
    const hostelId = this.propertyStore.selected();
    if (!entry || !hostelId) return;

    this.deletedIds.update((s) => new Set(s).add(entry.id));
    this.removePending.set(null);

    this.hostelsApi.deleteExpense(hostelId, entry.id).subscribe({
      error: (err: ApiError) => {
        this.deletedIds.update((s) => {
          const n = new Set(s);
          n.delete(entry.id);
          return n;
        });
        const { title, message } = toToastCopy(err);
        this.notifications.show({ kind: 'error', title, message }, 0);
      },
    });
  }

  protected cancelRemove(): void {
    this.removePending.set(null);
  }
}
