import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { format } from 'date-fns';
import { Button, ConfirmModal, EmptyState, TabItem, Tabs } from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { MessService } from './mess.service';
import { MEAL_META, MEAL_ORDER, MealConfirmation, MealType, MessNotificationsService } from './mess-notifications.service';

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
const AREA_FILL = 0.88;

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

function buildAreaChart(confirmations: MealConfirmation[]): AreaChart {
  const today = new Date();
  const days: DayData[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (29 - i));
    const iso = format(d, 'yyyy-MM-dd');
    const n = (meal: MealType) => confirmations.filter((c) => c.meal === meal && c.date === iso).length;
    return {
      dayLabel: format(d, 'd MMM'),
      tooltipLabel: format(d, 'd MMM'),
      breakfast: n('breakfast'),
      lunch: n('lunch'),
      dinner: n('dinner'),
    };
  });

  const peak = Math.max(1, ...days.flatMap((d) => [d.breakfast, d.lunch, d.dinner]));
  const { step, ceiling } = niceAxis(peak);
  const yFor = (v: number) => CB - (v / ceiling) * CH * AREA_FILL;
  const pointsX = Array.from({ length: 30 }, (_, i) => CL + (i / 29) * CW);

  const pointsY: Record<MealType, number[]> = {
    breakfast: days.map((d) => yFor(d.breakfast)),
    lunch:     days.map((d) => yFor(d.lunch)),
    dinner:    days.map((d) => yFor(d.dinner)),
  };

  const makePath = (ys: number[]) => {
    const line = smoothLine(pointsX, ys);
    return { line, area: `${line} L ${pointsX[29].toFixed(1)},${CB} L ${pointsX[0].toFixed(1)},${CB} Z` };
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
  maxFill = 92,
): { bars: ChartBar[]; ticks: ChartTick[] } {
  const rawPeak = Math.max(1, ...points.map((p) => p.value));
  const rawStep = rawPeak / 4;
  const exp = Math.pow(10, Math.floor(Math.log10(Math.max(1, rawStep))));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * exp).find((s) => s >= rawStep) ?? rawStep;
  const ceiling = Math.ceil(rawPeak / step) * step;

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
      label: v === 0 ? '0' : v >= 1000 ? `${+(v / 1000).toFixed(0)}k` : String(v),
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
  private readonly notifSvc = inject(MessNotificationsService);

  protected readonly mealOrder = MEAL_ORDER;
  protected readonly mealMeta = MEAL_META;

  protected readonly expanded = signal<string | null>(null);
  protected readonly chartMode = signal<'month' | 'day'>('month');

  // ── Area chart ─────────────────────────────────────────────────────────────
  protected readonly hoveredDayIndex = signal<number | null>(null);

  protected readonly confirmAreaChart = computed(() =>
    buildAreaChart(this.notifSvc.confirmations()),
  );

  /** Resolved hovered-day data — null when nothing is hovered. */
  protected readonly hoveredDay = computed(() => {
    const idx = this.hoveredDayIndex();
    if (idx === null) return null;
    const chart = this.confirmAreaChart();
    return { idx, day: chart.days[idx], x: chart.pointsX[idx], y: chart.pointsY };
  });

  protected readonly totalToday = computed(() => this.notifSvc.todaysConfirmations().length);
  protected readonly mealCounts = computed(() => this.notifSvc.countsByMeal());
  protected readonly totalSubscribers = computed(() => this.notifSvc.totalSubscribers());
  protected readonly costPerStudent = computed(() => {
    const subs = this.notifSvc.totalSubscribers();
    const spend = this.svc.thisMonthSpend();
    return subs > 0 ? Math.round(spend / subs) : 0;
  });

  protected readonly spendChartTabs: TabItem[] = [
    { value: 'month', label: 'Month' },
    { value: 'day', label: 'Day' },
  ];

  protected readonly spendChart = computed(() => {
    const points = this.chartMode() === 'month' ? this.monthPoints() : this.dayPoints();
    return buildSpendChart(points);
  });

  private monthPoints(): { label: string; value: number }[] {
    const entries = this.svc.entries();
    const today = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - (11 - i), 1);
      return {
        label: MONTHS[d.getMonth()],
        value: entries
          .filter((e) => e.date.getFullYear() === d.getFullYear() && e.date.getMonth() === d.getMonth())
          .reduce((sum, e) => sum + e.totalSum, 0),
      };
    });
  }

  private dayPoints(): { label: string; value: number }[] {
    const entries = this.svc.entries();
    const today = new Date();
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (29 - i));
      return {
        label: String(d.getDate()),
        value: entries
          .filter(
            (e) =>
              e.date.getFullYear() === d.getFullYear() &&
              e.date.getMonth() === d.getMonth() &&
              e.date.getDate() === d.getDate(),
          )
          .reduce((sum, e) => sum + e.totalSum, 0),
      };
    });
  }

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
