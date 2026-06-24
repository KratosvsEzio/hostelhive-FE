import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type SkeletonRadius = 'sm' | 'md' | 'lg' | 'full';

const RADII: Record<SkeletonRadius, string> = {
  sm: 'rounded',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  full: 'rounded-full',
};

/**
 * Shimmer placeholder. Size it with utility classes:
 * `<hh-skeleton class="h-4 w-3/4" />` or `<hh-skeleton class="aspect-[4/3]" radius="lg" />`
 */
@Component({
  selector: 'hh-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: { '[class]': 'classes()', 'aria-hidden': 'true' },
})
export class Skeleton {
  readonly radius = input<SkeletonRadius>('sm');

  protected readonly classes = computed(
    () => `block shimmer ${RADII[this.radius()]}`,
  );
}
