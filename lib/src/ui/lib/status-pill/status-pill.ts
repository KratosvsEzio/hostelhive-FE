import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type StatusTone = 'ok' | 'warn' | 'danger' | 'neutral';
export type StatusSize = 'sm' | 'xs';

const TONES: Record<StatusTone, string> = {
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/10 text-warn',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-ink-100 text-ink-600',
};

const SIZES: Record<StatusSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  xs: 'px-1.5 py-px text-[10px]',
};

/**
 * Status chip — tinted background + semantic text. Always paired with a text
 * label (WCAG: never colour-only). `<hh-status-pill tone="ok" dot>Paid</hh-status-pill>`
 */
@Component({
  selector: 'hh-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dot()) {
      <i class="ti ti-circle-filled text-[8px]" aria-hidden="true"></i>
    }
    <ng-content />
  `,
  host: { '[class]': 'classes()' },
})
export class StatusPill {
  readonly tone = input<StatusTone>('neutral');
  readonly dot = input(false);
  readonly size = input<StatusSize>('sm');

  protected readonly classes = computed(
    () =>
      `inline-flex items-center gap-1 rounded-full font-medium ${SIZES[this.size()]} ${TONES[this.tone()]}`,
  );
}
