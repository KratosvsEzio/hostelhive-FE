import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { SessionStore } from '@core/auth';
import { ConsoleDrawer } from '../components/console-drawer/console-drawer';

interface NavEntry {
  label?: string;
  icon?: string;
  link?: string;
  divider?: boolean;
}

const MOD_NAV: NavEntry[] = [
  { label: 'Review queue', icon: 'ti-inbox', link: '/moderator/queue' },
  { label: 'Media queue', icon: 'ti-photo', link: '/moderator/media' },
];

const ADMIN_NAV: NavEntry[] = [
  { label: 'Contracts', icon: 'ti-file-dollar', link: '/admin/contracts' },
  { label: 'Payments', icon: 'ti-credit-card', link: '/admin/payments' },
  {
    label: 'Roles & permissions',
    icon: 'ti-shield-lock',
    link: '/admin/roles',
  },
  { divider: true },
  { label: 'Review queue', icon: 'ti-inbox', link: '/admin/queue' },
  {
    label: 'All listings',
    icon: 'ti-building-community',
    link: '/admin/listings',
  },
];

/** Internal staff console chrome — role-aware sidebar (desktop) + mobile drawer. */
@Component({
  selector: 'app-staff-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
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
      map(() => this.router.url.split('?')[0]),
    ),
    {
      initialValue:
        typeof window !== 'undefined'
          ? window.location.pathname
          : this.router.url.split('?')[0],
    },
  );

  protected readonly nav = computed(() =>
    this.path().startsWith('/moderator') ? MOD_NAV : ADMIN_NAV,
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
