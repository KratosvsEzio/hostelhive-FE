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

const PILL: Record<Exclude<BadgeVariant, 'verified'>, string> = {
  boys: 'bg-boys text-white',
  girls: 'bg-girls text-white',
  coliving: 'bg-brand-500 text-white',
  neutral: 'bg-ink-50 text-ink-600',
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

  protected readonly iconClass = computed(() => {
    const override = this.icon();
    return override === null ? DEFAULT_ICON[this.variant()] : override;
  });

  protected readonly classes = computed(() => {
    const v = this.variant();
    if (v === 'verified') {
      return 'inline-flex items-center gap-1 text-xs font-medium text-brand-600';
    }
    return `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${PILL[v]}`;
  });
}
