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
import { ListingStatus, PropertyAccommodationType } from '@hostelhive/data-access';
import { accommodationLabel } from '@util/accommodation-type';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';

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
 * (profile, team, utilities, analytics), account destinations (subscription,
 * settings, help, sign out) and the property switcher as a bottom sheet.
 * Reachable on desktop too, but only linked from the mobile tab bar.
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
