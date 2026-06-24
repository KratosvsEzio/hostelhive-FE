import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type CardVariant = 'elevated' | 'bordered' | 'dashed';
export type CardPadding = 'none' | 'sm' | 'md';

const VARIANTS: Record<CardVariant, string> = {
  elevated: 'bg-white shadow-card',
  bordered: 'border border-ink-100 bg-white',
  dashed: 'border border-dashed border-ink-200 bg-white',
};

const PADDING: Record<CardPadding, string> = { none: '', sm: 'p-4', md: 'p-5' };

/** Surface container. `<hh-card variant="elevated">…</hh-card>` */
@Component({
  selector: 'hh-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'classes()' },
})
export class Card {
  readonly variant = input<CardVariant>('elevated');
  readonly padding = input<CardPadding>('md');
  /** Set to true for cards containing tooltips that must overflow the card boundary. */
  readonly allowOverflow = input(false);

  protected readonly classes = computed(
    () =>
      `block rounded-2xl ${this.allowOverflow() ? 'overflow-visible' : 'overflow-hidden'} ${VARIANTS[this.variant()]} ${PADDING[this.padding()]}`,
  );
}
