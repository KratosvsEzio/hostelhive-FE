import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

/** Wizard stepper. `<hh-stepper [steps]="['Basic','Location','Media']" [current]="1" />` */
@Component({
  selector: 'hh-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (step of steps(); track step; let i = $index, last = $last) {
      <button
        type="button"
        [disabled]="!isClickable(i)"
        (click)="onStep(i)"
        class="flex items-center gap-2 whitespace-nowrap text-sm transition enabled:cursor-pointer enabled:hover:opacity-80 disabled:cursor-default"
        [class]="labelClass(i)"
      >
        <span
          class="grid h-7 w-7 place-items-center rounded-full"
          [class]="circleClass(i)"
        >
          @if (i < current()) {
            <i class="ti ti-check text-sm" aria-hidden="true"></i>
          } @else {
            {{ i + 1 }}
          }
        </span>
        {{ step }}
      </button>
      @if (!last) {
        <span class="h-px w-8 shrink-0 bg-ink-200"></span>
      }
    }
  `,
  host: { class: 'flex items-center gap-2 overflow-x-auto', role: 'list' },
})
export class Stepper {
  readonly steps = input<string[]>([]);
  readonly current = input(0);
  /** Opt-in: when true, already-completed steps become clickable (jump-back navigation). */
  readonly clickable = input(false);
  /** Emits the index of a clicked completed step; the parent decides how to navigate. */
  readonly stepSelect = output<number>();

  /** Only already-completed steps (index < current) are navigable — never the current or upcoming ones. */
  protected isClickable(i: number): boolean {
    return this.clickable() && i < this.current();
  }

  protected onStep(i: number): void {
    if (this.isClickable(i)) this.stepSelect.emit(i);
  }

  protected labelClass(i: number): string {
    if (i < this.current()) return 'font-medium text-ok';
    if (i === this.current()) return 'font-semibold text-brand-600';
    return 'font-medium text-ink-400';
  }

  protected circleClass(i: number): string {
    if (i < this.current()) return 'bg-ok text-white';
    if (i === this.current()) return 'bg-brand-500 text-white';
    return 'border border-ink-300 text-ink-400';
  }
}
