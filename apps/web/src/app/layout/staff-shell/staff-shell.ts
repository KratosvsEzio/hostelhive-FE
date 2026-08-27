import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { TooltipFixed } from '@hostelhive/ui';
import { Permission, SessionStore } from '@core/auth';
import { routePath } from '@core/i18n/locales';
import { MobileApp } from '@core/mobile-app';
import { StaffTabBar } from '../components/mobile-tab-bar/staff-tab-bar';
import { ConsoleDrawer } from '../components/console-drawer/console-drawer';
import { LocaleLink } from '@core/i18n/locale-link';

interface NavEntry {
  label?: string;
  icon?: string;
  link?: string;
  divider?: boolean;
  /** Hidden unless the session holds this flag. */
  permission?: Permission;
  /**
   * Shorter wording for the bottom tab bar, where five tabs share 375px.
   *
   * A whole word, never an abbreviation: a tab reading "Roles & p…" says less than
   * "Roles" does. Only worth setting on a label the tab bar would otherwise clip.
   */
  tabLabel?: string;
}

const MOD_NAV: NavEntry[] = [
  { label: 'Review queue', icon: 'ti-inbox', link: '/moderator/queue', permission: 'moderator:Hostel:index' },
  { label: 'Media queue', icon: 'ti-photo', link: '/moderator/media', permission: 'moderator:Attachment:index' },
];

const ADMIN_NAV: NavEntry[] = [
  { label: 'Contracts', icon: 'ti-file-dollar', link: '/admin/contracts', permission: 'admin:Contract:index' },
  { label: 'Payments', icon: 'ti-credit-card', link: '/admin/payments', permission: 'admin:Payment:index' },
  {
    label: 'Roles & permissions',
    tabLabel: 'Roles',
    icon: 'ti-shield-lock',
    link: '/admin/roles',
    permission: 'admin:Role:index',
  },
  { divider: true },
  { label: 'Review queue', icon: 'ti-inbox', link: '/admin/queue', permission: 'moderator:Hostel:index' },
  {
    label: 'All listings',
    icon: 'ti-building-community',
    link: '/admin/listings',
    permission: 'admin:Hostel:index',
  },
];

/**
 * Internal staff console chrome — role-aware sidebar on desktop, bottom tab bar on a phone.
 *
 * Below 768px the sidebar is not rendered at all and {@link StaffTabBar} takes its place,
 * matching the host console. It had neither: the fixed sidebar kept its full width on a
 * 375px screen and the content was indented behind it, leaving the queue in a column too
 * narrow to read.
 */
@Component({
  selector: 'app-staff-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, RouterLinkActive, RouterOutlet, TooltipFixed, StaffTabBar],
  templateUrl: './staff-shell.html',
})
export class StaffLayout {
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  protected readonly drawer = inject(ConsoleDrawer);

  protected readonly mobile = inject(MobileApp);

  /**
   * Follows the sidebar's own width, so the rail does not leave 192px of empty gutter.
   *
   * Zero on a phone, where there is no sidebar to leave room for. Without this the console
   * kept indenting the content by a sidebar that was no longer rendered, which is what left
   * the moderator queue squeezed into a column beside empty space.
   */
  protected readonly contentPadding = computed(() =>
    this.mobile.isMobile() ? '0' : this.drawer.width_(),
  );

  protected readonly user = this.session.user;

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

  protected readonly nav = computed(() => {
    const entries = this.path().startsWith('/moderator') ? MOD_NAV : ADMIN_NAV;
    // Same rule as the host shell: a destination is listed only when the session holds the
    // action it needs, so the two consoles never advertise a page that 403s on arrival.
    const visible = entries.filter(
      (e) => !e.permission || this.session.hasPermission(e.permission),
    );
    return visible.filter(
      (e, i) => !e.divider || visible.slice(i + 1).some((n) => !n.divider),
    );
  });
  /**
   * The same destinations the sidebar lists, minus the dividers a tab bar has no room for.
   *
   * Derived from {@link nav} rather than declared again, so a page added to one console
   * appears in both places and stays behind the same permission.
   */
  protected readonly tabs = computed(() =>
    this.nav()
      .filter((e) => !e.divider && e.link)
      .map((e) => ({
        label: e.tabLabel ?? e.label ?? '',
        icon: e.icon ?? '',
        link: e.link ?? '',
      })),
  );

  protected readonly consoleLabel = computed(() =>
    this.path().startsWith('/moderator') ? 'Moderator console' : 'Admin console',
  );

  protected readonly roleLabel = computed(() =>
    (this.session.role() ?? '').replace('-', ' '),
  );
  protected readonly initials = computed(() =>
    (this.user()?.name ?? 'A')
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
  );
}
