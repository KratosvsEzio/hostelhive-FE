import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { SessionStore } from '@core/auth';
import { SearchBar } from '../search-bar/search-bar';
import { AccountMenu } from '../account-menu/account-menu';
import { NotificationBell } from '../notification-bell/notification-bell';
import { LanguageSwitcher } from '@core/i18n/language-switcher';
import { routePath } from '@core/i18n/locales';
import { Area, areaOf } from '@layout/area';
import { LocaleLink } from '@core/i18n/locale-link';

/**
 * The one site header, shared by every area. The logo + chrome stay identical
 * everywhere; only the action buttons (and the seeker search bar) change with the
 * active route. Rendered once, globally, by `App` — the console areas keep their
 * own sidebars *below* it.
 *
 * `display:contents` removes the host's own box so the sticky <header> attaches to
 * the tall page-flex column (a host box that's only header-height gives sticky no room).
 */
@Component({
  selector: 'app-site-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, LocaleLink,
    SearchBar,
    AccountMenu,
    NotificationBell,
    LanguageSwitcher,
  ],
  host: { class: 'contents' },
  templateUrl: './site-header.html',
})
export class SiteHeader {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => routePath(this.router.url)),
    ),
    {
      initialValue:
        typeof window !== 'undefined'
          ? routePath(window.location.pathname)
          : routePath(this.router.url),
    },
  );

  /** Which area the active route belongs to — now only drives the logo's destination. */
  protected readonly area = computed<Area>(() => areaOf(this.path()));
  protected readonly showSearchBar = computed(() => {
    const u = this.path() || '/';
    return u === '/' || u.startsWith('/search');
  });

  /** The logo links to the active area's home (so it never bounces you out of the console). */
  protected readonly homeLink = computed(() => {
    const a = this.area();
    if (a === 'host') return '/host';
    if (a === 'admin') return '/admin';
    if (a === 'moderator') return '/moderator';
    return '/';
  });
  protected readonly isAdmin = computed(() => {
    const r = this.session.role();
    return r === 'super-admin' || r === 'admin' || r === 'support';
  });

  protected readonly isAuthenticated = computed(() =>
    this.session.isAuthenticated(),
  );

}
