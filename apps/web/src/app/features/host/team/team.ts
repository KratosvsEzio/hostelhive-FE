import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap, take } from 'rxjs';
import {
  Avatar,
  AvatarTone,
  Button,
  EmptyState,
  ErrorState,
  Input,
  PhoneInput,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import { HostTeamData, StaffMember, StaffRole } from '@hostelhive/data-access';
import { HostPropertyStore, HostShellApi } from '@services';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';
import { NotificationService } from '@core/notification.service';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: HostTeamData | null;
}

const ROLE_LABEL: Record<StaffRole, string> = {
  manager: 'Manager',
  warden: 'Warden',
};
const ROLE_ICON: Record<StaffRole, string> = {
  manager: 'ti-briefcase',
  warden: 'ti-home',
};

@Component({
  selector: 'hh-host-team',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    Avatar,
    Button,
    EmptyState,
    ErrorState,
    Input,
    PhoneInput,
    Skeleton,
    StatusPill,
  ],
  templateUrl: './team.html',
})
export class HostTeam {
  private readonly api = inject(HostShellApi);
  private readonly store = inject(HostPropertyStore);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refresh = signal(0);

  protected readonly addOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly removingId = signal<string | null>(null);

  // Add-staff form state
  protected readonly newName = signal('');
  protected readonly newEmail = signal('');
  protected readonly newPhone = signal('');
  protected readonly newPassword = signal('');

  protected readonly emailError = computed(() => {
    const e = this.newEmail().trim();
    if (!e) return '';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? '' : 'Enter a valid email address';
  });

  protected readonly passwordError = computed(() => {
    const p = this.newPassword().trim();
    if (!p) return '';
    return p.length < 8 ? 'Password must be at least 8 characters' : '';
  });

  protected readonly canSubmit = computed(() =>
    !!this.newName().trim() &&
    !!this.newEmail().trim() &&
    !this.emailError() &&
    !!this.newPassword().trim() &&
    !this.passwordError(),
  );

  protected readonly state = toSignal(
    toObservable(this.refresh).pipe(
      switchMap(() => {
        const hostelId = this.store.selected();
        if (!hostelId) return of<ViewState>({ loading: false, error: false, networkError: false, data: null });
        return this.api.team(hostelId).pipe(
          map((data): ViewState => ({ loading: false, error: false, networkError: false, data })),
          startWith<ViewState>({ loading: true, error: false, networkError: false, data: null }),
          catchError((err) =>
            of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null }),
          ),
        );
      }),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  protected readonly propertyName = computed(
    () =>
      this.state().data?.property.name ||
      this.store.activeProperty()?.name ||
      '—',
  );

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  protected toggleAddPanel(): void {
    this.addOpen.update((v) => !v);
  }

  protected openAddPanel(): void {
    this.addOpen.set(true);
  }

  protected closeAddPanel(): void {
    this.addOpen.set(false);
    this.newName.set('');
    this.newEmail.set('');
    this.newPhone.set('');
    this.newPassword.set('');
  }

  protected addStaff(): void {
    const hostelId = this.store.selected();
    if (!hostelId || this.saving()) return;
    const name = this.newName().trim();
    const email = this.newEmail().trim();
    const password = this.newPassword().trim();
    const phone = this.newPhone().trim();
    if (!name || !email || !password) return;

    this.saving.set(true);
    this.api.addManager(hostelId, { name, email, password, phone })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.closeAddPanel();
          this.refresh.update((n) => n + 1);
          this.notifications.success('Staff added', `${name} has been added as a Manager.`);
        },
        error: () => {
          this.saving.set(false);
          this.notifications.error('Couldn\'t add staff', 'Please check the details and try again.');
        },
      });
  }

  protected removeStaff(m: StaffMember): void {
    const hostelId = this.store.selected();
    if (!hostelId || this.removingId()) return;
    this.removingId.set(m.id);
    this.api.removeManager(hostelId, m.id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.removingId.set(null);
          this.refresh.update((n) => n + 1);
          this.notifications.success('Staff removed', `${m.name} has been removed.`);
        },
        error: () => {
          this.removingId.set(null);
          this.notifications.error('Couldn\'t remove staff', 'Please try again.');
        },
      });
  }

  protected roleLabel(role: StaffRole): string {
    return ROLE_LABEL[role];
  }

  protected roleIcon(role: StaffRole): string {
    return ROLE_ICON[role];
  }

  protected avatarTone(m: StaffMember): AvatarTone {
    return m.status === 'inactive' ? 'mint' : m.tone;
  }
}
