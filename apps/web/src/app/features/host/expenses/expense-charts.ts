import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { BarChart, BarChartBar, BarChartTick, Card, Dropdown, DropdownOption } from '@hostelhive/ui';
import { ExpenseListItem, ExpenseMonthlyPoint, ExpenseTypeMonthlySummary, HostelsApi, HostPropertyStore } from '@services';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];


// ── Multi-series line chart types ──────────────────────────────────────────────
interface ChartDot {
  x: number;
  y: number;
  value: number;
}
interface ChartSeries {
  key: string;
  label: string;
  color: string;
  points: string;
  area: string;
  dots: ChartDot[];
}
interface MultiLineChart {
  width: number;
  height: number;
  series: ChartSeries[];
  gridY: number[];
  monthLabels: string[];
  xPositions: number[];
}
interface TooltipItem {
  label: string;
  color: string;
  value: number;
}
interface HoverState {
  idx: number;
  xPct: number;
  bottomPct: number;
  monthLabel: string;
  items: TooltipItem[];
}

const TYPE_COLORS: Record<string, string> = {
  mess:        '#F36E21',
  salary:      '#2B6CB0',
  electricity: '#F59E0B',
  gas:         '#8B5CF6',
  maintenance: '#059669',
  groceries:   '#10B981',
  events:      '#EC4899',
  water:       '#0EA5E9',
  internet:    '#6366F1',
  repairs:     '#D97706',
  cleaning:       '#14B8A6',
  transportation: '#EF4444',
};
const FALLBACK_COLOR = '#A3A3A3';

function monthLabel(key: string): string {
  const m = Number(key.slice(5, 7));
  return MONTH_ABBR[m - 1] ?? key;
}

function typeLabel(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * A nice, evenly-spaced y-axis: a rounded ceiling ≥ peak with ~`targetTicks` intervals of a
 * "nice" step (1/2/2.5/5 × 10ⁿ). Both charts share one so their gridlines/scale line up.
 */
function niceScale(peak: number, targetTicks: number): { ceiling: number; ticks: number[] } {
  if (peak <= 0) return { ceiling: 1, ticks: [0, 1] };
  const rawStep = peak / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = niceNorm * mag;
  const ceiling = Math.ceil(peak / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= ceiling + step * 0.001; v += step) ticks.push(Math.round(v));
  return { ceiling, ticks };
}

/** Compact money label for the y-axis: 100000 → '100k', 2500000 → '2.5M'. */
function compactRs(n: number): string {
  if (n >= 1_000_000) return `${round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${round(n / 1_000)}k`;
  return String(Math.round(n));
}

const W = 600;
const H = 160;
const PAD = 8;

function buildMultiLine(
  months: string[],
  rawSeries: { key: string; values: number[] }[],
  ceiling: number,
  ticks: number[],
): MultiLineChart {
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const n = months.length;
  const step = n > 1 ? innerW / (n - 1) : 0;
  const labels = months.map((m) => monthLabel(m));
  const xPositions = Array.from({ length: n }, (_, i) => round(PAD + step * i));

  const baseline = round(PAD + innerH);

  const series: ChartSeries[] = rawSeries.map((s) => {
    const dots: ChartDot[] = s.values.map((v, i) => ({
      x: xPositions[i],
      y: round(PAD + innerH * (1 - clamp(v / ceiling, 0, 1))),
      value: v,
    }));
    const pts = dots.map((d) => `${d.x},${d.y}`).join(' ');
    const firstX = dots[0]?.x ?? PAD;
    const lastX = dots[dots.length - 1]?.x ?? PAD + innerW;
    const area = pts
      ? `M ${firstX},${baseline} L ${pts.replace(/ /g, ' L ')} L ${lastX},${baseline} Z`
      : '';
    return {
      key: s.key,
      label: typeLabel(s.key),
      color: TYPE_COLORS[s.key] ?? FALLBACK_COLOR,
      points: pts,
      area,
      dots,
    };
  });

  const gridY = ticks.map((t) => round(PAD + innerH * (1 - t / ceiling)));
  return { width: W, height: H, series, gridY, monthLabels: labels, xPositions };
}

@Component({
  selector: 'hh-expense-charts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, BarChart, Card, Dropdown],
  templateUrl: './expense-charts.html',
})
export class ExpenseCharts {
  private readonly hostelsApi = inject(HostelsApi);
  private readonly propertyStore = inject(HostPropertyStore);

  readonly items = input.required<ExpenseListItem[]>();
  readonly typeOptions = input<DropdownOption[]>([]);

  private readonly hostelId = computed(() =>
    this.propertyStore.properties().length > 0 ? this.propertyStore.selected() : '',
  );

  private readonly summary = toSignal(
    toObservable(this.hostelId).pipe(
      switchMap((id) =>
        id
          ? this.hostelsApi.expenseMonthlySummary(id).pipe(catchError(() => of<ExpenseMonthlyPoint[]>([])))
          : of<ExpenseMonthlyPoint[]>([]),
      ),
    ),
    { initialValue: [] as ExpenseMonthlyPoint[] },
  );

  protected readonly chartType = signal('');

  // ── multi-series line chart source ──
  private readonly typeSummary = toSignal(
    toObservable(this.hostelId).pipe(
      switchMap((id) =>
        id
          ? this.hostelsApi.expenseTypeMonthlySummary(id).pipe(
              catchError(() => of<ExpenseTypeMonthlySummary>({ months: [], series: [] })),
            )
          : of<ExpenseTypeMonthlySummary>({ months: [], series: [] }),
      ),
    ),
    { initialValue: { months: [], series: [] } as ExpenseTypeMonthlySummary },
  );

  /** All-types monthly totals from the by-type endpoint — the shared scale's other input. */
  private readonly lineAllTotals = computed(() => {
    const ts = this.typeSummary();
    return ts.months.map((m) =>
      ts.series.reduce((sum, s) => sum + (s.data.find((d) => d.month === m)?.amount ?? 0), 0),
    );
  });

  // ── shared y-axis — drives BOTH charts (same ceiling, ticks, spacing) ──
  protected readonly yAxis = computed(() => {
    const barPeak = Math.max(0, ...this.summary().map((p) => p.value));
    const linePeak = Math.max(0, ...this.lineAllTotals());
    return niceScale(Math.max(barPeak, linePeak, 1), 4);
  });
  protected readonly yTicksDesc = computed<BarChartTick[]>(() =>
    [...this.yAxis().ticks].reverse().map((t) => ({ label: compactRs(t) })),
  );

  // ── bar chart ──
  protected readonly bars = computed<BarChartBar[]>(() => {
    const ceiling = this.yAxis().ceiling;
    return this.summary().map((p) => ({
      label: monthLabel(p.month),
      value: p.value,
      pct: (p.value / ceiling) * 100,
    }));
  });

  protected readonly barTotal = computed(() => this.summary().reduce((s, p) => s + p.value, 0));

  // ── multi-series line chart ──
  protected readonly chart = computed<MultiLineChart>(() => {
    const ts = this.typeSummary();
    const { ceiling, ticks } = this.yAxis();
    const type = this.chartType();
    if (type) {
      const match = ts.series.find((s) => s.expenseType === type);
      const values = ts.months.map((m) => match?.data.find((d) => d.month === m)?.amount ?? 0);
      return buildMultiLine(ts.months, [{ key: type, values }], ceiling, ticks);
    }
    const activeSeries = ts.series
      .filter((s) => s.data.some((d) => d.amount > 0))
      .map((s) => ({
        key: s.expenseType,
        values: ts.months.map((m) => s.data.find((d) => d.month === m)?.amount ?? 0),
      }));
    return buildMultiLine(ts.months, activeSeries, ceiling, ticks);
  });

  protected readonly lineTotal = computed(() =>
    this.chart().series.reduce(
      (sum, s) => sum + s.dots.reduce((ds, d) => ds + d.value, 0),
      0,
    ),
  );

  protected readonly hoveredDotIndex = signal<number | null>(null);

  protected readonly hoverState = computed<HoverState | null>(() => {
    const idx = this.hoveredDotIndex();
    if (idx === null) return null;
    const c = this.chart();
    const x = c.xPositions[idx];
    if (x === undefined) return null;
    const items: TooltipItem[] = c.series
      .map((s) => ({ label: s.label, color: s.color, value: s.dots[idx]?.value ?? 0 }))
      .filter((item) => item.value > 0);
    const topY = Math.min(...c.series.map((s) => s.dots[idx]?.y ?? H));
    return {
      idx,
      xPct: (x / c.width) * 100,
      bottomPct: (1 - topY / c.height) * 100 + 6,
      monthLabel: c.monthLabels[idx] ?? '',
      items,
    };
  });

  protected onChartType(v: string | string[] | null): void {
    if (typeof v === 'string') this.chartType.set(v);
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
