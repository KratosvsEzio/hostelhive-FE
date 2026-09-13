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
import { Staff } from '@hostelhive/data-access';
import { HostPropertyStore, HostShellApi, StaffApi, StaffPage } from '@services';
import {
  StaffRowPermissions,
  StaffRowViewer,
  applyDemotions,
  applySaved,
  canActOnStaffRow,
  isOwnStaffRecord,
} from './staff-row-actions';
import { StaffFormDrawer } from './staff-form-drawer/staff-form-drawer';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { NotificationService } from '@core/notification.service';
import { RefetchDelay } from '@core/refetch-delay';
import { HasPermission, SessionStore } from '@core/auth';
import { STAFF_TABLE_COLS } from '@app/util/table-configs/staff-table-cols';
import { PAGE_SIZE } from '@util/pagination';
import { TranslocoPipe } from '@jsverse/transloco';

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
    TranslocoPipe,
  ],
  templateUrl: './team.html',
})
export class HostTeam {
  private readonly staffApi = inject(StaffApi);
  private readonly shellApi = inject(HostShellApi);
  private readonly session = inject(SessionStore);

  private readonly canEditStaff = computed(() =>
    this.session.hasPermission('host:Staff:update'),
  );
  private readonly canDeleteStaff = computed(() =>
    this.session.hasPermission('host:Staff:destroy'),
  );
  /**
   * `core:`, not `host:`.
   *
   * This asked for `host:Hostel:remove_manager`, which the API has never issued — read off a
   * live session, `remove_manager` exists only in the `core` group, and `host:Hostel:` is
   * granted for `index` and `show` alone. `permissionGranted` matches exactly, with only a
   * `group:subject:manage` umbrella as fallback and no umbrellas granted at all, so the old
   * string could not be satisfied by any role. It silently failed closed: the menu item
   * never rendered and nobody saw an error.
   */
  private readonly canRemoveManager = computed(() =>
    this.session.hasPermission('core:Hostel:remove_manager'),
  );

  /**
   * Whether the table gets an actions column at all — the cheap question, asked once.
   *
   * Not the whole answer: which rows get a button is {@link canActOnRow}, because a session
   * holding only `remove_manager` can act on a manager row and on nothing else. This decides
   * whether the column exists; that decides whether each row fills it.
   */
  protected readonly canActOnStaff = computed(
    () => this.canEditStaff() || this.canDeleteStaff() || this.canRemoveManager(),
  );

  /** The viewer, in the shape {@link canActOnStaffRow} needs. Null before the session lands. */
  private readonly viewer = computed<StaffRowViewer | null>(() => {
    const me = this.session.user();
    return me ? { id: me.id, email: me.email } : null;
  });

  private readonly staffPerms = computed<StaffRowPermissions>(() => ({
    edit: this.canEditStaff(),
    remove: this.canDeleteStaff(),
    removeManager: this.canRemoveManager(),
  }));

  /** Per-row menu rule — see {@link canActOnStaffRow} for why a row goes quiet. */
  protected readonly canActOnRow = (row: unknown): boolean =>
    canActOnStaffRow(row as Staff, this.viewer(), this.staffPerms());
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
  /**
   * Staff whose manager access was revoked in this session, applied over the fetched page.
   *
   * `remove_manager` changes exactly one field on one row. Refetching the whole list to learn
   * that costs a request, a spinner and a scroll position, and the answer was already on the
   * screen — the server has confirmed with a 200, so the record in hand is now known to be
   * stale in precisely one place, and patching it there is both cheaper and steadier than
   * asking again.
   *
   * Held as ids over the fetched items rather than by mutating them, because the items belong
   * to {@link staffState} and are replaced wholesale on every fetch. Cleared by
   * {@link reloadStaff} — once the server has spoken again its answer is the better one, and
   * a stale overlay could otherwise hide a role granted from somewhere else.
   */
  private readonly demoted = signal<ReadonlySet<string>>(new Set());

  /**
   * Staff saved in this session, applied over the fetched page.
   *
   * `StaffApi.create` and `update` both answer with the persisted record, so the drawer can
   * hand the row straight back and the page has nothing left to fetch. Cleared by
   * {@link reloadStaff} alongside the other overlays.
   */
  private readonly saved = signal<readonly Staff[]>([]);

  /** Rows added locally, added to the server's `total`. See {@link saved}. */
  private readonly totalDelta = signal(0);

  /** Per-status adjustments to the fetched aggs, keyed by slug. See {@link shiftAggs}. */
  private readonly aggDelta = signal<ReadonlyMap<string, number>>(new Map());

  protected readonly staffRecords = computed(() =>
    applySaved(
      applyDemotions(this.staffState().data?.items ?? [], this.demoted()),
      this.saved(),
    ),
  );
  protected readonly staffTotal = computed(
    () => (this.staffState().data?.total ?? 0) + this.totalDelta(),
  );
  protected readonly staffAggs = computed(() => {
    const aggs = this.staffState().data?.aggs ?? [];
    const delta = this.aggDelta();
    if (!delta.size) return aggs;
    return aggs.map((a) =>
      delta.has(a.slug) ? { ...a, count: Math.max(0, a.count + delta.get(a.slug)!) } : a,
    );
  });

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
          // Same rule as the row menu, applied where the drawer actually opens. Hiding the
          // button closes the route through the table; `team/edit/:staffId` is a second door
          // onto the same form, reachable by typing it or from a bookmark made before this
          // guard existed. It is also the better place to ask, because the detail record
          // carries `userId` where the list row does not.
          //
          // `isOwnStaffRecord` rather than the menu's predicate: this is the *edit* form, so
          // the menu's "or you could delete it" is not enough to have earned it.
          if (isOwnStaffRecord(full, this.viewer())) {
            this.closeStaffForm();
            return;
          }
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

  /**
   * The drawer hands back the persisted record, so the list needs no second request.
   *
   * This used to close the form and reload the page. The reload had nothing to tell us that
   * the response had not already said — it cost a spinner and the host's place in the table
   * immediately after being told the save worked.
   */
  protected onStaffSaved(persisted: Staff): void {
    const before = this.staffRecords().find((s) => s.id === persisted.id) ?? null;
    this.saved.update((list) => [...list.filter((s) => s.id !== persisted.id), persisted]);
    this.shiftAggs(before, persisted);
    this.closeStaffForm();
  }

  /**
   * Moves the status-tab counts and the total to match a locally-applied save.
   *
   * Without it the list would be right and everything describing it wrong — "Active (5)"
   * still reading 5 after a sixth was added, and the footer counting a page that now holds
   * one more row. That is a worse state than either being stale alone, because the two
   * disagree on screen.
   *
   * Arithmetic on what the last fetch reported rather than a recount: the page holds one
   * page of staff and the aggs describe all of them, so counting what is visible would be
   * counting the wrong set.
   */
  private shiftAggs(before: Staff | null, after: Staff): void {
    if (before?.status === after.status) return;
    this.aggDelta.update((map) => {
      const next = new Map(map);
      if (before) next.set(before.status, (next.get(before.status) ?? 0) - 1);
      next.set(after.status, (next.get(after.status) ?? 0) + 1);
      return next;
    });
    // Only a create adds a person; an edit moves an existing one between tabs.
    if (!before) this.totalDelta.update((n) => n + 1);
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
    // The incoming page is the server's own answer, so every local patch is now redundant at
    // best and contradicted at worst. All four go together: the rows, the demotions, and the
    // two counts that describe them — clearing a subset leaves the list and its totals
    // disagreeing on screen.
    this.demoted.set(new Set());
    this.saved.set([]);
    this.totalDelta.set(0);
    this.aggDelta.set(new Map());
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
        // `errorInterceptor` toasts it, titled "Couldn't delete" off the request verb.
        error: () => this.removingId.set(null),
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
          // No refetch: the 200 tells us the one thing that changed, and the row is already
          // here. See `demoted` — the badge and the menu item both come off this flag, so
          // patching it is the whole of the update the list needs.
          this.demoted.update((ids) => new Set(ids).add(m.id));
          this.notifications.success(
            'Manager access removed',
            `${m.name} can no longer manage this hostel.`,
          );
        },
        // As above: one toast, from the interceptor.
        error: () => this.removingId.set(null),
      });
  }

  protected cancelRemoveManager(): void {
    this.managerRemovePending.set(null);
  }
}
