import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { TimePicker } from '../time-picker/time-picker';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Local today as YYYY-MM-DD. Built from local parts, not toISOString(), which is UTC
 *  and lands on the previous day for any positive-offset zone before 05:00. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

/** Date part only — a `YYYY-MM-DDTHH:mm` value parses as its day, never NaN. */
function datePart(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

/**
 * `14:30` -> `2:30 PM`. Mirrors hh-time-picker’s own label formatting so the closed
 * trigger reads the same way as the panel the user picked it in.
 */
function timeLabel(hhmm: string): string {
  const [hs, ms] = hhmm.split(':');
  const h24 = Number(hs);
  const minute = Number(ms);
  if (!Number.isFinite(h24) || !Number.isFinite(minute)) return '';
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${pad(minute)} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** `HH:mm` out of a datetime value, or '' when it carries none. */
function timePart(iso?: string | null): string {
  return iso && iso[10] === 'T' ? iso.slice(11, 16) : '';
}

function parseMs(iso?: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = datePart(iso).split('-').map(Number);
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
    : `${base} '${pad(d.getFullYear() % 100)}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function buildMonth(
  base: Date,
  minMs: number | null,
  maxMs: number | null,
  todayMs: number,
): MonthView {
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstWeekday = base.getDay();
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

/**
 * Single-date picker with three-level drill-down navigation:
 *   day view → month grid (click title) → year list (click year)
 *
 * Usage:
 *   `<hh-date-picker label="Due date" [(value)]="dueDate" />`
 *   `<hh-date-picker variant="pill" placeholder="Pick date" [(value)]="date" />`
 */
@Component({
  selector: 'hh-date-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TimePicker],
  host: { class: 'block' },
  template: `
    <div class="relative block">
      @if (label()) {
        <label class="mb-1 block text-xs font-medium text-ink-600">{{ label() }}</label>
      }

      <!-- Trigger -->
      <button
        type="button"
        (click)="toggle()"
        [disabled]="disabled()"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open()"
        [class]="triggerClass()"
      >
        <i class="ti ti-calendar shrink-0 text-ink-400" aria-hidden="true"></i>
        <span
          class="flex-1 truncate text-start"
          [class]="value() ? 'text-ink-900' : 'text-ink-400'"
        >{{ value() ? displayLabel() : placeholder() }}</span>
        @if (value()) {
          <span
            role="button"
            tabindex="0"
            aria-label="Clear date"
            (click)="clear($event)"
            (keydown.enter)="clear($event)"
            class="ml-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
          >
            <i class="ti ti-x text-sm"></i>
          </span>
        }
      </button>

      @if (error()) {
        <p class="mt-1 flex items-center gap-1 text-xs text-danger">
          <i class="ti ti-alert-circle" aria-hidden="true"></i>{{ error() }}
        </p>
      }

      @if (open()) {
        <div #portal class="contents">
          <!-- Backdrop -->
          <button
            type="button"
            class="fixed inset-0 z-[70] cursor-default bg-ink-900/20"
            aria-label="Close calendar"
            (click)="close()"
          ></button>

          <!-- Panel -->
          <div
            role="dialog"
            aria-label="Choose date"
            class="fixed z-[71] w-[17.5rem] rounded-3xl border border-ink-100 bg-white p-5 shadow-pill"
            [style.top.px]="pos()?.top"
            [style.left.px]="pos()?.left"
          >
            <!-- ── DAY VIEW ── -->
            @if (mode() === 'day') {
              <div class="relative mb-2 flex items-center justify-center">
                <button
                  type="button"
                  (click)="prevMonth()"
                  aria-label="Previous month"
                  class="absolute left-0 grid h-8 w-8 place-items-center rounded-full text-ink-600 transition hover:bg-ink-50"
                >
                  <i class="ti ti-chevron-left"></i>
                </button>
                <button
                  type="button"
                  (click)="mode.set('month')"
                  class="rounded-lg px-2 py-0.5 text-sm font-semibold text-ink-900 transition hover:bg-ink-50"
                  title="Pick month"
                >
                  {{ monthView().label }}
                </button>
                <button
                  type="button"
                  (click)="nextMonth()"
                  aria-label="Next month"
                  class="absolute right-0 grid h-8 w-8 place-items-center rounded-full text-ink-600 transition hover:bg-ink-50"
                >
                  <i class="ti ti-chevron-right"></i>
                </button>
              </div>

              <div class="grid grid-cols-7 text-center text-[11px] font-medium text-ink-400">
                @for (w of weekdays; track $index) {
                  <span class="py-1.5">{{ w }}</span>
                }
              </div>

              <div class="grid grid-cols-7">
                @for (cell of monthView().cells; track $index) {
                  @if (cell) {
                    <div class="flex h-10 items-center justify-center">
                      <button
                        type="button"
                        [disabled]="cell.disabled"
                        (click)="pick(cell)"
                        [attr.aria-label]="cell.iso"
                        [attr.aria-pressed]="cell.iso === value()"
                        [class]="dayClass(cell)"
                      >{{ cell.day }}</button>
                    </div>
                  } @else {
                    <div class="h-10"></div>
                  }
                }
              </div>
            }

            <!-- ── MONTH VIEW ── -->
            @if (mode() === 'month') {
              <div class="relative mb-3 flex items-center justify-center">
                <button
                  type="button"
                  (click)="prevYear()"
                  aria-label="Previous year"
                  class="absolute left-0 grid h-8 w-8 place-items-center rounded-full text-ink-600 transition hover:bg-ink-50"
                >
                  <i class="ti ti-chevron-left"></i>
                </button>
                <button
                  type="button"
                  (click)="mode.set('year')"
                  class="rounded-lg px-2 py-0.5 text-sm font-semibold text-ink-900 transition hover:bg-ink-50"
                  title="Pick year"
                >
                  {{ viewYear() }}
                </button>
                <button
                  type="button"
                  (click)="nextYear()"
                  aria-label="Next year"
                  class="absolute right-0 grid h-8 w-8 place-items-center rounded-full text-ink-600 transition hover:bg-ink-50"
                >
                  <i class="ti ti-chevron-right"></i>
                </button>
              </div>

              <div class="grid grid-cols-3 gap-1">
                @for (m of monthsAbbr; track $index) {
                  <button
                    type="button"
                    (click)="selectMonth($index)"
                    [class]="monthBtnClass($index)"
                  >{{ m }}</button>
                }
              </div>
            }

            <!-- ── YEAR VIEW ── -->
            @if (mode() === 'year') {
              <div class="mb-3 text-center text-sm font-semibold text-ink-900">
                Select year
              </div>
              <div class="hh-scroll-thin h-52 overflow-y-auto">
                @for (y of yearList; track y) {
                  <button
                    type="button"
                    (click)="selectYear(y)"
                    [class]="yearBtnClass(y)"
                  >{{ y }}</button>
                }
              </div>
            }

            <!-- Footer. With [withTime] the time row sits here rather than in a second
                 field, so the whole value is chosen in one panel. -->
            <div class="mt-3 flex items-center gap-3 border-t border-ink-100 pt-3"
                 [class.justify-between]="withTime()"
                 [class.justify-end]="!withTime()">
              @if (withTime()) {
                <hh-time-picker
                  class="min-w-0 flex-1"
                  [value]="timeValue()"
                  [minuteStep]="minuteStep()"
                  (valueChange)="pickTime($event)"
                />
              }
              <button
                type="button"
                (click)="clearAndClose()"
                class="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-600 underline-offset-2 transition hover:bg-ink-50 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class DatePicker {
  readonly value = model<string | null>(null);
  readonly placeholder = input('Pick a date');
  readonly label = input('');
  readonly error = input('');
  readonly variant = input<'pill' | 'field'>('field');
  readonly disabled = input(false);
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  /**
   * Adds a time row to the panel and widens the emitted value to
   * `YYYY-MM-DDTHH:mm`. Opt-in: every existing consumer is date-only, and two of them
   * bound the calendar with [min]/[max], so widening the default would change what
   * those bounds compare against.
   */
  readonly withTime = input(false);
  /** Time used when a day is picked before any time has been chosen. */
  readonly defaultTime = input('12:00');
  readonly minuteStep = input(15);

  protected readonly weekdays = WEEKDAYS;
  protected readonly monthsAbbr = MONTHS_ABBR;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly portal = viewChild<ElementRef<HTMLElement>>('portal');

  protected readonly open = signal(false);
  protected readonly mode = signal<'day' | 'month' | 'year'>('day');
  protected readonly pos = signal<{ top: number; left: number } | null>(null);
  private readonly viewMonth = signal(startOfMonth(new Date()));

  private readonly minMs = computed(() => parseMs(this.min()));
  private readonly maxMs = computed(() => parseMs(this.max()));

  // Static: currentYear+5 down to 1900, newest first
  private readonly _curYear = new Date().getFullYear();
  protected readonly yearList: readonly number[] = Array.from(
    { length: this._curYear + 5 - 1900 + 1 },
    (_, i) => this._curYear + 5 - i,
  );

  protected readonly viewYear = computed(() => this.viewMonth().getFullYear());

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detachListeners());
    effect(() => {
      const el = this.portal()?.nativeElement;
      if (el && typeof document !== 'undefined' && el.parentNode !== document.body) {
        document.body.appendChild(el);
      }
    });
    inject(Router).events
      .pipe(filter((e) => e instanceof NavigationStart), takeUntilDestroyed())
      .subscribe(() => this.close());
  }

  /** Trigger text. With a time, both halves show — "Aug 19, 4:30 PM". */
  protected readonly displayLabel = computed(() => {
    const base = shortLabel(this.value());
    const t = this.timeValue();
    if (!this.withTime() || !base || !t) return base;
    const time = timeLabel(t);
    return time ? `${base}, ${time}` : base;
  });

  /** Time half of the value, surfaced to the panel's time picker. */
  protected readonly timeValue = computed(() => timePart(this.value()));

  protected readonly monthView = computed<MonthView>(() => {
    const now = new Date();
    const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return buildMonth(this.viewMonth(), this.minMs(), this.maxMs(), todayMs);
  });

  protected readonly triggerClass = computed(() => {
    const base =
      'inline-flex w-full items-center gap-2 border font-medium transition ' +
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50';

    if (this.variant() === 'pill') {
      const active = !!this.value();
      const tone = active
        ? 'border-brand-500 bg-brand-50 text-brand-700'
        : 'border-ink-300 bg-white text-ink-800 hover:border-ink-400';
      return `${base} h-8 rounded-full px-3 text-[13px] ${tone}`;
    }

    const focus = this.open()
      ? 'border-brand-400 ring-2 ring-brand-100'
      : this.error()
        ? 'border-danger ring-1 ring-danger/20'
        : 'border-ink-200 hover:border-ink-400';
    return `${base} rounded-xl px-4 py-3 text-sm bg-white text-ink-800 ${focus}`;
  });

  protected dayClass(cell: DayCell): string {
    const base = 'grid h-10 w-10 place-items-center rounded-full text-sm transition';
    if (cell.disabled) return `${base} cursor-not-allowed text-ink-300`;
    if (cell.iso === this.value()) return `${base} bg-ink-900 font-semibold text-white`;
    return `${base} text-ink-800 hover:ring-1 hover:ring-inset hover:ring-ink-300 ${cell.today ? 'font-semibold' : ''}`;
  }

  protected monthBtnClass(monthIndex: number): string {
    const base = 'rounded-xl py-2.5 text-sm font-medium text-center transition';
    const selMs = parseMs(this.value());
    if (selMs != null) {
      const sd = new Date(selMs);
      if (sd.getMonth() === monthIndex && sd.getFullYear() === this.viewYear()) {
        return `${base} bg-ink-900 text-white`;
      }
    }
    const now = new Date();
    if (monthIndex === now.getMonth() && this.viewYear() === now.getFullYear()) {
      return `${base} font-semibold text-brand-700 hover:bg-ink-50`;
    }
    return `${base} text-ink-700 hover:bg-ink-50`;
  }

  protected yearBtnClass(year: number): string {
    const base = 'w-full rounded-xl px-3 py-2 text-sm text-left transition';
    const selMs = parseMs(this.value());
    if (selMs != null && new Date(selMs).getFullYear() === year) {
      return `${base} bg-ink-900 font-semibold text-white`;
    }
    if (year === this._curYear) {
      return `${base} font-semibold text-brand-700 hover:bg-ink-50`;
    }
    return `${base} text-ink-700 hover:bg-ink-50`;
  }

  protected toggle(): void {
    if (this.open()) { this.close(); return; }
    const anchor = parseMs(this.value()) ?? Date.now();
    this.viewMonth.set(startOfMonth(new Date(anchor)));
    this.mode.set('day');
    this.reposition();
    this.open.set(true);
    this.attachListeners();
  }

  protected close(): void {
    this.open.set(false);
    this.mode.set('day');
    this.detachListeners();
  }

  protected prevMonth(): void {
    this.viewMonth.update((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  protected nextMonth(): void {
    this.viewMonth.update((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
  protected prevYear(): void {
    this.viewMonth.update((d) => new Date(d.getFullYear() - 1, d.getMonth(), 1));
  }
  protected nextYear(): void {
    this.viewMonth.update((d) => new Date(d.getFullYear() + 1, d.getMonth(), 1));
  }

  protected selectMonth(monthIndex: number): void {
    this.viewMonth.update((d) => new Date(d.getFullYear(), monthIndex, 1));
    this.mode.set('day');
  }

  protected selectYear(year: number): void {
    this.viewMonth.update((d) => new Date(year, d.getMonth(), 1));
    this.mode.set('month');
  }

  protected pick(cell: DayCell): void {
    if (cell.disabled) return;
    if (!this.withTime()) {
      this.value.set(cell.iso);
      this.close();
      return;
    }
    // Keep the panel open: with a time row the user still has a second choice to make,
    // and closing here would force them to reopen it for every adjustment.
    this.value.set(`${cell.iso}T${this.timeValue() || this.defaultTime()}`);
  }

  /** Time row changed. Falls back to today so a time-first pick still yields a value. */
  protected pickTime(time: string | null): void {
    const day = datePart(this.value()) || todayIso();
    this.value.set(time ? `${day}T${time}` : day);
  }

  protected clear(event?: Event): void {
    event?.stopPropagation();
    this.clearAndClose();
  }

  protected clearAndClose(): void {
    this.value.set(null);
    this.close();
  }

  private readonly reposition = (): void => {
    const btn = this.host.nativeElement.querySelector(
      'button[aria-haspopup]',
    ) as HTMLElement | null;
    if (!btn || typeof window === 'undefined') return;
    const r = btn.getBoundingClientRect();
    const gap = 8;
    const panelW = Math.min(320, window.innerWidth - 16);
    const panelH = 360;

    let left = r.left;
    if (left + panelW > window.innerWidth - gap) left = window.innerWidth - gap - panelW;

    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const top = spaceBelow >= panelH || spaceBelow >= spaceAbove
      ? r.bottom + gap
      : r.top - panelH - gap;

    this.pos.set({ top: Math.max(gap, top), left: Math.max(gap, left) });
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
