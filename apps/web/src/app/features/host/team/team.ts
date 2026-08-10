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
  AvatarTone,
  Button,
  ConfirmModal,
  ContextMenu,
  ContextMenuDivider,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  PhoneInput,
  Skeleton,
} from '@hostelhive/ui';
import { ApiError, HostTeamData, StaffMember, StaffRole } from '@hostelhive/data-access';
import { HostPropertyStore, HostShellApi } from '@services';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';
import { NotificationService } from '@core/notification.service';
import { RefetchDelay } from '@core/refetch-delay';
import { TEAM_TABLE_COLS } from '@app/util/table-configs/team-table-cols';

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
    Button,
    ConfirmModal,
    ContextMenu,
    ContextMenuDivider,
    DataTable,
    EmptyState,
    ErrorState,
    Input,
    PhoneInput,
    Skeleton,
  ],
  templateUrl: './team.html',
})
export class HostTeam {
  private readonly api = inject(HostShellApi);
  private readonly store = inject(HostPropertyStore);
  private readonly notifications = inject(NotificationService);
  private readonly refetchDelay = inject(RefetchDelay);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refresh = signal(0);
  private readonly deletedIds = signal(new Set<string>());

  protected readonly addOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly removingId = signal<string | null>(null);
  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly menuPos = signal<{ top: number; right: number } | null>(null);
  protected readonly editMember = signal<StaffMember | null>(null);
  protected readonly editName = signal('');
  protected readonly editPhone = signal('');
  protected readonly editSaving = signal(false);

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

  protected readonly staff = computed(() => {
    const data = this.state().data;
    if (!data) return [];
    const deleted = this.deletedIds();
    return deleted.size ? data.staff.filter((m) => !deleted.has(m.id)) : data.staff;
  });

  protected readonly tableCols = TEAM_TABLE_COLS;
  protected readonly teamRowId = (row: unknown) => (row as StaffMember).id;
  protected readonly teamActionActive = (row: unknown) =>
    (row as StaffMember).id === this.menuOpenId();

  protected openMenu(m: StaffMember, event: MouseEvent): void {
    event.stopPropagation();
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    this.menuOpenId.set(m.id);
    this.menuPos.set({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  protected closeMenu(): void {
    this.menuOpenId.set(null);
    this.menuPos.set(null);
  }

  protected openEdit(m: StaffMember): void {
    this.closeMenu();
    this.editMember.set(m);
    this.editName.set(m.name);
    this.editPhone.set(m.phone ?? '');
  }

  protected closeEdit(): void {
    this.editMember.set(null);
    this.editName.set('');
    this.editPhone.set('');
  }

  protected saveEdit(): void {
    const m = this.editMember();
    const hostelId = this.store.selected();
    if (!m || !hostelId || this.editSaving()) return;
    this.editSaving.set(true);
    this.api.updateManager(hostelId, m.id, { name: this.editName().trim(), phone: this.editPhone().trim() })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.editSaving.set(false);
          this.closeEdit();
          this.refetchDelay.track('/manager');
          this.refresh.update((n) => n + 1);
          this.notifications.success('Staff updated', `${this.editName().trim()} has been updated.`);
        },
        error: (err: ApiError) => {
          this.editSaving.set(false);
          this.notifications.error('Couldn\'t update staff', err.message);
        },
      });
  }

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
          this.refetchDelay.track('/manager');
          this.refresh.update((n) => n + 1);
          this.notifications.success('Staff added', `${name} has been added as a Manager.`);
        },
        error: (err: ApiError) => {
          this.saving.set(false);
          this.notifications.error('Couldn\'t add staff', err.message);
        },
      });
  }

  protected readonly staffDeletePending = signal<StaffMember | null>(null);

  protected promptRemoveStaff(m: StaffMember): void {
    this.closeMenu();
    this.staffDeletePending.set(m);
  }

  protected confirmRemoveStaff(): void {
    const m = this.staffDeletePending();
    const hostelId = this.store.selected();
    if (!m || !hostelId || this.removingId()) return;
    this.staffDeletePending.set(null);
    this.removingId.set(m.id);
    this.api.removeManager(hostelId, m.id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.removingId.set(null);
          this.deletedIds.update((s) => { const n = new Set(s); n.add(m.id); return n; });
          this.notifications.success('Staff removed', `${m.name} has been removed.`);
        },
        error: (err: ApiError) => {
          this.removingId.set(null);
          this.notifications.error('Couldn\'t remove staff', err.message);
        },
      });
  }

  protected cancelRemoveStaff(): void {
    this.staffDeletePending.set(null);
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
