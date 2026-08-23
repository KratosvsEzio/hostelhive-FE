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
import { TranslocoPipe } from '@jsverse/transloco';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

type Period = 'AM' | 'PM';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Parse a 24-hour `HH:mm` string into 12-hour parts; null for empty/invalid. */
function parse(value: string | null): { h12: number; minute: number; period: Period } | null {
  if (!value) return null;
  const [hs, ms] = value.split(':');
  const h24 = Number(hs);
  const minute = Number(ms);
  if (!Number.isFinite(h24) || !Number.isFinite(minute) || h24 < 0 || h24 > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { h12: ((h24 + 11) % 12) + 1, minute, period: h24 < 12 ? 'AM' : 'PM' };
}

/** Compose 12-hour parts back into a 24-hour `HH:mm` string. */
function compose(h12: number, minute: number, period: Period): string {
  const h24 = period === 'AM' ? h12 % 12 : (h12 % 12) + 12;
  return `${pad(h24)}:${pad(minute)}`;
}

function label(value: string | null): string {
  const p = parse(value);
  return p ? `${p.h12}:${pad(p.minute)} ${p.period}` : '';
}

/**
 * Themed time picker — the brand-styled replacement for the native, un-themeable
 * `<input type="time">`. The trigger matches `hh-date-picker` / field dropdowns; the panel
 * is teleported to `<body>` and positioned `fixed`, so it escapes any `overflow` ancestor.
 *
 * `value` is a two-way 24-hour `HH:mm` string (e.g. `"07:30"`), displayed in 12-hour form.
 *
 *   <hh-time-picker label="Meal time" [(value)]="mealTime" />
 *   <hh-time-picker variant="pill" [(value)]="t" [minuteStep]="15" />
 */
@Component({
  selector: 'hh-time-picker',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
        <span
          class="flex-1 truncate text-start"
          [class]="value() ? 'text-ink-900' : 'text-ink-400'"
        >{{ value() ? displayLabel() : (placeholder() ?? ('common.pickATime' | transloco)) }}</span>
        <i class="ti ti-clock shrink-0 text-ink-400" aria-hidden="true"></i>
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
            [attr.aria-label]="'a11y.closeTimePicker' | transloco"
            (click)="close()"
          ></button>

          <!-- Panel -->
          <div
            role="dialog"
            [attr.aria-label]="'a11y.chooseTime' | transloco"
            class="fixed z-[71] w-64 rounded-3xl border border-ink-100 bg-white p-4 shadow-pill"
            [style.top.px]="pos()?.top"
            [style.left.px]="pos()?.left"
          >
            <p class="mb-3 text-center font-display text-lg font-semibold text-ink-900">
              {{ displayLabel() }}
            </p>

            <div class="grid grid-cols-[1fr_1fr_auto] gap-2">
              <!-- Hours -->
              <div #hourCol class="hh-scroll-thin h-44 overflow-y-auto rounded-xl bg-surface p-1">
                @for (h of hours; track h) {
                  <button
                    type="button"
                    (click)="setHour(h)"
                    [attr.data-selected]="h === h12()"
                    [class]="cellClass(h === h12())"
                  >{{ h }}</button>
                }
              </div>

              <!-- Minutes -->
              <div #minuteCol class="hh-scroll-thin h-44 overflow-y-auto rounded-xl bg-surface p-1">
                @for (m of minutes(); track m) {
                  <button
                    type="button"
                    (click)="setMinute(m)"
                    [attr.data-selected]="m === minute()"
                    [class]="cellClass(m === minute())"
                  >{{ fmt(m) }}</button>
                }
              </div>

              <!-- AM / PM -->
              <div class="flex flex-col gap-1">
                @for (p of periods; track p) {
                  <button
                    type="button"
                    (click)="setPeriod(p)"
                    [class]="periodClass(p === period())"
                  >{{ p }}</button>
                }
              </div>
            </div>

            <div class="mt-3 flex items-center justify-end border-t border-ink-100 pt-3">
              <button
                type="button"
                (click)="close()"
                class="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-600 transition hover:bg-brand-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class TimePicker {
  /** Two-way 24-hour `HH:mm` string. */
  readonly value = model<string | null>(null);
  readonly placeholder = input<string | undefined>(undefined);
  readonly label = input('');
  readonly error = input('');
  readonly variant = input<'pill' | 'field'>('field');
  readonly disabled = input(false);
  /** Minute granularity offered in the column (the current off-grid minute is always included). */
  readonly minuteStep = input(5);

  protected readonly hours: readonly number[] = Array.from({ length: 12 }, (_, i) => i + 1);
  protected readonly periods: readonly Period[] = ['AM', 'PM'];
  protected readonly fmt = pad;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly portal = viewChild<ElementRef<HTMLElement>>('portal');

  protected readonly open = signal(false);
  protected readonly pos = signal<{ top: number; left: number } | null>(null);

  // Working 12-hour parts, seeded from `value` on open and written back on every change.
  protected readonly h12 = signal(12);
  protected readonly minute = signal(0);
  protected readonly period = signal<Period>('AM');

  protected readonly displayLabel = computed(() => label(this.value()));

  /** Minute options at the configured step, plus the current off-grid minute so it stays pickable. */
  protected readonly minutes = computed<number[]>(() => {
    const step = Math.max(1, this.minuteStep());
    const base: number[] = [];
    for (let m = 0; m < 60; m += step) base.push(m);
    const cur = this.minute();
    return base.includes(cur) ? base : [...base, cur].sort((a, b) => a - b);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detachListeners());
    // Teleport the panel to <body> so `fixed` coords are viewport-relative regardless of
    // overflow/transform ancestors (mirrors hh-date-picker / hh-dropdown).
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

  protected readonly triggerClass = computed(() => {
    const base =
      'inline-flex w-full items-center gap-2 border font-medium transition ' +
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50';

    if (this.variant() === 'pill') {
      const tone = this.value()
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

  protected cellClass(selected: boolean): string {
    const base = 'w-full rounded-lg px-2 py-2 text-center text-sm transition';
    return selected
      ? `${base} bg-brand-500 font-semibold text-white`
      : `${base} text-ink-700 hover:bg-ink-100`;
  }

  protected periodClass(selected: boolean): string {
    const base = 'rounded-lg px-3 py-2 text-sm font-medium transition';
    return selected
      ? `${base} bg-brand-500 text-white`
      : `${base} text-ink-700 hover:bg-ink-100`;
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    const p = parse(this.value()) ?? { h12: 12, minute: 0, period: 'PM' as Period };
    this.h12.set(p.h12);
    this.minute.set(p.minute);
    this.period.set(p.period);
    this.reposition();
    this.open.set(true);
    this.attachListeners();
    // Let the panel render, then bring the selected hour/minute into view.
    if (typeof window !== 'undefined') setTimeout(() => this.scrollSelectedIntoView(), 0);
  }

  protected close(): void {
    this.open.set(false);
    this.detachListeners();
  }

  protected setHour(h: number): void {
    this.h12.set(h);
    this.commit();
  }
  protected setMinute(m: number): void {
    this.minute.set(m);
    this.commit();
  }
  protected setPeriod(p: Period): void {
    this.period.set(p);
    this.commit();
  }

  private commit(): void {
    this.value.set(compose(this.h12(), this.minute(), this.period()));
  }

  private scrollSelectedIntoView(): void {
    const root = this.portal()?.nativeElement;
    root
      ?.querySelectorAll<HTMLElement>('[data-selected="true"]')
      .forEach((el) => el.scrollIntoView({ block: 'center' }));
  }

  private readonly reposition = (): void => {
    const btn = this.host.nativeElement.querySelector(
      'button[aria-haspopup]',
    ) as HTMLElement | null;
    if (!btn || typeof window === 'undefined') return;
    const r = btn.getBoundingClientRect();
    const gap = 8;
    const panelW = Math.min(256, window.innerWidth - 16);
    const panelH = 300;

    let left = r.left;
    if (left + panelW > window.innerWidth - gap) left = window.innerWidth - gap - panelW;

    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const top =
      spaceBelow >= panelH || spaceBelow >= spaceAbove ? r.bottom + gap : r.top - panelH - gap;

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
