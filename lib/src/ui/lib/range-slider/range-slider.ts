import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

/**
 * Dual-thumb range slider (e.g. budget). Two-way bind both ends:
 * `<hh-range-slider [min]="5000" [max]="60000" [step]="500" prefix="Rs " [(low)]="lo" [(high)]="hi" />`
 */
@Component({
  selector: 'hh-range-slider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="relative h-1 rounded bg-ink-100">
      <div
        class="absolute h-1 rounded bg-brand-500"
        [style.left.%]="loPct()"
        [style.right.%]="100 - hiPct()"
      ></div>
      <input
        class="hh-range"
        type="range"
        [min]="min()"
        [max]="max()"
        [step]="step()"
        [value]="low()"
        (input)="setLow($any($event.target).valueAsNumber)"
        aria-label="Minimum"
      />
      <input
        class="hh-range"
        type="range"
        [min]="min()"
        [max]="max()"
        [step]="step()"
        [value]="high()"
        (input)="setHigh($any($event.target).valueAsNumber)"
        aria-label="Maximum"
      />
    </div>
    <div class="mt-2 flex justify-between text-xs text-ink-500">
      <span>{{ prefix() }}{{ low() | number }}</span>
      <span>{{ prefix() }}{{ high() | number }}</span>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        padding-top: 0.75rem;
      }
      .hh-range {
        -webkit-appearance: none;
        appearance: none;
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 100%;
        height: 0;
        margin: 0;
        background: transparent;
        pointer-events: none;
      }
      .hh-range:focus-visible {
        outline: none;
      }
      .hh-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        pointer-events: auto;
        height: 16px;
        width: 16px;
        border-radius: 9999px;
        border: 2px solid #f36e21;
        background: #fff;
        box-shadow: 0 2px 8px rgba(31, 31, 31, 0.08);
        cursor: pointer;
      }
      .hh-range::-moz-range-thumb {
        pointer-events: auto;
        height: 16px;
        width: 16px;
        border-radius: 9999px;
        border: 2px solid #f36e21;
        background: #fff;
        box-shadow: 0 2px 8px rgba(31, 31, 31, 0.08);
        cursor: pointer;
      }
    `,
  ],
  host: { class: 'block' },
})
export class RangeSlider {
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly prefix = input('');
  readonly low = model(0);
  readonly high = model(100);

  protected readonly loPct = computed(() => this.pct(this.low()));
  protected readonly hiPct = computed(() => this.pct(this.high()));

  private pct(v: number): number {
    const range = this.max() - this.min();
    return range <= 0 ? 0 : ((v - this.min()) / range) * 100;
  }

  protected setLow(v: number): void {
    this.low.set(Math.min(v, this.high() - this.step()));
  }

  protected setHigh(v: number): void {
    this.high.set(Math.max(v, this.low() + this.step()));
  }
}
