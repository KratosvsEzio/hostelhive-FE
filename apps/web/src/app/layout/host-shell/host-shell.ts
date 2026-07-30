import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { HostPropertyStore } from '@services';
import { ConsoleDrawer } from '../components/console-drawer/console-drawer';
import { HostTabBar } from '../components/mobile-tab-bar/host-tab-bar';
import { MobileApp } from '@core/mobile-app';
import { Button, Dropdown, DropdownOption, StatusTone } from '@hostelhive/ui';
import { ListingStatus, PropertyGender } from '@hostelhive/data-access';

interface NavEntry {
  label?: string;
  icon?: string;
  link?: string;
  exact?: boolean;
  divider?: boolean;
}

const PILL_TONE: Record<ListingStatus, StatusTone> = {
  published: 'ok',
  'in-review': 'warn',
  onboarding: 'neutral',
  paused: 'neutral',
};

const PILL_LABEL: Record<ListingStatus, string> = {
  published: 'Published',
  'in-review': 'In review',
  onboarding: 'Onboarding',
  paused: 'Paused',
};

/**
 * Host console chrome — fixed sidebar on desktop, slide-in drawer on mobile web.
 * On the mobile app the sidebar disappears entirely: the bottom tab bar
 * (Overview · Rooms · Tenants · Invoices · More) is the navigation.
 */
@Component({
  selector: 'app-host-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Dropdown, Button, HostTabBar],
  templateUrl: './host-shell.html',
})
export class HostLayout {
  protected readonly drawer = inject(ConsoleDrawer);
  protected readonly propertyStore = inject(HostPropertyStore);
  protected readonly mobile = inject(MobileApp);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly onDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
  protected readonly contentPadding = computed(() =>
    !this.mobile.isMobile() && this.drawer.open() && this.onDesktop ? '16rem' : '0');

  constructor() {
    // The shell is re-created on every entry into /host (incl. the redirect right after a host
    // logs in), so refetch the hostel list here — it's never served stale from a prior session.
    // Browser-only: the host area is auth-gated and renders a skeleton on the server (no token).
    if (typeof window !== 'undefined') this.propertyStore.load();
  }

  protected closeOnMobile(): void {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      this.drawer.close();
    }
  }

  private readonly routeHostelId = toSignal(
    this.route.paramMap.pipe(map((pm) => pm.get('hostelId') ?? '')),
    { initialValue: this.propertyStore.selected() },
  );

  private readonly _syncStore = effect(() => {
    const id = this.routeHostelId();
    if (id && id !== untracked(() => this.propertyStore.selected())) {
      this.propertyStore.setProperty(id);
    }
  });

  protected readonly nav = computed<NavEntry[]>(() => {
    const pid = this.propertyStore.selected();
    const b = `/host/${pid}`;
    return [
      { label: 'Overview',       icon: 'ti-layout-dashboard', link: `${b}/overview` },
      { label: 'Hostel profile', icon: 'ti-building',         link: `${b}/profile` },
      { label: 'Rooms',          icon: 'ti-bed',              link: `${b}/rooms` },
      { label: 'Tenants',        icon: 'ti-users',            link: `${b}/tenants` },
      { label: 'Team & staff',   icon: 'ti-user-shield',      link: `${b}/team` },
      { label: 'Utilities',      icon: 'ti-bolt',             link: `${b}/utilities` },
      { label: 'Mess',           icon: 'ti-tools-kitchen-2',  link: `${b}/mess` },
      { label: 'Invoices',       icon: 'ti-file-invoice',     link: `${b}/invoices` },
      { divider: true },
      { label: 'Subscription',   icon: 'ti-rosette',          link: `${b}/subscription` },
    ];
  });

  protected readonly propertyDropdownOptions = computed<DropdownOption[]>(() =>
    this.propertyStore.properties().map((p) => ({
      value: p.id,
      label: p.name,
      subtitle: `${p.area}, ${p.city}`,
      statusTone: PILL_TONE[p.status],
      statusLabel: PILL_LABEL[p.status],
      suffixBadge: this.genderLabel(p.gender),
      suffixBadgeClass: this.genderPillClass(p.gender),
    }))
  );

  protected readonly propertiesLoading = computed(
    () => this.propertyStore.properties().length === 0 && !!this.propertyStore.selected(),
  );

  protected onPropertySelect(value: string | string[] | null): void {
    if (typeof value !== 'string') return;
    this.drawer.close();
    const segments = this.router.url.split('/').filter(Boolean);
    const page = segments.slice(2).join('/');
    void this.router.navigate(['/host', value, ...(page ? page.split('/') : [])]);
  }

  private genderLabel(gender: PropertyGender): string {
    return gender === 'coliving' ? 'Co-living' : gender === 'girls' ? 'Girls' : 'Boys';
  }

  private genderPillClass(gender: PropertyGender): string {
    if (gender === 'boys')  return 'bg-boys/10 text-boys';
    if (gender === 'girls') return 'bg-girls/10 text-girls';
    return 'bg-tint-purple text-ink-600';
  }
}
