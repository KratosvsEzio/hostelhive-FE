import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LocaleLink } from '@core/i18n/locale-link';

/** Seeker account area: a sidebar of sections + the routed section content. */
@Component({
  selector: 'app-account-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, RouterLinkActive, RouterOutlet],
  templateUrl: './account-shell.html',
})
export class AccountShell {
  protected readonly nav = [
    { path: 'favorites', label: 'Favorites', icon: 'ti-heart' },
    { path: 'settings', label: 'Account settings', icon: 'ti-settings' },
    { path: 'security', label: 'Password & security', icon: 'ti-lock' },
  ];
}
