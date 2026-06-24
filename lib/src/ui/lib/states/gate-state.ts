import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Permission gate — blurred scrim with a lock and a call-to-action.
 * Place over (or in place of) gated content; project the action button.
 * `<hh-gate>{{ '<button hh-button>Show phone number</button>' }}</hh-gate>`
 */
@Component({
  selector: 'hh-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <i class="ti ti-lock text-2xl text-brand-300" aria-hidden="true"></i>
    @if (title()) {
      <p class="mt-1 text-sm font-medium text-white">{{ title() }}</p>
    }
    <div class="mt-2"><ng-content /></div>
  `,
  host: {
    class:
      'flex min-h-[180px] flex-col items-center justify-center rounded-2xl bg-ink-900/55 px-4 text-center backdrop-blur-sm',
  },
})
export class GateState {
  readonly title = input('');
}
