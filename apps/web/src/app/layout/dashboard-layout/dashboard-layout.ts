import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Breadcrumb as HhBreadcrumb, Button } from '@hostelhive/ui';
import { ConsoleDrawer } from '../components/console-drawer/console-drawer';
import { MobileApp } from '@core/mobile-app';

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
 * padding to clear the fixed tab bar; in the host area the burger disappears
 * too (the host tab bar + More screen replace the drawer there — the staff
 * console keeps its drawer, so its burger stays).
 */
@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HhBreadcrumb, Button],
  templateUrl: './dashboard-layout.html',
})
export class DashboardLayout {
  /** Shared sidebar drawer — the subheader burger toggles it (collapse on desktop, overlay on mobile). */
  protected readonly drawer = inject(ConsoleDrawer);
  protected readonly mobile = inject(MobileApp);

  // Snapshot is enough: a dashboard-layout instance lives inside one routed page.
  protected readonly hideMenu =
    inject(Router).url.startsWith('/host/') && this.mobile.isMobile();

  readonly label = input<string>('');
  readonly backUrl = input<string>('');
  readonly breadcrumbs = input<Breadcrumb[]>([]);
}
