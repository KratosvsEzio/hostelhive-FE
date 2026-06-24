import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';

/**
 * Per-screen header + content area for the Super-Admin screens. The console's
 * `StaffShell` provides the sidebar + offset; this renders the sticky page header
 * (heading + `[actions]` slot) and the page body. Mirrors mockups 26–28.
 */
@Component({
  selector: 'hh-admin-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout],
  templateUrl: './admin-shell.html',
})
export class AdminShell {
  readonly heading = input('');
}
