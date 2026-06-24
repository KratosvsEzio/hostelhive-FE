import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusPill,
  StatusTone,
} from '@hostelhive/ui';
import {
  HostListing,
  HostListingsData,
  ListingStatus,
} from '@hostelhive/data-access';
import { HostShellApi } from '@services';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';

interface MenuItem {
  action: string;
  label: string;
  icon: string;
  danger?: boolean;
}

const MENU_ITEMS: Record<ListingStatus, MenuItem[]> = {
  published: [
    { action: 'edit',  label: 'Edit listing',  icon: 'ti-edit' },
    { action: 'pause', label: 'Pause listing',  icon: 'ti-player-pause' },
  ],
  'in-review': [
    { action: 'edit',     label: 'Edit listing', icon: 'ti-edit' },
    { action: 'withdraw', label: 'Withdraw',      icon: 'ti-arrow-back' },
  ],
  onboarding: [
    { action: 'setup',  label: 'Continue setup', icon: 'ti-arrow-right' },
    { action: 'delete', label: 'Delete',          icon: 'ti-trash', danger: true },
  ],
  paused: [
    { action: 'resume', label: 'Resume listing', icon: 'ti-player-play' },
    { action: 'edit',   label: 'Edit listing',   icon: 'ti-edit' },
  ],
};

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: HostListingsData | null;
}

const STATUS_TONE: Record<ListingStatus, StatusTone> = {
  published: 'ok',
  'in-review': 'warn',
  onboarding: 'neutral',
  paused: 'neutral',
};

const STATUS_LABEL: Record<ListingStatus, string> = {
  published: 'Published',
  'in-review': 'In review',
  onboarding: 'Onboarding',
  paused: 'Paused',
};

const STATUS_ICON: Record<ListingStatus, string> = {
  published: 'ti-circle-filled text-[8px]',
  'in-review': 'ti-clock text-xs',
  onboarding: 'ti-progress text-xs',
  paused: 'ti-player-pause text-xs',
};

/**
 * Host · My listings (design-mockups/10-host-listings.html).
 * Stat strip + property row-cards with status pills + a resume-draft dashed card.
 */
@Component({
  selector: 'hh-host-listings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    RouterLink,
    DecimalPipe,
    Button,
    Card,
    EmptyState,
    ErrorState,
    Skeleton,
    StatusPill,
  ],
  templateUrl: './listings.html',
})
export class HostListings {
  private readonly api = inject(HostShellApi);
  private readonly refresh = signal(0);

  protected readonly state = toSignal(
    toObservable(this.refresh).pipe(
      switchMap(() =>
        this.api.listings().pipe(
          map((data): ViewState => ({ loading: false, error: false, networkError: false, data })),
          startWith<ViewState>({ loading: true, error: false, networkError: false, data: null }),
          catchError((err) =>
            of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null }),
          ),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  protected readonly openMenuId = signal<string | null>(null);

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  protected statusTone(status: ListingStatus): StatusTone {
    return STATUS_TONE[status];
  }

  protected statusLabel(status: ListingStatus): string {
    return STATUS_LABEL[status];
  }

  protected statusIcon(status: ListingStatus): string {
    return STATUS_ICON[status];
  }

  protected genderLabel(g: HostListing['gender']): string {
    return g === 'coliving' ? 'Co-living' : g === 'boys' ? 'Boys' : 'Girls';
  }

  protected menuItems(status: ListingStatus): MenuItem[] {
    return MENU_ITEMS[status];
  }

  protected toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.openMenuId.update((cur) => (cur === id ? null : id));
  }

  protected closeMenu(): void {
    this.openMenuId.set(null);
  }

  protected onMenuAction(action: string, listing: HostListing): void {
    this.closeMenu();
    // TODO: wire actions to router/API as listing management pages are built
    console.log(action, listing.id);
  }
}
