import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { HostBillingStore, HostPropertyStore } from '@services';
import { ConsoleDrawer } from '../components/console-drawer/console-drawer';
import { hostPagePath } from './host-route';
import { CRM_SECTION_LABELS, NavEntry, crmSectionOf, hostNav, isBillingPage } from './host-nav';
import { HostTabBar } from '../components/mobile-tab-bar/host-tab-bar';
import { BillingBanner } from '../components/billing-banner/billing-banner';
import { AccessLock, AccessLockVariant } from '../components/access-lock/access-lock';
import { MobileApp } from '@core/mobile-app';
import { SessionStore } from '@core/auth';
import { Button, Dropdown, DropdownOption, StatusTone, TooltipFixed } from '@hostelhive/ui';
import { ListingStatus, PropertyAccommodationType } from '@hostelhive/data-access';
import { accommodationLabel } from '@util/accommodation-type';
import { LocaleLink } from '@core/i18n/locale-link';
import { Logo } from '@core/brand/logo';
import { TranslocoPipe } from '@jsverse/transloco';

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
  imports: [
    Logo,
    RouterLink,
    LocaleLink,
    RouterLinkActive,
    RouterOutlet,
    Dropdown,
    Button,
    HostTabBar,
    TooltipFixed,
    TranslocoPipe,
    BillingBanner,
    AccessLock,
  ],
  templateUrl: './host-shell.html',
  // Escape closes the property flyout wherever focus happens to be -- it is a popover, and
  // one that can only be dismissed by finding its backdrop is a trap for the keyboard.
  host: { '(document:keydown.escape)': 'closePropertyFlyout()' },
})
export class HostLayout {
  protected readonly drawer = inject(ConsoleDrawer);
  private readonly session = inject(SessionStore);
  /** Permission-driven, not role-driven: the API decides who may create a hostel. */
  protected readonly canCreateHostel = computed(
    () => this.session.hasPermission('core:Hostel:create'),
  );
  protected readonly propertyStore = inject(HostPropertyStore);
  protected readonly mobile = inject(MobileApp);
  protected readonly billingStore = inject(HostBillingStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Follows the sidebar's own width, so the rail does not leave 192px of empty gutter. */
  protected readonly contentPadding = computed(() =>
    !this.mobile.isMobile() ? this.drawer.width_() : '0',
  );

  constructor() {
    if (typeof window !== 'undefined') {
      this.propertyStore.load();
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

  private readonly _trackBilling = effect(() => {
    const id = this.routeHostelId();
    untracked(() => this.billingStore.track(id));
  });

  /** The page below the hostel, e.g. `rooms/edit/r2`; follows every completed navigation. */
  private readonly pagePath = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => hostPagePath(this.router.url)),
    ),
    { initialValue: hostPagePath(this.router.url) },
  );

  protected readonly ownerId = computed(() => this.session.user()?.id ?? null);

  /** The billing page states the plan itself, so the banner would only repeat it there. */
  protected readonly showBanner = computed(
    () => !!this.billingStore.hostelId() && !isBillingPage(this.pagePath()),
  );

  /** Stands in for the page on a CRM section the plan state shuts; Profile, Billing and More stay open. */
  protected readonly lock = computed<{ variant: AccessLockVariant; sectionLabel: string } | null>(
    () => {
      const variant = this.billingStore.bodyLock();
      const section = crmSectionOf(this.pagePath());
      return variant && section ? { variant, sectionLabel: CRM_SECTION_LABELS[section] } : null;
    },
  );

  protected readonly nav = computed<NavEntry[]>(() =>
    hostNav(`/host/${this.propertyStore.selected()}`, {
      monthlyBilled: this.propertyStore.isMonthlyBilled(),
      nightlyBilled: this.propertyStore.isNightlyBilled(),
      can: (permission) => this.session.hasPermission(permission),
      crmLocked: this.billingStore.crmLocked(),
    }),
  );

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

  /**
   * Spinner state for the property switcher.
   *
   * Driven by the store's `loaded` flag, which flips true whether the fetch succeeded or
   * failed. It previously inferred loading from "no properties but a selected id" — which
   * is precisely the state a FAILED fetch leaves behind, because the selected id is
   * restored from localStorage while the list stays empty. The switcher then span forever
   * on any backend error, with no way for the user to tell a slow request from a dead one.
   */
  protected readonly propertiesLoading = computed(() => !this.propertyStore.loaded());

  /** Empty because the fetch failed, rather than because this host has no hostels yet. */
  protected readonly propertiesUnavailable = computed(
    () => this.propertyStore.loaded() && this.propertyStore.properties().length === 0,
  );

  /* ------------------------------------------------- property picker, in the rail */

  /**
   * The property picker as a flyout beside the rail, rather than a reason to widen it.
   *
   * Clicking it used to expand the whole sidebar, which answered "which hostel am I on?"
   * by rearranging the entire console and leaving the host to put it back. The flyout
   * carries the same dropdown and the same create button, and costs nothing to dismiss.
   */
  protected readonly propertyFlyout = signal(false);

  protected togglePropertyFlyout(): void {
    this.propertyFlyout.update((v) => !v);
  }

  protected closePropertyFlyout(): void {
    this.propertyFlyout.set(false);
  }

  /**
   * The collapse chevron, which has to get past the flyout first.
   *
   * Expanding while it is open would slide 192px of sidebar out underneath a panel pinned
   * to where the rail's edge used to be, leaving it floating over the nav it belongs to.
   * So the panel goes first and the sidebar opens in the same click \x2D\x2D one gesture, not two.
   */
  protected onToggleRail(): void {
    if (this.propertyFlyout()) this.closePropertyFlyout();
    this.drawer.toggleRail();
  }

  protected onPropertySelect(value: string | string[] | null): void {
    if (typeof value !== 'string') return;
    this.closePropertyFlyout();
    // The same page, on another hostel. Counting segments raw included the language prefix,
    // so the old hostel id was carried into the new URL — `/host/<new>/<old>/rooms`, which
    // matches no route and drops the host on the public home page.
    const page = hostPagePath(this.router.url);
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
