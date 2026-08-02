import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { format } from 'date-fns';
import { Button, ConfirmModal, EmptyState, TabItem, Tabs } from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { DailyMealConfirmation, GroceryExpenseStat, HostelsApi, HostPropertyStore, MessOverviewCards } from '@services';
import { MessService } from './mess.service';
import { MEAL_META, MEAL_ORDER, MealType } from './mess-notifications.service';

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
}

// SVG coordinate constants — viewBox 600 × 207
// Aspect ratio 600/207 ≈ 2.9 → at ~550px card content gives ~190px chart height
const CL = 38, CR = 592, CT = 15, CB = 175;
const CW = CR - CL; // 554
const CH = CB - CT; // 160
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
function buildAreaChart(series: DailyMealConfirmation[]): AreaChart {
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
  imports: [DecimalPipe, RouterLink, DashboardLayout, Button, ConfirmModal, EmptyState, Tabs],
  templateUrl: './mess-list.html',
})
export class MessList {
  protected readonly svc = inject(MessService);
  private readonly hostelsApi = inject(HostelsApi);
  private readonly propertyStore = inject(HostPropertyStore);

  protected readonly mealOrder = MEAL_ORDER;
  protected readonly mealMeta = MEAL_META;

  protected readonly expanded = signal<string | null>(null);
  protected readonly chartMode = signal<'month' | 'day'>('month');

  // ── Area chart ─────────────────────────────────────────────────────────────
  protected readonly hoveredDayIndex = signal<number | null>(null);

  protected readonly confirmAreaChart = computed(() =>
    buildAreaChart(this.dailyConfirmations()),
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

  protected readonly spendChart = computed(() => {
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

  protected readonly removePending = signal<string | null>(null);

  protected toggle(id: string): void {
    this.expanded.update((v) => (v === id ? null : id));
  }

  protected promptRemove(id: string): void {
    this.removePending.set(id);
  }

  protected confirmRemove(): void {
    const id = this.removePending();
    if (!id) return;
    this.removePending.set(null);
    if (this.expanded() === id) this.expanded.set(null);
    this.svc.removeEntry(id);
  }

  protected cancelRemove(): void {
    this.removePending.set(null);
  }
}
