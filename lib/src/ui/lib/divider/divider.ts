import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'hh-divider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'hostClass()' },
  template: ``,
})
export class Divider {
  readonly orientation = input<'vertical' | 'horizontal'>('vertical');
  readonly color = input<'default' | 'light'>('default');

  protected readonly hostClass = computed(() => {
    const c = this.color() === 'light' ? 'bg-ink-100' : 'bg-ink-200';
    return this.orientation() === 'vertical'
      ? `self-stretch w-px ${c}`
      : `block w-full h-px ${c}`;
  });
}
