import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'hh-no-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center gap-3 py-12 text-center">
      <i class="ti ti-search-off text-3xl text-ink-300" aria-hidden="true"></i>
      <div>
        <p class="font-medium text-ink-700">{{ title() }}</p>
        <p class="mt-1 text-sm text-ink-400">{{ message() }}</p>
      </div>
      <ng-content />
    </div>
  `,
})
export class NoResults {
  readonly title = input('No results found');
  readonly message = input('Try adjusting your search or filter criteria.');
}
