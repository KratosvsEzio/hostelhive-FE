import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Empty state. Project an optional action (e.g. a button) as content.
 * `<hh-empty-state title="No stays match"><button hh-button…>Clear filters</button></hh-empty-state>`
 */
@Component({
  selector: 'hh-empty-state',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <i class="ti text-3xl text-ink-300" [class]="icon()" aria-hidden="true"></i>
    <h1 class="mt-2 text-sm font-medium text-ink-700">{{ title() ?? ('states.nothingHereYet' | transloco) }}</h1>
    @if (message()) {
      <p class="mt-1 text-sm text-ink-500">{{ message() }}</p>
    }
    <div class="mt-2 empty:hidden"><ng-content /></div>
  `,
  host: {
    class:
      'flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-surface px-4 text-center',
  },
})
export class EmptyState {
  readonly icon = input('ti-map-search');
  readonly title = input<string | undefined>(undefined);
  readonly message = input('');
}
