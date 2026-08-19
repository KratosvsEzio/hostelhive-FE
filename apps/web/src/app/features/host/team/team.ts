import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { catchError, filter, map, of, startWith, switchMap, take } from 'rxjs';
import {
  Button,
  ConfirmModal,
  ContextMenu,
  ContextMenuDivider,
  DataTable,
  EmptyState,
  FilterChips,
  ErrorState,
  PaginationConfig,
  Skeleton,
} from '@hostelhive/ui';
import { ApiError, Staff } from '@hostelhive/data-access';
import { HostPropertyStore, HostShellApi, StaffApi, StaffPage } from '@services';
import { StaffFormDrawer } from './staff-form-drawer/staff-form-drawer';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { NotificationService } from '@core/notification.service';
import { RefetchDelay } from '@core/refetch-delay';
import { HasPermission, SessionStore } from '@core/auth';
import { STAFF_TABLE_COLS } from '@app/util/table-configs/staff-table-cols';
import { PAGE_SIZE } from '@util/pagination';

/** Refetch key for the staff list, matching the tenants convention. */
// Matched against the request URL with `includes`, so it has to be a fragment that actually
// appears in it: the list is `/api/host/hostels/{hostelId}/staffs`, and the hostel id in the
// middle meant the old full-looking path never matched and the post-save delay never applied.
const STAFF_PATH = '/staffs';

const EMPTY_STAFF = {
  loading: true,
  error: false,
  data: null as StaffPage | null,
};

/**
 * Staff for the selected hostel, backed by `/api/host/hostels/:id/staffs`.
 *
 * This page used to manage *manager accounts* (name/email/password, creating a login).
 * That form and its drawer are gone — `HostShellApi`'s manager endpoints are still there
 * if a separate access-control page is ever wanted, but nothing calls them now.
 */
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
    FilterChips,
    HasPermission,
    StaffFormDrawer,
    ErrorState,
    Skeleton,
  ],
  templateUrl: './team.html',
})
export class HostTeam {
  private readonly staffApi = inject(StaffApi);
  private readonly shellApi = inject(HostShellApi);
  private readonly session = inject(SessionStore);

  /**
   * Whether any row action is available at all. Without this the kebab still opens on a row
   * the user can only read, showing an empty popup — worse than offering no menu.
   */
  protected readonly canActOnStaff = computed(
    () =>
      this.session.hasPermission('host:Staff:update') ||
      this.session.hasPermission('host:Staff:destroy'),
  );
  private readonly store = inject(HostPropertyStore);
  private readonly notifications = inject(NotificationService);
  private readonly refetchDelay = inject(RefetchDelay);
  private readonly destroyRef = inject(DestroyRef);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    // Deep link: /host/:hostelId/team/edit/:staffId opens the drawer on load. The hostel id
    // arrives asynchronously from the store, so wait for it rather than reading it too early.
    const staffId = this.route.snapshot.paramMap.get('staffId');
    if (staffId) {
      toObservable(this.store.selected)
        .pipe(filter(Boolean), take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe((hostelId) => this.loadStaffDetail(hostelId, staffId, null));
    }

    // Browser back/forward: the URL no longer points at a staff member, so drop the drawer.
    // Closing here must not rewrite the URL — the history entry is already what we want.
    const sub = this.location.subscribe(() => this.dismissStaffForm());
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly menuPos = signal<{ top: number; right: number } | null>(null);
  private readonly removingId = signal<string | null>(null);

  /** Status slug the tabs are filtering on; empty = all. */
  protected readonly staffStatus = signal('');
  private readonly staffPage = signal(1);
  private readonly staffRefresh = signal(0);

  private readonly staffQuery = computed(() => ({
    hostelId: this.store.selected(),
    status: this.staffStatus(),
    page: this.staffPage(),
    tick: this.staffRefresh(),
  }));

  private readonly staffState = toSignal(
    toObservable(this.staffQuery).pipe(
      switchMap(({ hostelId, status, page }) => {
        if (!hostelId) return of(EMPTY_STAFF);
        // `f[status.slug]` mirrors the renters list. If the backend does not support it
        // the filter is simply ignored server-side and the tabs stop narrowing — which
        // is visible immediately rather than silently wrong.
        const filters: Record<string, string> = status ? { 'f[status.slug]': status } : {};
        return this.staffApi.list(hostelId, page, PAGE_SIZE, filters).pipe(
          map((res) => ({ loading: false, error: false, data: res })),
          startWith({ loading: true, error: false, data: null as StaffPage | null }),
          catchError(() => of({ loading: false, error: true, data: null as StaffPage | null })),
        );
      }),
    ),
    { initialValue: EMPTY_STAFF },
  );

  protected readonly staffLoading = computed(() => this.staffState().loading);
  protected readonly staffError = computed(() => this.staffState().error);
  protected readonly staffRecords = computed(() => this.staffState().data?.items ?? []);
  protected readonly staffTotal = computed(() => this.staffState().data?.total ?? 0);
  protected readonly staffAggs = computed(() => this.staffState().data?.aggs ?? []);

  /**
   * Status chips for `hh-filter-chips`, matching the rooms/tenants pages. "All" is the empty
   * slug because that is what clears the filter; the counts come from the API's own aggs, so
   * they stay correct across pages rather than counting only the rows on screen.
   */
  protected readonly staffTabs = computed(() => [
    { label: 'All', value: '' },
    ...this.staffAggs().map((a) => ({ label: `${a.name} (${a.count})`, value: a.slug })),
  ]);

  protected readonly propertyName = computed(
    () => this.store.activeProperty()?.name || '—',
  );

  /** Hostel the drawer writes to. */
  protected readonly propertyId = computed(() => this.store.selected());

  protected readonly tableCols = STAFF_TABLE_COLS;
  protected readonly staffRowId = (row: unknown) => (row as Staff).id;
  protected readonly staffActionActive = (row: unknown) =>
    (row as Staff).id === this.menuOpenId();

  protected readonly paginationConf = computed<PaginationConfig | null>(() => {
    const pages = this.staffState().data?.totalPages ?? 1;
    if (pages <= 1) return null;
    const page = this.staffPage();
    return {
      page,
      total: this.staffTotal(),
      totalPages: pages,
      hasNextPage: page < pages,
      itemLabel: 'staff member',
    };
  });

  // ── Drawer ────────────────────────────────────────────────────────────────

  protected readonly staffFormOpen = signal(false);
  protected readonly staffEditing = signal<Staff | null>(null);
  /** Id of the staff whose detail is being fetched before the edit drawer opens. */
  protected readonly staffDetailLoadingId = signal<string | null>(null);

  protected openStaffForm(record: Staff | null = null): void {
    // Create: nothing to fetch, open a blank form.
    if (!record) {
      this.staffEditing.set(null);
      this.staffFormOpen.set(true);
      return;
    }
    const hostelId = this.store.selected();
    if (!hostelId) return;
    // Reflect the edit in the URL with Location rather than Router.navigate: navigating to a
    // different route config tears this component down, which would refetch the whole list.
    this.location.go(`/host/${hostelId}/team/edit/${record.id}`);
    this.loadStaffDetail(hostelId, record.id, record);
  }

  /**
   * Fetches the full staff record, then opens the drawer. The list row is only a summary — it
   * omits salary, status and the CNIC images — and the drawer seeds once from `editing`, so
   * the complete record has to be in place before the drawer renders.
   */
  private loadStaffDetail(hostelId: string, staffId: string, fallback: Staff | null): void {
    if (this.staffDetailLoadingId()) return;
    this.staffDetailLoadingId.set(staffId);
    this.staffApi
      .getById(hostelId, staffId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (full) => {
          this.staffDetailLoadingId.set(null);
          this.staffEditing.set(full);
          this.staffFormOpen.set(true);
        },
        error: () => {
          this.staffDetailLoadingId.set(null);
          // With a list row in hand, fall back to the summary so editing still works; on a
          // deep link there is nothing to show, so drop back to the list.
          if (fallback) {
            this.staffEditing.set(fallback);
            this.staffFormOpen.set(true);
          } else {
            this.closeStaffForm();
          }
        },
      });
  }

  protected closeStaffForm(): void {
    this.dismissStaffForm();
    const hostelId = this.store.selected();
    // replaceState, not Router.navigate: the list is already rendered, and a navigation here
    // would re-run the list request just to get back to the page we are already on.
    if (hostelId) this.location.replaceState(`/host/${hostelId}/team`);
  }

  /** Drops the drawer without touching the URL — for back/forward, where history already moved. */
  private dismissStaffForm(): void {
    this.staffFormOpen.set(false);
    this.staffEditing.set(null);
  }

  protected onStaffSaved(): void {
    this.closeStaffForm();
    this.reloadStaff();
  }

  // ── List ──────────────────────────────────────────────────────────────────

  protected setStaffStatus(slug: string): void {
    this.staffStatus.set(slug);
    this.staffPage.set(1);
  }

  protected setStaffPage(page: number): void {
    this.staffPage.set(page);
  }

  protected reloadStaff(): void {
    this.refetchDelay.track(STAFF_PATH);
    this.staffRefresh.update((n) => n + 1);
  }

  // ── Row menu ──────────────────────────────────────────────────────────────

  protected openMenu(m: Staff, event: MouseEvent): void {
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

  protected readonly staffDeletePending = signal<Staff | null>(null);

  protected promptRemoveStaff(m: Staff): void {
    this.closeMenu();
    this.staffDeletePending.set(m);
  }

  protected confirmRemoveStaff(): void {
    const m = this.staffDeletePending();
    const hostelId = this.store.selected();
    if (!m || !hostelId || this.removingId()) return;
    this.staffDeletePending.set(null);
    this.removingId.set(m.id);
    this.staffApi.remove(hostelId, m.id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.removingId.set(null);
          // Refetch rather than splice locally: the counts in the status tabs and the
          // page boundaries both move when a row goes.
          this.reloadStaff();
          this.notifications.success('Staff removed', `${m.name} has been removed.`);
        },
        error: (err: ApiError) => {
          this.removingId.set(null);
          this.notifications.error("Couldn't remove staff", err.message);
        },
      });
  }

  protected cancelRemoveStaff(): void {
    this.staffDeletePending.set(null);
  }

  // ── Manager access ────────────────────────────────────────────────────────

  protected readonly managerRemovePending = signal<Staff | null>(null);

  protected promptRemoveManager(m: Staff): void {
    this.closeMenu();
    this.managerRemovePending.set(m);
  }

  /**
   * Revokes the login while leaving the employment record intact.
   *
   * Uses the dedicated `PUT /api/hostels/:id/remove_manager` endpoint rather than patching the
   * staff record: revoking a login is its own operation, and the staff form deliberately omits
   * `is_manager` so an ordinary edit can never revoke access by accident.
   */
  protected confirmRemoveManager(): void {
    const m = this.managerRemovePending();
    const hostelId = this.store.selected();
    if (!m || !hostelId || this.removingId()) return;
    this.managerRemovePending.set(null);
    this.removingId.set(m.id);
    this.shellApi
      .removeManager(hostelId, m.id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.removingId.set(null);
          this.reloadStaff();
          this.notifications.success(
            'Manager access removed',
            `${m.name} can no longer manage this hostel.`,
          );
        },
        error: (err: ApiError) => {
          this.removingId.set(null);
          this.notifications.error("Couldn't remove manager access", err.message);
        },
      });
  }

  protected cancelRemoveManager(): void {
    this.managerRemovePending.set(null);
  }
}
