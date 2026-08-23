import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

/** Emitted selection — ISO `YYYY-MM-DD` strings (local), or `null` when unset. */
export interface DateRange {
  from: string | null;
  to: string | null;
  /** Present only when `showTime` is enabled. `HH:MM` format. */
  fromTime?: string;
  toTime?: string;
}

export interface DateRangePreset {
  label: string;
  from: string;
  to: string;
}

interface DayCell {
  day: number;
  iso: string;
  ms: number;
  disabled: boolean;
  today: boolean;
}
interface MonthView {
  key: string;
  label: string;
  cells: (DayCell | null)[];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTHS_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');
function d2iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function buildPresets(): DateRangePreset[] {
  const t = new Date();
  const y = t.getFullYear(), m = t.getMonth(), day = t.getDate();
  const todayIso = d2iso(t);
  const dow = t.getDay();
  const diffMon = dow === 0 ? -6 : 1 - dow;
  const weekStart = new Date(y, m, day + diffMon);
  const lastWeekStart = new Date(y, m, day + diffMon - 7);
  const lastWeekEnd = new Date(y, m, day + diffMon - 1);
  const monthEnd = new Date(y, m + 1, 0);
  return [
    { label: 'Today',         from: todayIso,                                  to: todayIso },
    { label: 'Yesterday',     from: d2iso(new Date(y, m, day - 1)),            to: d2iso(new Date(y, m, day - 1)) },
    { label: 'This week',     from: d2iso(weekStart),                          to: todayIso },
    { label: 'Last week',     from: d2iso(lastWeekStart),                      to: d2iso(lastWeekEnd) },
    { label: 'This month',    from: d2iso(new Date(y, m, 1)),                  to: d2iso(monthEnd) },
    { label: 'Last month',    from: d2iso(new Date(y, m - 1, 1)),              to: d2iso(new Date(y, m, 0)) },
    { label: 'Last 3 months', from: d2iso(new Date(y, m - 2, 1)),             to: d2iso(monthEnd) },
    { label: 'Last 6 months', from: d2iso(new Date(y, m - 5, 1)),             to: d2iso(monthEnd) },
    { label: 'This year',     from: d2iso(new Date(y, 0, 1)),                  to: d2iso(new Date(y, 11, 31)) },
    { label: 'Last year',     from: d2iso(new Date(y - 1, 0, 1)),             to: d2iso(new Date(y - 1, 11, 31)) },
  ];
}
/** Parse a `YYYY-MM-DD` string to local-midnight ms, or null. */
function parseMs(iso?: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}
function shortLabel(iso: string | null): string {
  const ms = parseMs(iso);
  if (ms == null) return '';
  const d = new Date(ms);
  const base = `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date().getFullYear()
    ? base
    : `${base} ’${pad(d.getFullYear() % 100)}`;
}

/**
 * Airbnb-style date-range picker — a trigger that opens a two-month calendar popover with
 * range selection (filled endpoints + a shaded band between). Reusable across the app.
 *
 * Usage: `<hh-date-range-picker [from]="from()" [to]="to()" (rangeChange)="onRange($event)" />`.
 * Emits `{ from, to }` (`YYYY-MM-DD` | null) only once a full range is picked (or cleared).
 * `min` / `max` (YYYY-MM-DD) bound the selectable days; `months` sets how many show (default 2).
 *
 * The panel is teleported to `<body>` and positioned `fixed` against the trigger's viewport rect,
 * so it escapes `overflow`/`transform` ancestors (mirrors hh-dropdown).
 */
@Component({
  selector: 'hh-date-range-picker',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="relative block">
      <button
        type="button"
        (click)="toggle()"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open()"
        class="inline-flex h-8 w-full items-center gap-2 rounded-full border bg-white px-3.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-100"
        [class]="
          open() ? 'border-brand-400' : 'border-ink-300 hover:border-ink-400'
        "
      >
        <i class="ti ti-calendar shrink-0 text-ink-400"></i>
        <span
          class="flex-1 truncate text-start"
          [class]="hasRange() ? 'text-ink-900' : 'text-ink-400'"
          >{{ triggerLabel() }}</span
        >
        @if (hasRange()) {
          <span
            role="button"
            tabindex="0"
            [attr.aria-label]="'a11y.clearDates' | transloco"
            (click)="clear($event)"
            (keydown.enter)="clear($event)"
            class="ms-0.5 grid h-5 w-5 place-items-center rounded-full text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
          >
            <i class="ti ti-x text-sm"></i>
          </span>
        }
      </button>

      <div #portal class="contents">
        @if (open()) {
          <button
            type="button"
            class="fixed inset-0 z-[80] cursor-default bg-ink-900/20"
            [attr.aria-label]="'a11y.closeCalendar' | transloco"
            (click)="close()"
          ></button>
          <div
            role="dialog"
            [attr.aria-label]="'a11y.chooseDateRange' | transloco"
            class="fixed z-[81] max-w-[calc(100vw-1rem)] rounded-3xl border border-ink-100 bg-white p-5 shadow-pill"
            [style.top.px]="pos()?.top"
            [style.left.px]="pos()?.left"
          >
            <div class="flex gap-5">
              @if (presets().length) {
                <div class="flex max-h-[300px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-ink-100 pe-5 pt-1">
                  @for (p of presets(); track p.label) {
                    <button
                      type="button"
                      (click)="applyPreset(p)"
                      class="whitespace-nowrap rounded-lg px-3 py-2 text-start text-sm text-ink-600 transition hover:bg-ink-50"
                    >{{ p.label }}</button>
                  }
                </div>
              }
              <div>
                <!-- Month grids with prev/next nav -->
                <div class="flex flex-col gap-6 sm:flex-row">
                  @for (m of monthViews(); track m.key; let i = $index) {
                    <div class="w-[17.5rem] max-w-full">
                      <div class="relative mb-2 flex items-center justify-center">
                        @if (i === 0) {
                          <button
                            type="button"
                            (click)="prevMonth()"
                            [attr.aria-label]="'a11y.previousMonth' | transloco"
                            class="absolute start-0 grid h-8 w-8 place-items-center rounded-full text-ink-600 transition hover:bg-ink-50"
                          >
                            <i class="ti ti-chevron-left"></i>
                          </button>
                        }
                        <span class="text-sm font-semibold text-ink-900">{{
                          m.label
                        }}</span>
                        @if (i === monthViews().length - 1) {
                          <button
                            type="button"
                            (click)="nextMonth()"
                            [attr.aria-label]="'a11y.nextMonth' | transloco"
                            class="absolute end-0 grid h-8 w-8 place-items-center rounded-full text-ink-600 transition hover:bg-ink-50"
                          >
                            <i class="ti ti-chevron-right"></i>
                          </button>
                        }
                      </div>
                      <div
                        class="grid grid-cols-7 text-center text-[11px] font-medium text-ink-400"
                      >
                        @for (w of weekdays; track $index) {
                          <span class="py-1.5">{{ w }}</span>
                        }
                      </div>
                      <div class="grid grid-cols-7" (mouseleave)="hover.set(null)">
                        @for (cell of m.cells; track $index) {
                          @if (cell) {
                            <div [class]="bandClass(cell)">
                              <button
                                type="button"
                                [disabled]="cell.disabled"
                                (click)="pick(cell)"
                                (mouseenter)="onHover(cell)"
                                [attr.aria-label]="cell.iso"
                                [class]="dayClass(cell)"
                              >
                                {{ cell.day }}
                              </button>
                            </div>
                          } @else {
                            <div class="h-10"></div>
                          }
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
            <div
              class="mt-3 flex items-center justify-between border-t border-ink-100 pt-3"
            >
              @if (showTime()) {
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs font-medium text-ink-400">From</span>
                    <input
                      type="time"
                      [value]="fromTime()"
                      (change)="fromTime.set($any($event.target).value)"
                      class="rounded-lg border border-ink-200 px-2 py-1 text-sm text-ink-800 focus:border-brand-400 focus:outline-none"
                    />
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs font-medium text-ink-400">To</span>
                    <input
                      type="time"
                      [value]="toTime()"
                      (change)="toTime.set($any($event.target).value)"
                      class="rounded-lg border border-ink-200 px-2 py-1 text-sm text-ink-800 focus:border-brand-400 focus:outline-none"
                    />
                  </div>
                </div>
              } @else {
                <span></span>
              }
              <button
                type="button"
                (click)="clearAndEmit()"
                class="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-600 underline-offset-2 transition hover:bg-ink-50 hover:underline"
              >
                Clear dates
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class DateRangePicker {
  private readonly i18n = inject(TranslocoService);
  /** Re-runs dependent computeds when the active language changes. */
  private readonly lang = toSignal(this.i18n.langChanges$, {
    initialValue: this.i18n.getActiveLang(),
  });
  protected t(key: string): string {
    this.lang();
    return this.i18n.translate(key);
  }

  readonly from = input<string | null>(null);
  readonly to = input<string | null>(null);
  readonly placeholder = input<string | undefined>(undefined);
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  readonly months = input(2);
  readonly presets = input<DateRangePreset[]>(buildPresets());
  readonly showTime = input(false);
  readonly rangeChange = output<DateRange>();

  protected readonly weekdays = WEEKDAYS;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly portal = viewChild<ElementRef<HTMLElement>>('portal');

  protected readonly open = signal(false);
  protected readonly pos = signal<{ top: number; left: number } | null>(null);
  /** First visible month (day 1). */
  private readonly viewMonth = signal(startOfMonth(new Date()));
  /** Live selection (committed only on a full range). */
  protected readonly selFrom = signal<string | null>(null);
  protected readonly selTo = signal<string | null>(null);
  /** Hovered day during the second-click preview. */
  protected readonly hover = signal<string | null>(null);
  protected readonly fromTime = signal('00:00');
  protected readonly toTime = signal('23:59');

  private readonly minMs = computed(() => parseMs(this.min()));
  private readonly maxMs = computed(() => parseMs(this.max()));
  private readonly startMs = computed(() => parseMs(this.selFrom()));
  /** Range end — the picked `to`, or the hovered day while mid-selection (preview). */
  private readonly endMs = computed(() => {
    if (this.selTo()) return parseMs(this.selTo());
    if (this.selFrom() && this.hover()) return parseMs(this.hover());
    return null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.detachListeners();
      this.portal()?.nativeElement.remove();
    });
    // Keep the live selection in sync with the inputs (external set / clear).
    effect(() => {
      this.selFrom.set(this.from() ?? null);
      this.selTo.set(this.to() ?? null);
    });
    // Teleport the panel to <body> so `fixed` coords are viewport-relative (escapes overflow/transform).
    effect(() => {
      const el = this.portal()?.nativeElement;
      if (
        el &&
        typeof document !== 'undefined' &&
        el.parentNode !== document.body
      ) {
        document.body.appendChild(el);
      }
    });
    inject(Router).events
      .pipe(filter((e) => e instanceof NavigationStart), takeUntilDestroyed())
      .subscribe(() => this.close());
  }

  protected readonly hasRange = computed(
    () => !!this.selFrom() || !!this.selTo(),
  );
  protected readonly triggerLabel = computed(() => {
    const f = this.selFrom();
    if (!f) return this.placeholder() ?? this.t('common.addDates');
    const t = this.selTo();
    return t ? `${shortLabel(f)} – ${shortLabel(t)}` : `${shortLabel(f)} – …`;
  });

  /** The visible months, derived from `viewMonth` + `months` count + min/max bounds. */
  protected readonly monthViews = computed<MonthView[]>(() => {
    const base = this.viewMonth();
    const count = Math.max(1, this.months());
    const now = new Date();
    const todayMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const lo = this.minMs();
    const hi = this.maxMs();
    return Array.from({ length: count }, (_, i) =>
      buildMonth(base, i, lo, hi, todayMs),
    );
  });

  // ── interaction ──────────────────────────────────────────────────────────

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    const anchor = parseMs(this.selFrom()) ?? parseMs(this.to()) ?? Date.now();
    this.viewMonth.set(startOfMonth(new Date(anchor)));
    this.reposition();
    this.open.set(true);
    this.attachListeners();
    // Fine-tune position using actual rendered dimensions after the browser paints
    requestAnimationFrame(() => this.reposition());
  }

  protected close(): void {
    // Discard an incomplete selection (start picked, no end) so the trigger stays consistent.
    if (this.selFrom() && !this.selTo()) {
      this.selFrom.set(this.from() ?? null);
      this.selTo.set(this.to() ?? null);
    }
    this.hover.set(null);
    this.open.set(false);
    this.detachListeners();
  }

  protected prevMonth(): void {
    this.viewMonth.update(
      (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1),
    );
  }
  protected nextMonth(): void {
    this.viewMonth.update(
      (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1),
    );
  }

  protected onHover(cell: DayCell): void {
    if (!cell.disabled && this.selFrom() && !this.selTo())
      this.hover.set(cell.iso);
  }

  protected pick(cell: DayCell): void {
    if (cell.disabled) return;
    const start = this.startMs();
    // No start yet, or a full range already chosen → begin a fresh range.
    if (start == null || this.selTo()) {
      this.selFrom.set(cell.iso);
      this.selTo.set(null);
      this.hover.set(null);
      return;
    }
    // Second click before the start → restart from the earlier day.
    if (cell.ms < start) {
      this.selFrom.set(cell.iso);
      return;
    }
    this.selTo.set(cell.iso);
    this.hover.set(null);
    this.rangeChange.emit({
      from: this.selFrom(), to: this.selTo(),
      ...(this.showTime() ? { fromTime: this.fromTime(), toTime: this.toTime() } : {}),
    });
    this.close();
  }

  protected applyPreset(p: DateRangePreset): void {
    this.selFrom.set(p.from);
    this.selTo.set(p.to);
    this.rangeChange.emit({
      from: p.from, to: p.to,
      ...(this.showTime() ? { fromTime: this.fromTime(), toTime: this.toTime() } : {}),
    });
    this.close();
  }

  protected clear(event?: Event): void {
    event?.stopPropagation();
    this.clearAndEmit();
  }
  protected clearAndEmit(): void {
    this.selFrom.set(null);
    this.selTo.set(null);
    this.hover.set(null);
    this.fromTime.set('00:00');
    this.toTime.set('23:59');
    this.rangeChange.emit({ from: null, to: null });
    this.close();
  }

  // ── per-cell classes ───────────────────────────────────────────────────────

  /** The shaded band behind in-range days (on the cell wrapper, so it connects across columns). */
  protected bandClass(cell: DayCell): string {
    const base = 'flex h-10 items-center justify-center';
    const s = this.startMs();
    const e = this.endMs();
    if (s == null || e == null || s === e) return base;
    const lo = Math.min(s, e);
    const hi = Math.max(s, e);
    if (cell.ms < lo || cell.ms > hi) return base;
    let c = `${base} bg-ink-100`;
    if (cell.ms === lo) c += ' rounded-s-full';
    if (cell.ms === hi) c += ' rounded-e-full';
    return c;
  }

  /** The day button — filled circle for endpoints, hover ring otherwise. */
  protected dayClass(cell: DayCell): string {
    const base =
      'grid h-10 w-10 place-items-center rounded-full text-sm transition';
    if (cell.disabled) return `${base} text-ink-300`;
    const s = this.startMs();
    const e = this.endMs();
    if (cell.ms === s || (this.selTo() && cell.ms === e)) {
      return `${base} bg-ink-900 font-semibold text-white`;
    }
    // Hovered preview endpoint (mid-selection) — outline it.
    if (!this.selTo() && cell.ms === e) {
      return `${base} font-semibold ring-1 ring-inset ring-ink-900 text-ink-900`;
    }
    return `${base} text-ink-800 hover:ring-1 hover:ring-inset hover:ring-ink-300 ${cell.today ? 'font-semibold' : ''}`;
  }

  // ── positioning (mirror of hh-dropdown) ──────────────────────────────────────

  private readonly reposition = (): void => {
    const btn = this.host.nativeElement.querySelector(
      'button[aria-haspopup]',
    ) as HTMLElement | null;
    if (!btn || typeof window === 'undefined') return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const dialog = this.portal()?.nativeElement?.querySelector<HTMLElement>('[role="dialog"]');
    const panelW = dialog ? dialog.offsetWidth : Math.min(800, vw - 16);
    const panelH = dialog ? dialog.offsetHeight : 460;

    // Horizontal: start-align with trigger, end-align if it would overflow viewport
    let left = r.left;
    if (left + panelW > vw - 8) left = r.right - panelW;
    left = Math.max(8, Math.min(left, vw - panelW - 8));

    // Vertical: prefer below trigger, flip above when there isn't enough space
    let top = r.bottom + 8;
    if (top + panelH > vh - 8) top = r.top - panelH - 8;
    top = Math.max(8, top);

    this.pos.set({ top, left });
  };
  private attachListeners(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
  }
  private detachListeners(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
  }
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Build one month's cells (leading blanks + day cells), offset months from `base`. */
function buildMonth(
  base: Date,
  offset: number,
  minMs: number | null,
  maxMs: number | null,
  todayMs: number,
): MonthView {
  const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstWeekday = d.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (DayCell | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const ms = new Date(year, month, day).getTime();
    cells.push({
      day,
      iso: `${year}-${pad(month + 1)}-${pad(day)}`,
      ms,
      disabled: (minMs != null && ms < minMs) || (maxMs != null && ms > maxMs),
      today: ms === todayMs,
    });
  }
  return { key: `${year}-${month}`, label: `${MONTHS[month]} ${year}`, cells };
}


