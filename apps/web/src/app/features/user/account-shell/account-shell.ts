import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';

/** Seeker account area: a sidebar of sections + the routed section content. */
@Component({
  selector: 'app-account-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  templateUrl: './account-shell.html',
})
export class AccountShell {
  /**
   * `label` is a translation key, resolved by the template — the same fix the account
   * menu's `items` needed. This sidebar names the very same pages, so it carried the very
   * same defect: four English literals in an otherwise fully translated shell, sitting
   * directly under a heading that did translate.
   */
  protected readonly nav = [
    { path: 'bookings', label: 'common.bookings', icon: 'ti-calendar' },
    { path: 'favorites', label: 'common.favorites', icon: 'ti-heart' },
    { path: 'settings', label: 'common.accountSettings', icon: 'ti-settings' },
    { path: 'security', label: 'common.passwordAmpSecurity', icon: 'ti-lock' },
  ];
}
