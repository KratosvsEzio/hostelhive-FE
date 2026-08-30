import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService, SessionStore } from '@core/auth';
import { HostPropertyStore, PropertyEntry } from '@services';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { NavEntry, TAB_BAR_SUFFIXES, hostNav, splitNav } from '@layout/host-shell/host-nav';
import { ListingStatus, PropertyAccommodationType } from '@hostelhive/data-access';
import { accommodationLabel } from '@util/accommodation-type';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Row colour, by translation key.
 *
 * Here rather than on `NavEntry` because only this surface tints its rows — the sidebar
 * draws plain icons. A key with no entry falls back to the neutral tint, so a new section
 * appears looking ordinary instead of not appearing at all.
 */
const TINT: Record<string, string> = {
  'common.bookings': 'bg-tint-blue text-ink-600',
  'common.hostelProfile': 'bg-tint-cream text-brand-600',
  'hostNav.teamStaff': 'bg-tint-sky text-ink-600',
  'common.utilities': 'bg-tint-mint text-ink-600',
  'common.mess': 'bg-tint-purple text-ink-600',
  'common.expenses': 'bg-tint-sky text-ink-600',
  'common.subscription': 'bg-tint-cream text-brand-600',
  'hostSubscription.paymentHistory': 'bg-tint-cream text-brand-600',
};

const NEUTRAL_TINT = 'bg-ink-100 text-ink-600';

const STATUS_LABEL: Record<ListingStatus, string> = {
  published: 'Live',
  'in-review': 'In review',
  onboarding: 'Draft',
  paused: 'Paused',
};

const STATUS_CLASS: Record<ListingStatus, string> = {
  published: 'bg-ok/10 text-ok',
  'in-review': 'bg-warn/10 text-warn',
  onboarding: 'bg-ink-100 text-ink-500',
  paused: 'bg-ink-100 text-ink-500',
};

/**
 * Mobile "More" tab of the host console (design board 42): everything that
 * doesn't fit in the bottom tab bar — account card, per-hostel destinations
 * (bookings, profile, team, utilities, mess, expenses), account destinations
 * (subscription, settings, help, sign out) and the property switcher as a bottom sheet.
 * Reachable on desktop too, but only linked from the mobile tab bar.
 *
 * Together with the tab bar this is the whole of host navigation under 768px, where the
 * sidebar is not rendered — so a destination absent from both cannot be reached at all.
 */
@Component({
  selector: 'app-host-more',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, DashboardLayout, TranslocoPipe],
  templateUrl: './more.html',
})
export class HostMore {
  protected readonly session = inject(SessionStore);
  protected readonly propertyStore = inject(HostPropertyStore);
  /** Permission-driven, not role-driven: the API decides who may create a hostel. */
  protected readonly canCreateHostel = computed(
    () => this.session.hasPermission('core:Hostel:create'),
  );
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly switcherOpen = signal(false);

  /**
   * The sidebar’s list, minus what the tab bar already reaches.
   *
   * Derived rather than written out again: this page and the sidebar are the only two
   * places host navigation exists, and when each kept its own list they drifted — ten
   * sections were on the sidebar and not here. Under 768px there is no sidebar, so that
   * drift is not cosmetic; it is a page nobody can reach.
   */
  private readonly entries = computed(() =>
    hostNav(this.base(), {
      monthlyBilled: this.propertyStore.isMonthlyBilled(),
      can: (permission) => this.session.hasPermission(permission),
    }).filter((e) => {
      const link = e.link;
      return !link || !TAB_BAR_SUFFIXES.some((t) => link.endsWith(t));
    }),
  );

  /**
   * Hostel sections, with Bookings first rather than in sidebar order.
   *
   * Everything else here is opened occasionally; arrivals and room assignments are the
   * daily job, and this screen already costs a tap to reach.
   */
  protected readonly hostelRows = computed<NavEntry[]>(() => {
    const rows = splitNav(this.entries()).hostel;
    const at = rows.findIndex((e) => e.label === 'common.bookings');
    return at <= 0 ? rows : [rows[at], ...rows.filter((_, i) => i !== at)];
  });

  /** What sat below the divider: the billing pages. */
  protected readonly accountRows = computed<NavEntry[]>(
    () => splitNav(this.entries()).account,
  );

  protected tint(entry: NavEntry): string {
    return TINT[entry.label ?? ""] ?? NEUTRAL_TINT;
  }

  protected readonly base = computed(
    () => `/host/${this.propertyStore.selected()}`,
  );

  protected readonly initials = computed(() => {
    const name = this.session.user()?.name ?? '';
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]!.toUpperCase())
        .join('') || '?'
    );
  });

  protected statusLabel(p: PropertyEntry): string {
    return STATUS_LABEL[p.status] ?? p.status;
  }

  protected statusClass(p: PropertyEntry): string {
    return STATUS_CLASS[p.status] ?? 'bg-ink-100 text-ink-500';
  }

  protected genderLabel(g: PropertyAccommodationType): string {
    return accommodationLabel(g);
  }

  protected genderClass(g: PropertyAccommodationType): string {
    if (g === 'boys') return 'bg-boys/10 text-boys';
    if (g === 'girls') return 'bg-girls/10 text-girls';
    return 'bg-tint-purple text-ink-600';
  }

  protected selectProperty(p: PropertyEntry): void {
    this.switcherOpen.set(false);
    if (p.id === this.propertyStore.selected()) return;
    this.propertyStore.setProperty(p.id);
    void this.router.navigate(['/host', p.id, 'more']);
  }

  protected signOut(): void {
    // Revokes the JWT server-side and clears the local session either way.
    this.auth.signOut().subscribe(() => void this.router.navigate(['/']));
  }
}
