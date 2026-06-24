import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Breadcrumb as HhBreadcrumb } from '@hostelhive/ui';

export interface Breadcrumb {
  label: string;
  url?: string;
}

/**
 * Shared chrome for all dashboard pages (host, admin, moderator).
 * Fills the full height of the shell's content area and provides:
 *   - a fixed subheader  (title via `title` input OR `[hhTitle]` slot + optional `[hhActions]` slot)
 *   - optional back button via `backUrl` input
 *   - optional breadcrumb trail via `breadcrumbs` input
 *   - a scrollable main  (default `ng-content`)
 *   - a fixed footer     (© notice)
 *
 * The parent shell must give its content wrapper a definite height
 * (`h-[calc(100dvh-4rem)] overflow-hidden`) so `h-full` resolves correctly.
 */
@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HhBreadcrumb],
  templateUrl: './dashboard-layout.html',
})
export class DashboardLayout {
  readonly label = input<string>('');
  readonly backUrl = input<string>('');
  readonly breadcrumbs = input<Breadcrumb[]>([]);
}
