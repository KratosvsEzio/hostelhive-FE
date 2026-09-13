import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { HH_LINK_LOCALISER } from '../link-localiser';

export interface BreadcrumbItem {
  label: string;
  url?: string;
}

@Component({
  selector: 'hh-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe],
  template: `
    <div class="flex min-w-0 items-center gap-1.5">
      @if (backUrl()) {
        <a
          [routerLink]="backLink()"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-500 transition hover:bg-surface hover:text-ink-900"
          [attr.aria-label]="'a11y.goBack' | transloco"
        ><i class="ti ti-arrow-left text-sm"></i></a>
      }
      @if (crumbs().length) {
        <!--
          Below sm only the current page is shown. The ancestor trail is hidden rather
          than allowed to truncate: the header's action slot is shrink-0, so on a phone
          a wide control (the date-range picker on the overview detail pages) squeezes
          the trail until the page's own name is cut mid-word — the crumb that actually
          tells the user where they are is the one that loses.

          The trail is the redundant half anyway: where a backUrl is set it points at
          the same place as the parent crumb. The last crumb stays because four pages
          using this have no <h1> of their own, so it is their only title.
        -->
        <nav class="flex min-w-0 items-center gap-1 text-sm" [attr.aria-label]="'a11y.breadcrumb' | transloco">
          @for (crumb of links(); track crumb.label; let last = $last) {
            @if (!last && crumb.url) {
              <a [routerLink]="crumb.link" class="hidden shrink-0 text-ink-400 transition hover:text-ink-700 sm:inline">
                {{ crumb.label }}
              </a>
            } @else if (!last) {
              <span class="hidden shrink-0 text-ink-400 sm:inline">{{ crumb.label }}</span>
            } @else {
              <span class="min-w-0 truncate font-semibold text-ink-900">{{ crumb.label }}</span>
            }
            @if (!last) {
              <i class="ti ti-chevron-right hidden shrink-0 text-[10px] text-ink-300 sm:inline-block"></i>
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

  private readonly localise = inject(HH_LINK_LOCALISER);

  /**
   * The same targets, carrying whatever prefix the app's language needs.
   *
   * Computed rather than called from the template so the work happens once per change — and
   * so a language switch rewrites the links already on screen: the app's implementation reads
   * the active locale from a signal, which this then tracks.
   */
  protected readonly backLink = computed(() => this.localise(this.backUrl()));

  protected readonly links = computed(() =>
    this.crumbs().map((crumb) => ({ ...crumb, link: this.localise(crumb.url) })),
  );
}
