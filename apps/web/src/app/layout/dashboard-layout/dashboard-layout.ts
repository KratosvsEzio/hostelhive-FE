import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Breadcrumb as HhBreadcrumb, Container } from '@hostelhive/ui';
import { MobileApp } from '@core/mobile-app';
import { TranslocoPipe } from '@jsverse/transloco';

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
 *
 * On the mobile app the © footer is dropped and the scroll area gets bottom
 * padding to clear the fixed tab bar.
 *
 * There is no menu button: the sidebar is always on screen, narrowing to a rail
 * of icons rather than hiding, so there is nothing left for a burger to reveal.
 */
@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Container, HhBreadcrumb, TranslocoPipe],
  templateUrl: './dashboard-layout.html',
})
export class DashboardLayout {
  protected readonly mobile = inject(MobileApp);

  readonly label = input<string>('');
  readonly backUrl = input<string>('');
  readonly breadcrumbs = input<Breadcrumb[]>([]);
}
