import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
} from '@angular/core';
import { Dropdown, DropdownOption } from '../dropdown/dropdown';

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
  host: {
    class:
      'flex h-9 items-center rounded-full border border-ink-300 bg-white pr-1.5 transition ' +
      'focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100',
  },
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
      class="ti ti-search mx-2 shrink-0 text-[15px] text-ink-400"
      aria-hidden="true"
    ></i>
    <input
      type="text"
      [value]="term()"
      (input)="term.set($any($event.target).value)"
      [placeholder]="placeholder()"
      [attr.aria-label]="ariaLabel()"
      class="min-w-0 flex-1 bg-transparent text-[13px] text-ink-900 outline-none placeholder:text-ink-400"
    />
    @if (term()) {
      <button
        type="button"
        (click)="term.set('')"
        aria-label="Clear search"
        class="shrink-0 rounded-full p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
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
  /** Dropdown tone — `neutral` keeps the scope segment calm even when a value is set. */
  readonly tone = input<'auto' | 'neutral'>('neutral');

  protected onFieldChange(v: string | string[] | null): void {
    this.field.set(typeof v === 'string' ? v : null);
  }
}
