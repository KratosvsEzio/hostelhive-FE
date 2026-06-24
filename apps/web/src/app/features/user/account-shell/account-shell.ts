import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Seeker account area: a sidebar of sections + the routed section content. */
@Component({
  selector: 'app-account-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './account-shell.html',
})
export class AccountShell {
  protected readonly nav = [
    { path: 'favorites', label: 'Favorites', icon: 'ti-heart' },
    { path: 'settings', label: 'Account settings', icon: 'ti-settings' },
    { path: 'security', label: 'Password & security', icon: 'ti-lock' },
    { path: 'notifications', label: 'Notifications', icon: 'ti-bell' },
    { path: 'help', label: 'Help Centre', icon: 'ti-help-circle' },
  ];
}
