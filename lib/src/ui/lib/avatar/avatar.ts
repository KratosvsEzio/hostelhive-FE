import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
export type AvatarTone = 'brand' | 'sky' | 'cream' | 'mint';

const SIZES: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-xl',
  '2xl': 'h-24 w-24 text-2xl',
  '3xl': 'h-28 w-28 text-3xl',
  '4xl': 'h-32 w-32 text-4xl',
};

const TONES: Record<AvatarTone, string> = {
  brand: 'bg-brand-500 text-white',
  sky: 'bg-tint-sky text-ink-700',
  cream: 'bg-tint-cream text-ink-700',
  mint: 'bg-tint-mint text-ink-700',
};

/** Initials avatar. `<hh-avatar initials="AR" tone="sky" />` */
@Component({
  selector: 'hh-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="initials()" [class]="'h-full w-full object-cover ' + (circle() ? 'rounded-full' : 'rounded')" />
    } @else {
      {{ initials() }}
    }
  `,
  host: { '[class]': 'classes()', role: 'img' },
})
export class Avatar {
  readonly initials = input('');
  readonly size = input<AvatarSize>('md');
  readonly tone = input<AvatarTone>('brand');
  readonly src = input('');
  readonly circle = input<boolean>(true);

  protected readonly classes = computed(() => {
    const radius = this.circle() ? 'rounded-full' : 'rounded';
    return `inline-grid place-items-center ${radius} font-semibold overflow-hidden ${SIZES[this.size()]} ${TONES[this.tone()]}`;
  });
}
