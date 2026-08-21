import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { TooltipFixed } from '@hostelhive/ui';
import { currencyName, currencySymbol } from '@util/currencies';

let uid = 0;

/** Digits (and a single decimal point) only — everything a money amount is made of. */
function toRaw(s: string): string {
  let raw = s.replace(/[^\d.]/g, '');
  const dot = raw.indexOf('.');
  // Collapse any decimal points after the first so "1.2.3" can't be typed.
  if (dot !== -1) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, '');
  return raw;
}

/** "12000.5" → "12,000.5". Groups the integer part; leaves the decimals untouched. */
function group(raw: string): string {
  if (raw === '') return '';
  const [int, dec] = raw.split('.');
  const grouped = (int || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec !== undefined ? `${grouped}.${dec}` : grouped;
}

/**
 * A money field with a live thousands-separator mask and the currency symbol pinned inside
 * the control: `$ 12,000`. Two-way bound to the numeric amount via `[(value)]` — callers
 * always see a plain `number`, never the formatted string.
 *
 * The input is uncontrolled (its `value` is driven imperatively) so that reformatting on
 * every keystroke can restore the caret to the right spot — an Angular `[value]` binding
 * would fight the caret fix and make it jump to the end.
 *
 * Optional `label` / `error` render the same chrome as `hh-input`, so it drops into existing
 * forms; `(blur)` fires for dirty-tracking. Amounts are numbers here — string-backed form
 * models adapt at the binding: `[value]="+f.rent" (valueChange)="patch('rent', $any($event))"`.
 *
 * `<hh-money-input label="Rent" [(value)]="amount" [currency]="'USD'" fieldClass="w-28" />`
 */
@Component({
  selector: 'hh-money-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [TooltipFixed],
  template: `
    @if (label()) {
      <label [for]="id" class="mb-1 block text-xs font-medium text-ink-600">{{ label() }}</label>
    }
    <div
      class="flex items-center border bg-white transition focus-within:ring-2"
      [class]="boxClass()"
      [class.border-ink-200]="!error()"
      [class.focus-within:border-brand-400]="!error()"
      [class.focus-within:ring-brand-100]="!error()"
      [class.border-danger]="!!error()"
      [class.focus-within:ring-danger-100]="!!error()"
      [class.opacity-50]="disabled()"
      [class.pointer-events-none]="disabled()"
    >
      <span class="shrink-0 cursor-help select-none text-ink-500" [class]="textClass()" [hhTooltip]="fullName()">{{ symbol() }}</span>
      <input
        #input
        [id]="id"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        [attr.placeholder]="placeholder()"
        [disabled]="disabled()"
        class="w-full min-w-0 bg-transparent text-ink-900 outline-none placeholder:text-ink-400"
        [class]="fieldPadClass()"
        (input)="onInput()"
        (blur)="blur.emit()"
      />
    </div>
    @if (error()) {
      <p class="mt-1 flex items-center gap-1 text-xs text-danger">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>{{ error() }}
      </p>
    }
  `,
})
export class MoneyInput {
  /** The numeric amount (two-way bindable via `[(value)]`). */
  readonly value = model<number>(0);
  /** ISO-4217 code whose symbol prefixes the field. */
  readonly currency = input('PKR');
  readonly label = input('');
  readonly error = input('');
  readonly disabled = input(false);
  readonly placeholder = input('0');
  /** `md` (default) matches the height of `hh-input`; `sm` is the compact field used inline
   *  (e.g. the room-type row next to the capacity input). */
  readonly size = input<'sm' | 'md'>('md');
  /** Extra classes for the field wrapper — width, etc. (`w-28`, `w-full`). */
  readonly fieldClass = input('');

  /** Fires on blur, for dirty-tracking (`(blur)="markDirty('rent')"`). */
  readonly blur = output<void>();

  protected readonly id = `hh-money-${++uid}`;
  protected readonly symbol = computed(() => currencySymbol(this.currency()));
  protected readonly fullName = computed(() => currencyName(this.currency()));

  // Sizing mirrors hh-input so the field lines up with its neighbours: md is the 42px form
  // control; sm is the 32px compact variant.
  protected readonly boxClass = computed(() => {
    const box = this.size() === 'sm' ? 'rounded-lg px-2 gap-1.5' : 'rounded-xl px-3 gap-2';
    return `${box} ${this.fieldClass()}`;
  });
  protected readonly textClass = computed(() => (this.size() === 'sm' ? 'text-xs' : 'text-sm'));
  protected readonly fieldPadClass = computed(() =>
    this.size() === 'sm' ? 'py-2 text-xs' : 'py-2.5 text-sm',
  );

  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('input');

  constructor() {
    // Push external value changes into the field, but never while the user's own typing is
    // the source (that path already set the text and caret in onInput). Comparing parsed
    // numbers means a programmatic set of the same amount won't wipe an in-progress "12,0".
    effect(() => {
      // Normalise through Number() so a value that arrives as the string "12000.0" renders
      // as "12,000", not "12,000.0" — while a real fraction like 12000.5 is preserved.
      const v = Number(this.value()) || 0;
      const el = this.inputRef().nativeElement;
      const shown = toRaw(el.value);
      const current = shown === '' ? 0 : parseFloat(shown);
      if (current !== v) el.value = v ? group(String(v)) : '';
    });
  }

  protected onInput(): void {
    const el = this.inputRef().nativeElement;
    const before = el.value;
    const caret = el.selectionStart ?? before.length;
    // How many mask-significant chars sit left of the caret — the anchor we restore to.
    const significantLeft = before.slice(0, caret).replace(/[^\d.]/g, '').length;

    const raw = toRaw(before);
    const formatted = group(raw);
    el.value = formatted;

    // Walk the formatted string until we've passed the same count of digits/dots.
    let pos = 0;
    let seen = 0;
    while (pos < formatted.length && seen < significantLeft) {
      if (/[\d.]/.test(formatted[pos])) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);

    this.value.set(raw === '' || raw === '.' ? 0 : parseFloat(raw));
  }
}
