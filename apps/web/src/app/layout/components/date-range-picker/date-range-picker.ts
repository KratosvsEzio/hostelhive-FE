import { ChangeDetectionStrategy, Component, computed, model, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

interface CalDay {
  date: Date;
  inMonth: boolean;
  inRange: boolean;
  isStart: boolean;
  isEnd: boolean;
  isToday: boolean;
  isRowStart: boolean;
  isRowEnd: boolean;
}

const midnight = (d: Date): Date => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
const today = () => midnight(new Date());
const DAY = 86_400_000;

export const DATE_RANGE_PRESETS: Array<{ label: string; fn: () => DateRange }> = [
  { label: 'Today', fn: () => { const d = today(); return { start: d, end: d, label: 'Today' }; } },
  { label: 'Yesterday', fn: () => { const d = new Date(today().getTime() - DAY); return { start: d, end: d, label: 'Yesterday' }; } },
  { label: 'Last 7 days', fn: () => { const e = today(); return { start: new Date(e.getTime() - 6 * DAY), end: e, label: 'Last 7 days' }; } },
  { label: 'Last 14 days', fn: () => { const e = today(); return { start: new Date(e.getTime() - 13 * DAY), end: e, label: 'Last 14 days' }; } },
  { label: 'Last 30 days', fn: () => { const e = today(); return { start: new Date(e.getTime() - 29 * DAY), end: e, label: 'Last 30 days' }; } },
  { label: 'Last 3 months', fn: () => { const e = today(); const s = new Date(e); s.setMonth(s.getMonth() - 3); s.setDate(s.getDate() + 1); return { start: s, end: e, label: 'Last 3 months' }; } },
  { label: 'Last 6 months', fn: () => { const e = today(); const s = new Date(e); s.setMonth(s.getMonth() - 6); s.setDate(s.getDate() + 1); return { start: s, end: e, label: 'Last 6 months' }; } },
  { label: 'Last 12 months', fn: () => { const e = today(); const s = new Date(e); s.setFullYear(s.getFullYear() - 1); s.setDate(s.getDate() + 1); return { start: s, end: e, label: 'Last 12 months' }; } },
  { label: 'This week', fn: () => { const e = today(); const s = new Date(e); s.setDate(s.getDate() - s.getDay()); return { start: s, end: e, label: 'This week' }; } },
  { label: 'This month', fn: () => { const e = today(); return { start: new Date(e.getFullYear(), e.getMonth(), 1), end: e, label: 'This month' }; } },
  { label: 'This quarter', fn: () => { const e = today(); const q = Math.floor(e.getMonth() / 3) * 3; return { start: new Date(e.getFullYear(), q, 1), end: e, label: 'This quarter' }; } },
  { label: 'This year', fn: () => { const e = today(); return { start: new Date(e.getFullYear(), 0, 1), end: e, label: 'This year' }; } },
];

@Component({
  selector: 'hh-date-range-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  templateUrl: './date-range-picker.html',
})
export class DateRangePicker {
  readonly value = model<DateRange | null>(null);

  protected readonly presets = DATE_RANGE_PRESETS;
  protected readonly open = signal(false);
  protected readonly hovered = signal<Date | null>(null);
  protected readonly draftStart = signal<Date | null>(null);

  private readonly todayTime = today().getTime();

  protected readonly viewDate = signal<Date>(
    (() => { const d = new Date(); d.setDate(1); return d; })(),
  );

  protected readonly monthLabel = computed(() =>
    this.viewDate().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  );

  protected readonly triggerLabel = computed(() => {
    const v = this.value();
    if (!v) return 'Date range';
    if (v.label !== 'Custom') return v.label;
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `${fmt(v.start)} – ${fmt(v.end)}`;
  });

  protected readonly calDays = computed((): CalDay[] => {
    const vd = this.viewDate();
    const year = vd.getFullYear();
    const month = vd.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    const ds = this.draftStart();
    const hov = this.hovered();
    const val = this.value();

    const rawA = ds ?? val?.start ?? null;
    const rawB = ds ? hov : (val?.end ?? null);
    const effectiveStart = rawA && rawB
      ? (rawA.getTime() <= rawB.getTime() ? rawA : rawB)
      : rawA;
    const effectiveEnd = rawA && rawB
      ? (rawA.getTime() <= rawB.getTime() ? rawB : rawA)
      : null;

    const cells: CalDay[] = [];
    for (let i = firstDow - 1; i >= 0; i--) {
      cells.push(cell(new Date(year, month, -i), false, effectiveStart, effectiveEnd, this.todayTime));
    }
    for (let d = 1; d <= lastDate; d++) {
      cells.push(cell(new Date(year, month, d), true, effectiveStart, effectiveEnd, this.todayTime));
    }
    const tail = 42 - cells.length;
    for (let d = 1; d <= tail; d++) {
      cells.push(cell(new Date(year, month + 1, d), false, effectiveStart, effectiveEnd, this.todayTime));
    }
    return cells;
  });

  protected prevMonth(): void {
    const d = new Date(this.viewDate()); d.setMonth(d.getMonth() - 1); this.viewDate.set(d);
  }

  protected nextMonth(): void {
    const d = new Date(this.viewDate()); d.setMonth(d.getMonth() + 1); this.viewDate.set(d);
  }

  protected clickDay(date: Date): void {
    const ds = this.draftStart();
    if (!ds) {
      this.draftStart.set(date);
    } else {
      const [s, e] = ds.getTime() <= date.getTime() ? [ds, date] : [date, ds];
      this.draftStart.set(null);
      this.value.set({ start: s, end: e, label: 'Custom' });
      this.open.set(false);
    }
  }

  protected selectPreset(p: (typeof DATE_RANGE_PRESETS)[0]): void {
    const r = p.fn();
    this.draftStart.set(null);
    this.value.set(r);
    const vd = new Date(r.end); vd.setDate(1); this.viewDate.set(vd);
    this.open.set(false);
  }

  protected clearRange(): void {
    this.value.set(null); this.draftStart.set(null);
  }

  protected stripClass(d: CalDay): string {
    if (!d.inRange) return 'hidden';
    if (d.isStart && d.isEnd) return 'hidden';
    const base = 'absolute inset-y-1 bg-brand-50';
    if (d.isStart) return `${base} start-1/2 end-0`;
    if (d.isEnd) return `${base} start-0 end-1/2`;
    const round = `${d.isRowStart ? 'rounded-s-full' : ''} ${d.isRowEnd ? 'rounded-e-full' : ''}`.trim();
    return `${base} start-0 end-0 ${round}`;
  }

  protected circleClass(d: CalDay): string {
    const base = 'relative z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-sm transition-colors select-none';
    if (d.isStart || d.isEnd) return `${base} bg-brand-500 font-semibold text-white`;
    if (d.inRange) return `${base} ${d.inMonth ? 'text-brand-700 hover:bg-brand-100' : 'text-brand-300'}`;
    if (!d.inMonth) return `${base} text-ink-300 hover:bg-ink-50`;
    return `${base} text-ink-800 hover:bg-ink-50${d.isToday ? ' ring-1 ring-brand-400' : ''}`;
  }
}

function cell(
  date: Date, inMonth: boolean, start: Date | null, end: Date | null, todayTime: number,
): CalDay {
  const t = date.getTime();
  const dow = date.getDay();
  const inRange = !!start && !!end && t >= start.getTime() && t <= end.getTime();
  return {
    date, inMonth, inRange,
    isStart: !!start && t === start.getTime(),
    isEnd: !!end && t === end.getTime(),
    isToday: t === todayTime,
    isRowStart: dow === 0,
    isRowEnd: dow === 6,
  };
}
