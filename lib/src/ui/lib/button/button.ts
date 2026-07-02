import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
} from '@angular/core';

export type ButtonVariant = 'filled' | 'outlined' | 'text' | 'icon' | 'filled-icon';
export type ButtonColor = 'default' | 'primary' | 'success' | 'danger' | 'dark';
export type ButtonSize = 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

const BASE =
  'inline-flex items-center justify-center whitespace-nowrap transition select-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

/** Padding + text + gap + radius for text/filled/outlined variants */
const SIZE_TEXT: Record<ButtonSize, string> = {
  'xxs': 'gap-1   rounded-md   px-1.5 py-0.5 text-[10px]',
  'xs':  'gap-1   rounded-lg   px-2   py-1   text-xs',
  'sm':  'gap-1.5 rounded-xl   px-3   py-2   text-xs',
  'md':  'gap-2   rounded-xl   px-4   py-2.5 text-sm',
  'lg':  'gap-2   rounded-xl   px-5   py-3   text-sm',
  'xl':  'gap-2   rounded-xl   px-6   py-3.5 text-base',
  '2xl': 'gap-2.5 rounded-2xl  px-7   py-4   text-lg',
  '3xl': 'gap-2.5 rounded-2xl  px-8   py-5   text-xl',
  '4xl': 'gap-3   rounded-2xl  px-10  py-6   text-2xl',
  '5xl': 'gap-3   rounded-2xl  px-12  py-7   text-3xl',
};

/** Fixed square + radius for icon/filled-icon variants */
const SIZE_ICON: Record<ButtonSize, string> = {
  'xxs': 'h-5  w-5  rounded-md',
  'xs':  'h-6  w-6  rounded-lg',
  'sm':  'h-8  w-8  rounded-xl',
  'md':  'h-9  w-9  rounded-xl',
  'lg':  'h-10 w-10 rounded-xl',
  'xl':  'h-11 w-11 rounded-xl',
  '2xl': 'h-12 w-12 rounded-xl',
  '3xl': 'h-14 w-14 rounded-2xl',
  '4xl': 'h-16 w-16 rounded-2xl',
  '5xl': 'h-20 w-20 rounded-2xl',
};

const FILLED: Record<ButtonColor, string> = {
  default: 'bg-ink-100 font-medium text-ink-700 hover:bg-ink-200',
  primary: 'bg-brand-500 font-semibold text-white shadow-card hover:bg-brand-600',
  success: 'bg-ok font-semibold text-white hover:brightness-95',
  danger: 'bg-danger font-semibold text-white hover:brightness-95',
  dark: 'bg-ink-900 font-medium text-white hover:bg-black',
};

const OUTLINED: Record<ButtonColor, string> = {
  default: 'border border-ink-300 font-medium text-ink-800 hover:bg-ink-50',
  primary: 'border border-brand-400 font-medium text-brand-600 hover:bg-brand-50',
  success: 'border border-ok/60 font-medium text-ok hover:bg-ok/5',
  danger: 'border border-danger/60 font-medium text-danger hover:bg-danger/5',
  dark: 'border border-ink-700 font-medium text-ink-900 hover:bg-ink-50',
};

const TEXT: Record<ButtonColor, string> = {
  default: 'font-medium text-ink-700 hover:bg-ink-50',
  primary: 'font-medium text-brand-600 hover:bg-brand-50',
  success: 'font-medium text-ok hover:bg-ok/5',
  danger: 'font-medium text-danger hover:bg-danger/5',
  dark: 'font-medium text-ink-900 hover:bg-ink-100',
};

/** Icon-only, no background — inherits TEXT colors */
const ICON = TEXT;

/** Icon-only with filled background — inherits FILLED colors */
const FILLED_ICON = FILLED;

const SHAPES = {
  filled: FILLED,
  outlined: OUTLINED,
  text: TEXT,
  icon: ICON,
  'filled-icon': FILLED_ICON,
} as const;

/**
 * Button directive. Apply to a native `<button>` or `<a>`:
 * `<button hh-button color="primary">Save</button>`
 * `<button hh-button variant="outlined">Cancel</button>`
 * `<button hh-button variant="icon"><i class="ti ti-x"></i></button>`
 */
@Component({
  selector: 'button[hh-button], a[hh-button]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <i class="ti ti-loader-2 animate-spin" aria-hidden="true"></i>
    }
    <ng-content />
  `,
  host: {
    '[class]': 'classes()',
    '[attr.disabled]': 'disabledAttr()',
    '[attr.aria-busy]': 'loading() || null',
  },
})
export class Button {
  private readonly el = inject(ElementRef<HTMLElement>);

  readonly variant = input<ButtonVariant>('filled');
  readonly color = input<ButtonColor>('default');
  readonly size = input<ButtonSize>('sm');
  readonly disabled = input(false);
  readonly loading = input(false);

  protected readonly classes = computed(() => {
    const v = this.variant();
    const isIcon = v === 'icon' || v === 'filled-icon';
    const size = isIcon ? SIZE_ICON[this.size()] : SIZE_TEXT[this.size()];
    return `${BASE} ${size} ${SHAPES[v][this.color()]}`;
  });

  protected readonly disabledAttr = computed(() =>
    this.el.nativeElement.tagName === 'BUTTON' &&
    (this.disabled() || this.loading())
      ? ''
      : null,
  );
}
