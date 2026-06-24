import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface BreadcrumbItem {
  label: string;
  url?: string;
}

@Component({
  selector: 'hh-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="flex min-w-0 items-center gap-1.5">
      @if (backUrl()) {
        <a
          [routerLink]="backUrl()"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-500 transition hover:bg-surface hover:text-ink-900"
          aria-label="Go back"
        ><i class="ti ti-arrow-left text-sm"></i></a>
      }
      @if (crumbs().length) {
        <nav class="flex min-w-0 items-center gap-1 text-sm" aria-label="Breadcrumb">
          @for (crumb of crumbs(); track crumb.label; let last = $last) {
            @if (!last && crumb.url) {
              <a [routerLink]="crumb.url" class="shrink-0 text-ink-400 transition hover:text-ink-700">
                {{ crumb.label }}
              </a>
            } @else if (!last) {
              <span class="shrink-0 text-ink-400">{{ crumb.label }}</span>
            } @else {
              <span class="min-w-0 truncate font-semibold text-ink-900">{{ crumb.label }}</span>
            }
            @if (!last) {
              <i class="ti ti-chevron-right shrink-0 text-[10px] text-ink-300"></i>
            }
          }
        </nav>
      }
    </div>
  `,
})
export class Breadcrumb {
  readonly backUrl = input('');
  readonly crumbs = input<BreadcrumbItem[]>([]);
}
