import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { Permission, SessionStore } from '@core/auth';
import { routePath } from '@core/i18n/locales';
import { ConsoleDrawer } from '../components/console-drawer/console-drawer';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';

interface NavEntry {
  label?: string;
  icon?: string;
  link?: string;
  divider?: boolean;
  /** Hidden unless the session holds this flag. */
  permission?: Permission;
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

/** Internal staff console chrome — role-aware sidebar (desktop) + mobile drawer. */
@Component({
  selector: 'app-staff-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  templateUrl: './staff-shell.html',
})
export class StaffLayout {
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  protected readonly drawer = inject(ConsoleDrawer);

  private readonly onDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
  protected readonly contentPadding = computed(() => this.drawer.open() && this.onDesktop ? '16rem' : '0');

  protected closeOnMobile(): void {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      this.drawer.close();
    }
  }
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
