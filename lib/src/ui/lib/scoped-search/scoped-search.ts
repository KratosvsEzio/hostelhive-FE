import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
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
      [value]="draft()"
      (input)="onInput($any($event.target).value)"
      (keydown.enter)="flush()"
      [placeholder]="placeholder()"
      [attr.aria-label]="ariaLabel()"
      class="min-w-0 flex-1 bg-transparent text-ink-900 outline-none placeholder:text-ink-400"
      [class]="sz().text"
    />
    @if (draft()) {
      <button
        type="button"
        (click)="clear()"
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
  /**
   * Search text (two-way). Emits `debounceMs` after the user stops typing — NOT on every
   * keystroke — so consumers can bind a query straight to `(termChange)` without wiring their
   * own debounce. Clearing (the X or an empty field) and pressing Enter emit immediately.
   */
  readonly term = model('');
  readonly placeholder = input('Search…');
  readonly ariaLabel = input('Search');
  readonly size = input<SearchSize>('sm');
  /** Dropdown tone — `neutral` keeps the scope segment calm even when a value is set. */
  readonly tone = input<'auto' | 'neutral'>('neutral');
  /** Delay before a keystroke is committed to `term`. Set `0` for an instant local filter. */
  readonly debounceMs = input(600);

  /**
   * Immediate mirror of the input text. Drives the visible value and the clear button so
   * typing feels instant, while `term` (and thus `termChange`) only follows after the
   * debounce. Seeded from `term` and re-synced by the effect below on any external change.
   */
  protected readonly draft = signal(this.term());
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Re-sync the visible draft whenever `term` is set from outside (parent reset, URL
    // restore, programmatic clear) and cancel any pending debounce, so a stale in-flight
    // keystroke can't resurrect the old text after the external change lands.
    effect(() => {
      const t = this.term();
      untracked(() => {
        if (t !== this.draft()) {
          clearTimeout(this.debounceTimer);
          this.draft.set(t);
        }
      });
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.debounceTimer));
  }

  protected readonly sz = computed(() => SIZES[this.size()]);

  protected readonly hostClass = computed(() => {
    const s = this.sz();
    return `${BASE} ${s.h} ${s.pr}`;
  });

  protected onInput(value: string): void {
    this.draft.set(value);
    clearTimeout(this.debounceTimer);
    if (this.debounceMs() <= 0) {
      this.commit(value);
      return;
    }
    this.debounceTimer = setTimeout(() => {
      // A later external change may have re-synced the draft; only commit if this keystroke
      // is still the current text, to avoid overwriting it.
      if (this.draft() === value) this.commit(value);
    }, this.debounceMs());
  }

  /** Enter bypasses the debounce — the user has signalled they're done typing. */
  protected flush(): void {
    clearTimeout(this.debounceTimer);
    this.commit(this.draft());
  }

  protected clear(): void {
    clearTimeout(this.debounceTimer);
    this.draft.set('');
    this.commit('');
  }

  private commit(value: string): void {
    if (this.term() !== value) this.term.set(value);
  }

  protected onFieldChange(v: string | string[] | null): void {
    this.field.set(typeof v === 'string' ? v : null);
  }
}
