import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'hh-donut',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 36 36" class="h-12 w-12" role="img" [attr.aria-label]="ariaLabel()">
      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#E6E6E6" stroke-width="3" pathLength="100" />
      <circle
        cx="18" cy="18" r="15.9" fill="none"
        stroke="#F36E21" stroke-width="3" stroke-linecap="round"
        pathLength="100" transform="rotate(-90 18 18)"
        [attr.stroke-dasharray]="dash()"
      />
    </svg>
  `,
})
export class DonutChart {
  readonly pct = input(0);
  readonly ariaLabel = input('');

  protected readonly dash = computed(() => {
    const v = Math.min(100, Math.max(0, this.pct()));
    return `${v} ${100 - v}`;
  });
}
