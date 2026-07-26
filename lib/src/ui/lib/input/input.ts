import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  model,
} from '@angular/core';

let uid = 0;

export type InputSize = 'sm' | 'md' | 'lg';

const SIZE_BOX: Record<InputSize, string> = {
  sm: 'rounded-lg  px-2.5',
  md: 'rounded-xl  px-3',
  lg: 'rounded-xl  px-4',
};

const SIZE_FIELD: Record<InputSize, string> = {
  sm: 'py-1.5 text-xs',
  md: 'py-2.5 text-sm',
  lg: 'py-3   text-sm',
};

const SIZE_TOGGLE: Record<InputSize, string> = {
  sm: 'h-6 w-6 text-sm',
  md: 'h-7 w-7 text-base',
  lg: 'h-7 w-7 text-lg',
};

/**
 * Form field with label, optional leading icon, and error state.
 * Two-way bind the value: `<hh-input label="Email" icon="ti-mail" [(value)]="email" />`
 *
 * `type="password"` additionally renders a reveal toggle:
 * `<hh-input label="Password" type="password" autocomplete="current-password" [(value)]="password" />`
 */
@Component({
  selector: 'hh-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Edge ships its own reveal control, which would sit next to ours.
  styles: [
    `
      input[type='password']::-ms-reveal {
        display: none;
      }
    `,
  ],
  template: `
    @if (label()) {
      <label [for]="id" class="mb-1 block text-xs font-medium text-ink-600">{{
        label()
      }}</label>
    }
    <div [class]="boxClasses()">
      @if (icon()) {
        <i class="ti shrink-0" [class]="iconClasses()" aria-hidden="true"></i>
      }
      <input
        [id]="id"
        [type]="effectiveType()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [value]="value()"
        (input)="value.set($any($event.target).value)"
        [attr.autocomplete]="autocomplete()"
        [attr.autocapitalize]="isPassword() ? 'none' : null"
        [attr.autocorrect]="isPassword() ? 'off' : null"
        [attr.spellcheck]="isPassword() ? 'false' : null"
        [class]="fieldClasses()"
      />
      @if (showToggle()) {
        <button
          type="button"
          aria-label="Show password"
          [attr.aria-pressed]="revealed()"
          [attr.aria-controls]="id"
          (click)="revealed.set(!revealed())"
          [class]="toggleClasses()"
        >
          <i
            class="ti"
            [class]="revealed() ? 'ti-eye-off' : 'ti-eye'"
            aria-hidden="true"
          ></i>
        </button>
      }
    </div>
    @if (error()) {
      <p class="mt-1 flex items-center gap-1 text-xs text-danger">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>{{ error() }}
      </p>
    }
  `,
  host: { class: 'block' },
})
export class Input {
  readonly value = model('');
  readonly label = input('');
  readonly icon = input<string | null>(null);
  readonly type = input('text');
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly error = input('');
  readonly size = input<InputSize>('md');
  readonly autocomplete = input<string | null>(null);

  protected readonly id = `hh-input-${++uid}`;

  // Clearing the field re-masks it, so a reset form never leaks the next entry.
  protected readonly revealed = linkedSignal<string, boolean>({
    source: () => this.value(),
    computation: (value, previous) =>
      value === '' ? false : (previous?.value ?? false),
  });

  protected readonly isPassword = computed(() => this.type() === 'password');

  protected readonly showToggle = computed(
    () => this.isPassword() && !this.disabled(),
  );

  protected readonly effectiveType = computed(() =>
    this.isPassword() && this.revealed() ? 'text' : this.type(),
  );

  protected readonly boxClasses = computed(() => {
    const base = `flex items-center gap-2 transition ${SIZE_BOX[this.size()]}`;
    if (this.disabled()) return `${base} border border-ink-100 bg-ink-50`;
    if (this.error())
      return `${base} border border-danger focus-within:ring-2 focus-within:ring-danger/20`;
    return `${base} border border-ink-200 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100`;
  });

  protected readonly fieldClasses = computed(
    () =>
      `w-full min-w-0 bg-transparent text-ink-900 outline-none placeholder:text-ink-300 ${SIZE_FIELD[this.size()]}`,
  );

  protected readonly iconClasses = computed(() => {
    const color = this.disabled()
      ? 'text-ink-300'
      : this.error()
        ? 'text-danger'
        : 'text-ink-400';
    return `${this.icon()} ${color}`;
  });

  // Deliberately not iconClasses(): a red eye in the error state reads as part of the error.
  protected readonly toggleClasses = computed(
    () =>
      `grid shrink-0 place-items-center rounded-lg text-ink-400 transition hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${SIZE_TOGGLE[this.size()]}`,
  );
}
