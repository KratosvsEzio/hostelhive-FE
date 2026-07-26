import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type BadgeVariant =
  | 'boys'
  | 'girls'
  | 'coliving'
  | 'verified'
  | 'neutral';

/** Outlined-button styling (see Button's OUTLINED shape) — border + matching text, white fill
 *  so the pill stays legible when it sits over a photo. Non-interactive: no hover/focus states. */
const PILL: Record<Exclude<BadgeVariant, 'verified'>, string> = {
  boys: 'border-boys bg-white text-boys',
  girls: 'border-girls bg-white text-girls',
  coliving: 'border-brand-400 bg-white text-brand-600',
  neutral: 'border-ink-300 bg-white text-ink-700',
};

const DEFAULT_ICON: Record<BadgeVariant, string> = {
  boys: 'ti-gender-male',
  girls: 'ti-gender-female',
  coliving: 'ti-users',
  verified: 'ti-rosette-discount-check',
  neutral: '',
};

/** Gender / trust / category badge. `<hh-badge variant="boys">Boys</hh-badge>` */
@Component({
  selector: 'hh-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (iconClass()) {
      <i class="ti text-sm" [class]="iconClass()" aria-hidden="true"></i>
    }
    <ng-content />
  `,
  host: { '[class]': 'classes()' },
})
export class Badge {
  readonly variant = input<BadgeVariant>('neutral');
  /** Override the default Tabler icon for the variant; set to '' to hide. */
  readonly icon = input<string | null>(null);
  /** Drop the outline and keep just the white fill — used where the pill sits on a photo. */
  readonly bordered = input(true);

  protected readonly iconClass = computed(() => {
    const override = this.icon();
    return override === null ? DEFAULT_ICON[this.variant()] : override;
  });

  protected readonly classes = computed(() => {
    const v = this.variant();
    if (v === 'verified') {
      return 'inline-flex items-center gap-1 text-xs font-medium text-brand-600';
    }
    const outline = this.bordered() ? 'border ' : '';
    return `inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${outline}${PILL[v]}`;
  });
}
