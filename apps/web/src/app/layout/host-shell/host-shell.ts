import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { HostPropertyStore, SubscriptionStore } from '@services';
import { ConsoleDrawer } from '../components/console-drawer/console-drawer';
import { SubscriptionLoading } from '../components/subscription-loading/subscription-loading';
import { HostTabBar } from '../components/mobile-tab-bar/host-tab-bar';
import { MobileApp } from '@core/mobile-app';
import { Permission, SessionStore } from '@core/auth';
import { NotificationService } from '@core/notification.service';
import { Button, Dropdown, DropdownOption, StatusTone } from '@hostelhive/ui';
import { ListingStatus, PropertyAccommodationType } from '@hostelhive/data-access';
import { accommodationLabel } from '@util/accommodation-type';
import { LocaleLink } from '@core/i18n/locale-link';

interface NavEntry {
  label?: string;
  icon?: string;
  link?: string;
  exact?: boolean;
  divider?: boolean;
  /** Hidden unless the session holds this flag. Omit for entries everyone may see. */
  permission?: Permission;
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
  imports: [RouterLink, LocaleLink, RouterLinkActive, RouterOutlet, Dropdown, Button, HostTabBar, SubscriptionLoading],
  templateUrl: './host-shell.html',
})
export class HostLayout {
  protected readonly drawer = inject(ConsoleDrawer);
  private readonly session = inject(SessionStore);
  /** Permission-driven, not role-driven: the API decides who may create a hostel. */
  protected readonly canCreateHostel = computed(
    () => this.session.hasPermission('core:Hostel:create'),
  );
  protected readonly propertyStore = inject(HostPropertyStore);
  private readonly subStore = inject(SubscriptionStore);
  private readonly notifications = inject(NotificationService);
  protected readonly mobile = inject(MobileApp);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly onDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
  protected readonly gateState = signal<'loading' | 'leaving' | 'none'>('none');
  protected readonly contentPadding = computed(() =>
    !this.mobile.isMobile() && this.drawer.open() && this.onDesktop ? '16rem' : '0');

  constructor() {
    if (typeof window !== 'undefined') {
      this.propertyStore.load();

      this.router.events.pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      ).subscribe(() => {
        if (this.gateState() !== 'none') return;
        // The route is the source of truth, matching the gate effect below. Reading the persisted
        // selection here instead let the two disagree — the gate would check one hostel's
        // subscription and redirect using it while the URL pointed at another.
        const hostelId = this.routeHostelId();
        if (!hostelId || this.isExemptRoute()) return;
        this.enforceGate(hostelId);
      });
    }
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

  private readonly _subscriptionGate = effect(() => {
    const hostelId = this.routeHostelId();
    if (hostelId) {
      untracked(() => this.runSubscriptionGate(hostelId));
    }
  });

  private isExemptRoute(): boolean {
    const page = this.router.url.split('?')[0].split('/').filter(Boolean)[2] ?? '';
    return page === 'subscription' || page === 'profile';
  }

  /**
   * Bounce the host to the subscription page. The page being left has usually already fired its
   * own requests, which the API rejects with "You need to subscribe" — so error toasts stay muted
   * across the redirect: the subscription page states the problem far better than a toast can.
   */
  private bounceToSubscription(hostelId: string): void {
    const unmute = this.notifications.muteErrors();
    void this.router
      .navigate(['/host', hostelId, 'subscription'])
      .catch(() => undefined)
      .finally(unmute);
  }

  private runSubscriptionGate(hostelId: string): void {
    if (this.isExemptRoute()) {
      this.gateState.set('none');
      return;
    }
    if (this.subStore.isLoadedFor(hostelId)) {
      if (!this.subStore.isActive()) {
        this.bounceToSubscription(hostelId);
      }
      return;
    }
    this.gateState.set('loading');
    // Mute for the whole undecided window, not just the redirect. The routed page mounts behind
    // the overlay and fires its requests immediately — seconds before the verdict — so a mute
    // taken only at redirect time would arrive after the rejection toast is already pinned up.
    // No grace: on a passing verdict the mute must lift at once, or a genuine error on the page
    // the host is allowed to see would be swallowed too. A bounce adds its own graced hold below,
    // and the count never reaches zero in between, so the trailing cover is kept where it matters.
    const unmute = this.notifications.muteErrors(0);
    const start = Date.now();
    this.subStore.load(hostelId).pipe(take(1)).subscribe(() => {
      const elapsed = Date.now() - start;
      setTimeout(() => {
        this.gateState.set('leaving');
        setTimeout(() => {
          this.gateState.set('none');
          if (!this.subStore.isActive() && !this.isExemptRoute()) {
            this.bounceToSubscription(hostelId);
          }
          unmute();
        }, 300);
      }, Math.max(0, 2000 - elapsed));
    });
  }

  private enforceGate(hostelId: string): void {
    if (this.subStore.isLoadedFor(hostelId)) {
      if (!this.subStore.isActive()) {
        this.bounceToSubscription(hostelId);
      }
      return;
    }
    const unmute = this.notifications.muteErrors(0);
    this.subStore.load(hostelId).pipe(take(1)).subscribe(() => {
      if (!this.subStore.isActive() && !this.isExemptRoute()) {
        this.bounceToSubscription(hostelId);
      }
      unmute();
    });
  }

  protected readonly nav = computed<NavEntry[]>(() => {
    const pid = this.propertyStore.selected();
    const b = `/host/${pid}`;
    // Each destination names the API action it needs, so a sub-user only sees the sections
    // their permissions actually reach. Overview is ungated: it is a dashboard over whatever
    // the user can already see, not a resource of its own.
    const entries: NavEntry[] = [
      { label: 'Overview',       icon: 'ti-layout-dashboard', link: `${b}/overview` },
      { label: 'Hostel profile', icon: 'ti-building',         link: `${b}/profile`,      permission: 'host:Hostel:show' },
      { label: 'Rooms',          icon: 'ti-bed',              link: `${b}/rooms`,        permission: 'host:Room:index' },
      { label: 'Tenants',        icon: 'ti-users',            link: `${b}/tenants`,      permission: 'host:Renter:index' },
      { label: 'Team & staff',   icon: 'ti-user-shield',      link: `${b}/team`,         permission: 'host:Staff:index' },
      { label: 'Utilities',      icon: 'ti-bolt',             link: `${b}/utilities`,    permission: 'host:UtilityBill:index' },
      { label: 'Mess',           icon: 'ti-tools-kitchen-2',  link: `${b}/mess`,         permission: 'host:WeeklyMenu:index' },
      { label: 'Expenses',       icon: 'ti-report-money',     link: `${b}/expenses`,     permission: 'host:Expense:index' },
      { label: 'Invoices',       icon: 'ti-file-invoice',     link: `${b}/invoices`,     permission: 'host:RenterBill:index' },
      { divider: true },
      { label: 'Subscription',   icon: 'ti-rosette',          link: `${b}/subscription`, permission: 'core:Hostel:subscription' },
    ];
    const visible = entries.filter(
      (e) => !e.permission || this.session.hasPermission(e.permission),
    );
    // Drop a divider that lost everything below it, so the list never ends on a stray rule.
    return visible.filter(
      (e, i) => !e.divider || visible.slice(i + 1).some((n) => !n.divider),
    );
  });

  protected readonly propertyDropdownOptions = computed<DropdownOption[]>(() =>
    this.propertyStore.properties().map((p) => ({
      value: p.id,
      label: p.name,
      subtitle: `${p.area}, ${p.city}`,
      statusTone: PILL_TONE[p.status],
      statusLabel: PILL_LABEL[p.status],
      suffixBadge: this.genderLabel(p.accommodationType),
      suffixBadgeClass: this.genderPillClass(p.accommodationType),
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

  private genderLabel(gender: PropertyAccommodationType): string {
    return accommodationLabel(gender);
  }

  private genderPillClass(gender: PropertyAccommodationType): string {
    if (gender === 'boys')  return 'bg-boys/10 text-boys';
    if (gender === 'girls') return 'bg-girls/10 text-girls';
    return 'bg-tint-purple text-ink-600';
  }
}
