import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
import { Logo } from '@core/brand/logo';
import { MobileApp } from '@core/mobile-app';
import { ConsoleDrawer } from '@layout/components/console-drawer/console-drawer';
import { isConsoleArea } from '@layout/area';

/**
 * The one site header, shared by every area. The chrome stays identical everywhere; only
 * the action buttons (and the seeker search bar) change with the active route. Rendered once,
 * globally, by `App`.
 *
 * In a console it starts where the sidebar ends. The sidebar used to begin below this bar,
 * which put the header across the top of the window and the navigation in a box hanging off
 * its underside; now the sidebar owns the full left edge from top to bottom and this is the
 * top of the column beside it — header, page, footer. The brand goes with the sidebar there,
 * because two marks on one screen is one too many.
 *
 * `display:contents` removes the host's own box so the sticky <header> attaches to
 * the tall page-flex column (a host box that's only header-height gives sticky no room).
 */
@Component({
  selector: 'app-site-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo, 
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
  private readonly mobile = inject(MobileApp);
  private readonly drawer = inject(ConsoleDrawer);

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

  /**
   * The landing page opens on a full-screen photo, so there the bar floats over it: fixed
   * rather than sticky (the hero starts at the top of the window, under it) and transparent
   * until the reader has scrolled most of the way past the hero, when it turns back into
   * the usual white bar with the search in it.
   */
  protected readonly onLanding = computed(() => (this.path() || '/') === '/');
  private readonly pastHero = signal(false);
  protected readonly overlay = computed(() => this.onLanding() && !this.pastHero());

  protected readonly showSearchBar = computed(() => {
    const u = this.path() || '/';
    // On the landing page the hero carries its own search until the bar turns solid.
    if (u === '/') return !this.overlay();
    return u.startsWith('/search');
  });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const update = () => this.pastHero.set(window.scrollY > window.innerHeight * 0.8);
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    });
  }

  /** The logo links to the active area's home (so it never bounces you out of the console). */
  /**
   * Whether a console sidebar is holding the left edge of the window.
   *
   * The same condition both shells render their `<aside>` on — console area, and not the
   * phone, where the sidebar gives way to a bottom tab bar and this bar spans the width again.
   */
  protected readonly hasConsoleSidebar = computed(
    () => isConsoleArea(this.area()) && !this.mobile.isMobile(),
  );

  /**
   * Where this bar starts.
   *
   * A margin rather than padding: the bar is opaque and sits a layer above the sidebar, so
   * padding would leave its own background painted across the sidebar's top. The transition
   * matches the `<aside>`'s so the two edges travel together when the rail expands.
   */
  protected readonly sidebarInset = computed(() =>
    this.hasConsoleSidebar() ? this.drawer.width_() : '0px',
  );

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
