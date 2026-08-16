import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { CompactNumber } from '../compact-number/compact-number';

export interface BarChartBar {
  label: string;
  value: number;
  pct: number;
}

export interface BarChartTick {
  label: string;
}

@Component({
  selector: 'hh-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, CompactNumber],
  template: `
    <div class="flex gap-2">
      <!-- Y-axis -->
      <div
        class="flex shrink-0 flex-col justify-between py-2 text-right text-[10px] leading-none text-ink-400"
        [style.height]="height()"
      >
        @for (t of yTicks(); track $index) {
          <span>{{ t.label }}</span>
        }
      </div>

      <div class="min-w-0 flex-1">
        <div class="relative" [style.height]="height()">
          <!-- Gridlines -->
          <div class="pointer-events-none absolute inset-x-0 top-2 bottom-2 flex flex-col justify-between">
            @for (t of yTicks(); track $index; let last = $last) {
              <div class="border-t" [class]="last ? 'border-ink-200' : 'border-ink-100'"></div>
            }
          </div>

          <!-- Bars -->
          <div class="absolute inset-x-0 top-2 bottom-2 flex items-end" [class]="barGap()">
            @for (b of bars(); track $index; let i = $index; let first = $first; let last = $last) {
              <div
                class="group relative flex h-full flex-1 flex-col justify-end"
                (click)="toggle(i)"
              >
                <!-- Value tooltip. Hover-driven on pointer devices; the selected index is
                     the tap path, since touch has no hover and the pill hides on phones. -->
                @if (b.value > 0) {
                  <div
                    class="pointer-events-none absolute z-10 hidden w-32 group-hover:block"
                    [class]="first ? 'left-0' : last ? 'right-0' : 'left-1/2 -translate-x-1/2'"
                    [style.bottom]="'calc(' + b.pct + '% + 14px)'"
                    [style.display]="selected() === i ? 'block' : null"
                  >
                    <div class="rounded-xl bg-ink-900 px-3 py-2 shadow-lg">
                      <p class="text-[11px] font-semibold text-white">{{ b.label }}</p>
                      <p class="text-[11px] font-medium text-brand-200">Rs {{ b.value | number }}</p>
                    </div>
                  </div>
                }
                <!-- Pill label — hidden on phones, where bars are far too narrow to hold it
                     (12 months across ~267px leaves ~15px per bar). Tap the bar instead. -->
                @if (b.value > 0) {
                  <span class="mb-1 hidden self-center rounded-full bg-brand-50 px-1.5 py-0.5 text-[8px] font-bold leading-none text-brand-600 sm:inline-flex">
                    {{ b.value | compactNum }}
                  </span>
                }
                <!-- Bar -->
                <div
                  class="rounded-t bg-brand-500 transition group-hover:bg-brand-600"
                  [class.bg-brand-600]="selected() === i"
                  [style.height.%]="b.pct"
                  [style.min-height.px]="b.value > 0 ? 3 : 0"
                ></div>
              </div>
            }
          </div>
        </div>

        <!-- X-axis labels -->
        <div class="mt-2 flex justify-between text-[10px] text-ink-400">
          @for (b of bars(); track $index; let i = $index) {
            <span [class.invisible]="xLabelStep() > 1 && i % xLabelStep() !== 0 && i !== bars().length - 1">
              {{ b.label }}
            </span>
          }
        </div>
      </div>
    </div>
  `,
})
export class BarChart {
  readonly bars = input.required<BarChartBar[]>();
  readonly yTicks = input.required<BarChartTick[]>();
  readonly height = input('10rem');
  readonly barGap = input('gap-1.5');
  readonly xLabelStep = input(1);

  /** Tapped bar index — the touch equivalent of hovering. Tapping it again clears it. */
  protected readonly selected = signal<number | null>(null);

  protected toggle(i: number): void {
    this.selected.update((current) => (current === i ? null : i));
  }
}
