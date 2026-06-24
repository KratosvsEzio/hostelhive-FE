import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';

let uid = 0;

/**
 * Form field with label, optional leading icon, and error state.
 * Two-way bind the value: `<hh-input label="Email" icon="ti-mail" [(value)]="email" />`
 */
@Component({
  selector: 'hh-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (label()) {
      <label [for]="id" class="mb-1 block text-xs font-medium text-ink-600">{{
        label()
      }}</label>
    }
    <div [class]="boxClasses()">
      @if (icon()) {
        <i class="ti" [class]="iconClasses()" aria-hidden="true"></i>
      }
      <input
        [id]="id"
        [type]="type()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [value]="value()"
        (input)="value.set($any($event.target).value)"
        class="w-full bg-transparent py-2.5 text-sm text-ink-900 outline-none placeholder:text-ink-300"
      />
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

  protected readonly id = `hh-input-${++uid}`;

  protected readonly boxClasses = computed(() => {
    const base = 'flex items-center gap-2 rounded-xl px-3 transition';
    if (this.disabled()) return `${base} border border-ink-100 bg-ink-50`;
    if (this.error())
      return `${base} border border-danger focus-within:ring-2 focus-within:ring-danger/20`;
    return `${base} border border-ink-200 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100`;
  });

  protected readonly iconClasses = computed(() => {
    const color = this.disabled()
      ? 'text-ink-300'
      : this.error()
        ? 'text-danger'
        : 'text-ink-400';
    return `${this.icon()} ${color}`;
  });
}
