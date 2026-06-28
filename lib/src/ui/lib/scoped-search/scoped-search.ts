import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import { Dropdown, DropdownOption } from '../dropdown/dropdown';

export type SearchSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<SearchSize, { h: string; pr: string; icon: string; text: string }> = {
  sm: { h: 'h-8',  pr: 'pr-1',   icon: 'mx-1.5 text-sm',     text: 'text-xs'     },
  md: { h: 'h-9',  pr: 'pr-1.5', icon: 'mx-2   text-[15px]', text: 'text-[13px]' },
  lg: { h: 'h-10', pr: 'pr-2',   icon: 'mx-2.5 text-base',   text: 'text-sm'     },
  xl: { h: 'h-11', pr: 'pr-2.5', icon: 'mx-3   text-lg',     text: 'text-base'   },
};

const BASE =
  'flex items-center overflow-hidden rounded-lg border border-ink-300 bg-white transition ' +
  'focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100';

/**
 * Pill-shaped search input. Optionally shows a scope/field dropdown on the left.
 *
 * Pass `[withScope]="false"` (or omit `fieldOptions`) for a plain search input.
 *
 *   <!-- Scoped (with dropdown) -->
 *   <hh-search [fieldOptions]="opts" [(field)]="f" [(term)]="q" placeholder="Search…" />
 *
 *   <!-- Plain (no dropdown) -->
 *   <hh-search [withScope]="false" [(term)]="q" placeholder="Search…" />
 */
@Component({
  selector: 'hh-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown],
  host: { '[class]': 'hostClass()' },
  template: `
    @if (withScope() && fieldOptions().length) {
      <hh-dropdown
        class="shrink-0"
        [seamless]="true"
        [tone]="tone()"
        [options]="fieldOptions()"
        [value]="field()"
        (valueChange)="onFieldChange($event)"
      />
      <span class="h-5 w-px shrink-0 bg-ink-200"></span>
    }
    <i
      class="ti ti-search shrink-0 text-ink-400"
      [class]="sz().icon"
      aria-hidden="true"
    ></i>
    <input
      type="text"
      [value]="term()"
      (input)="term.set($any($event.target).value)"
      [placeholder]="placeholder()"
      [attr.aria-label]="ariaLabel()"
      class="min-w-0 flex-1 bg-transparent text-ink-900 outline-none placeholder:text-ink-400"
      [class]="sz().text"
    />
    @if (term()) {
      <button
        type="button"
        (click)="term.set('')"
        aria-label="Clear search"
        class="shrink-0 rounded-md p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
      >
        <i class="ti ti-x text-sm" aria-hidden="true"></i>
      </button>
    }
  `,
})
export class Search {
  /** When false, the scope dropdown is hidden even if fieldOptions are provided — plain input mode. */
  readonly withScope = input(true);
  /** Scope/field options. Only rendered when withScope is true and options are non-empty. */
  readonly fieldOptions = input<DropdownOption[]>([]);
  /** Selected scope value (two-way). */
  readonly field = model<string | null>(null);
  /** Search text (two-way). */
  readonly term = model('');
  readonly placeholder = input('Search…');
  readonly ariaLabel = input('Search');
  readonly size = input<SearchSize>('sm');
  /** Dropdown tone — `neutral` keeps the scope segment calm even when a value is set. */
  readonly tone = input<'auto' | 'neutral'>('neutral');

  protected readonly sz = computed(() => SIZES[this.size()]);

  protected readonly hostClass = computed(() => {
    const s = this.sz();
    return `${BASE} ${s.h} ${s.pr}`;
  });

  protected onFieldChange(v: string | string[] | null): void {
    this.field.set(typeof v === 'string' ? v : null);
  }
}
