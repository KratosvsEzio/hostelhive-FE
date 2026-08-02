import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Card, Dropdown, DropdownOption } from '@hostelhive/ui';
import { ExpenseListItem } from '@services';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MonthPoint {
  /** 'yyyy-MM' bucket key. */
  key: string;
  label: string;
}
interface Bar {
  label: string;
  value: number;
  /** Height as a % of the chart area. */
  pct: number;
}
interface LineDot {
  x: number;
  y: number;
  label: string;
  value: number;
}
interface LineGeom {
  width: number;
  height: number;
  points: string;
  area: string;
  dots: LineDot[];
  gridY: number[];
}

/** The last 12 calendar months (oldest → current), as { key: 'yyyy-MM', label }. */
function last12Months(now: Date): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: MONTH_ABBR[d.getMonth()],
    });
  }
  return out;
}

/** Sum expense amounts per month bucket, optionally restricted to one expense type. */
function sumByMonth(items: ExpenseListItem[], months: MonthPoint[], type: string): number[] {
  const totals = new Map<string, number>();
  for (const e of items) {
    if (type && e.expenseType !== type) continue;
    const key = (e.date || '').slice(0, 7); // 'yyyy-MM' prefix of the ISO date
    totals.set(key, (totals.get(key) ?? 0) + (Number(e.amount) || 0));
  }
  return months.map((m) => totals.get(m.key) ?? 0);
}

const W = 600;
const H = 160;
const PAD = 8;

/** Map a value series to a line + filled-area chart, auto-scaled to [0, max]. */
function buildLine(labels: string[], values: number[]): LineGeom {
  const yMax = Math.max(1, ...values);
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const n = values.length;
  const step = n > 1 ? innerW / (n - 1) : 0;

  const dots: LineDot[] = values.map((v, i) => ({
    x: round(PAD + step * i),
    y: round(PAD + innerH * (1 - clamp(v / yMax, 0, 1))),
    label: labels[i],
    value: v,
  }));

  const points = dots.map((d) => `${d.x},${d.y}`).join(' ');
  const baseline = round(PAD + innerH);
  const firstX = dots[0]?.x ?? PAD;
  const lastX = dots[dots.length - 1]?.x ?? PAD + innerW;
  const area = points
    ? `M ${firstX},${baseline} L ${points.replace(/ /g, ' L ')} L ${lastX},${baseline} Z`
    : '';

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => round(PAD + innerH * (1 - f)));
  return { width: W, height: H, points, area, dots, gridY };
}

/**
 * Two charts for the expenses list header, both over the last 12 months:
 *  - a bar chart of total monthly spend (all types), and
 *  - a line/area chart of monthly spend for a chosen expense type (its own filter).
 * Series are aggregated client-side from the loaded expense list.
 */
@Component({
  selector: 'hh-expense-charts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, Card, Dropdown],
  templateUrl: './expense-charts.html',
})
export class ExpenseCharts {
  readonly items = input.required<ExpenseListItem[]>();
  readonly typeOptions = input<DropdownOption[]>([]);

  private readonly months = last12Months(new Date());
  protected readonly monthLabels = this.months.map((m) => m.label);

  /** The line chart's own expense-type filter, independent of the list's filters. */
  protected readonly chartType = signal('');

  // ── bar chart — total spend per month (all types) ──
  protected readonly bars = computed<Bar[]>(() => {
    const values = sumByMonth(this.items(), this.months, '');
    const peak = Math.max(1, ...values);
    return values.map((v, i) => ({ label: this.months[i].label, value: v, pct: (v / peak) * 92 }));
  });

  protected readonly barTotal = computed(() => this.bars().reduce((s, b) => s + b.value, 0));

  // ── line/area chart — spend per month for the selected type ──
  protected readonly line = computed<LineGeom>(() =>
    buildLine(this.monthLabels, sumByMonth(this.items(), this.months, this.chartType())),
  );

  protected readonly lineTotal = computed(() =>
    this.line().dots.reduce((s, d) => s + d.value, 0),
  );

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
