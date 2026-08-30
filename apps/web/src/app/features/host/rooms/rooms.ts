import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { catchError, filter, finalize, map, of, startWith, switchMap } from 'rxjs';
import {
  Button,
  ConfirmModal,
  ContextMenu,
  ContextMenuDivider,
  Dropdown,
  DropdownOption,
  EmptyState,
  ErrorState,
  FilterChips,
  FilterChipOption,
  Input,
  PaginationConfig,
  Search,
  Skeleton,
  SortState,
} from '@hostelhive/ui';
import { HostOpsApi, HostPropertyStore, RoomAggs, RoomRenter, RoomStatusOption, RoomTypeOption } from '@services';
import { ApiError, HostRoom as Room, RoomStatus } from '@hostelhive/data-access';
import { NotificationService } from '@core/notification.service';
import { RefetchDelay } from '@core/refetch-delay';
import { toToastCopy } from '@core/errors/api-error-message';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { SubscriptionGate } from '@layout/components/subscription-gate/subscription-gate';
import { isSubscriptionError } from '@util/subscription-error';
import { isNetworkError } from '@util/network-error';
import { displayLabelFor } from '@util/room-types';
import { ROOMS_TABLE_COLS } from '@app/util/table-configs/rooms-table-cols';
import { HasPermission } from '@core/auth';
import { TranslocoPipe } from '@jsverse/transloco';

/** The grid renders every room at once, so fetch a large single page instead of paginating. */
const ROOMS_LIMIT = 1000;

interface ViewState {
  loading: boolean;
  error: boolean;
  subscriptionError: boolean;
  networkError: boolean;
  data: Room[] | null;
  total: number;
  aggs: RoomAggs | null;
  statuses: RoomStatusOption[];
}

interface RoomForm {
  id: string | null;
  number: string;
  floor: string;
  type: string;
  capacity: string;
}

interface ManualRow {
  number: string;
  type: string;
  capacity: string;
}

interface BulkForm {
  mode: 'range' | 'custom' | 'manual';
  prefix: string;
  start: string;
  count: string;
  custom: string;
  rows: ManualRow[];
  roomType: string;
  capacity: string;
}

interface RoomTypesState {
  loading: boolean;
  error: boolean;
  data: RoomTypeOption[];
}

/**
 * What the URL is asking a drawer to show, or `null` when both stay closed. The drawers are
 * route-driven so the Android hardware back button (and the browser's) closes them and lands
 * back on the room list, rather than navigating off the page entirely.
 */
type DrawerRequest =
  | { mode: 'create'; cloneFrom?: string }
  | { mode: 'edit'; roomId: string }
  | { mode: 'bulk' };

const STATUS_TONE: Record<RoomStatus, 'ok' | 'warn' | 'neutral'> = {
  available: 'ok',
  partial: 'warn',
  full: 'neutral',
};
const STATUS_LABEL: Record<RoomStatus, string> = {
  available: 'Available',
  partial: 'Partial',
  full: 'Full',
};

// ── Occupancy grid ─────────────────────────────────────────────────────────────
/** A room's card state in the grid. `maintenance` has no backing data yet (rooms carry no
 *  maintenance flag) — kept in the union so the legend/colour map stay complete. */
/** Occupancy state of a room — drives the card's dot colour and background tint. */
type RoomCardStatus = 'available' | 'partial' | 'full';

interface RoomCard {
  room: Room;
  status: RoomCardStatus;
  /** "{floor} - {number}" (or just the number when no floor is set). */
  code: string;
  /** First two occupant names, comma-joined (or "Available" / "N occupied" when no names are known). */
  label: string;
  /** Count of additional occupants beyond the first two — rendered as a "+N" chip. */
  extra: number;
  bg: string;
}

interface FloorGroup {
  key: string;
  label: string;
  order: number;
  cards: RoomCard[];
  available: number;
  partial: number;
  full: number;
}

/**
 * Light background + a slightly darker same-hue border per occupancy state —
 * green (free) / blue (partial) / red (full). The card's static class carries `border`
 * (width) only; the colour comes from here so it always matches the fill.
 */
const CARD_BG: Record<RoomCardStatus, string> = {
  available: 'bg-ok/10 border-ok/30',
  partial: 'bg-blue-500/10 border-blue-500/30',
  full: 'bg-danger/10 border-danger/30',
};

/** Title-case a free-text label ("ground floor" → "Ground Floor"). */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Human label for a floor value: a bare number becomes "Floor N"; a name is title-cased. */
function floorLabel(floor: string): string {
  return /^\d+$/.test(floor) ? `Floor ${floor}` : titleCase(floor);
}

/** Sort order for a floor group: numeric floors ascending, "Ground" first, other names after. */
function floorOrder(floor: string): number {
  if (/^\d+$/.test(floor)) return Number(floor);
  if (/ground/i.test(floor)) return -1;
  return 1000;
}


@Component({
  selector: 'hh-rooms',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HasPermission,
    DecimalPipe,
    DashboardLayout,
    SubscriptionGate,
    Button,
    ConfirmModal,
    Dropdown,
    FilterChips,
    Input,
    ContextMenu,
    ContextMenuDivider,
    Search,
    Skeleton,
    EmptyState,
    ErrorState,
    TranslocoPipe,
  ],
  templateUrl: './rooms.html',
})
export class Rooms {
  private readonly api = inject(HostOpsApi);
  private readonly store = inject(HostPropertyStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notifications = inject(NotificationService);
  private readonly refetchDelay = inject(RefetchDelay);
  private readonly refresh = signal(0);

  /** Locally-mutated copy so create/edit reflect immediately (no write API yet). */
  private readonly local = signal<Room[] | null>(null);
  /**
   * The aggregate counts adjusted for a room added locally.
   *
   * The header reads `aggs` from the server when it has them, so appending a row without
   * this leaves "16 TOTAL BEDS" beside a grid that now shows more — the two halves of one
   * screen disagreeing. A delta rather than a recount, because the visible rows are one
   * page and the counts are the whole property.
   */
  private readonly localAggs = signal<RoomAggs | null>(null);

  protected readonly searchQuery = signal('');
  protected readonly statusFilter = signal(
    this.route.snapshot.queryParams['status'] ?? 'all',
  );

  /** Persisted across re-fetches so chips don't disappear while a new page loads. */
  protected readonly statuses = signal<RoomStatusOption[]>([]);
  protected readonly statusTabs = computed<FilterChipOption[]>(() => [
    { label: 'All', value: 'all' },
    ...this.statuses().map(s => ({ label: s.name, value: s.slug })),
  ]);
  protected readonly page = signal(1);
  protected readonly sortCol = signal<'createdAt' | 'occupancy' | null>(null);
  protected readonly sortDir = signal<'asc' | 'desc'>('asc');

  private readonly drawerRequest = signal<DrawerRequest | null>(null);

  protected readonly form = signal<RoomForm | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly menuPos = signal<{ top: number; right: number } | null>(null);

  protected readonly bulkForm = signal<BulkForm | null>(null);
  protected readonly bulkSaving = signal(false);
  protected readonly bulkError = signal<string | null>(null);

  protected readonly expandedId = signal<string | null>(null);
  protected readonly expandedDetail = signal<RoomRenter[] | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly detailError = signal(false);

  protected readonly renterMenuId = signal<string | null>(null);
  private readonly deletedRenterIds = signal(new Set<string>());
  protected readonly renterDeletePending = signal<RoomRenter | null>(null);
  protected readonly renterDeleting = signal(false);
  protected readonly roomDeletePending = signal<Room | null>(null);

  private readonly roomTypesRefresh = signal(0);
  private readonly rtKey = computed(() => ({
    hostelId: this.store.selected(),
    refresh: this.roomTypesRefresh(),
  }));

  private readonly roomTypesState = toSignal(
    toObservable(this.rtKey).pipe(
      switchMap(({ hostelId }) => {
        if (!hostelId) return of<RoomTypesState>({ loading: false, error: false, data: [] });
        return this.api.roomFormOptions(hostelId).pipe(
          map((data): RoomTypesState => ({ loading: false, error: false, data })),
          startWith<RoomTypesState>({ loading: true, error: false, data: [] }),
          catchError(() => of<RoomTypesState>({ loading: false, error: true, data: [] })),
        );
      }),
    ),
    { initialValue: { loading: true, error: false, data: [] } as RoomTypesState },
  );

  protected readonly roomTypesLoading = computed(() => this.roomTypesState().loading);
  protected readonly roomTypesError = computed(() => this.roomTypesState().error);

  protected readonly roomTypeOptions = computed<DropdownOption[]>(() =>
    this.roomTypesState().data.map((rt) => ({ value: rt.name, label: displayLabelFor(rt.name) })),
  );

  constructor() {
    // Drive both drawers from the URL.
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      startWith(null),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.syncFromRoute());

    effect(() => {
      const s = this.fetched().statuses;
      if (s?.length) this.statuses.set(s);
    }, { allowSignalWrites: true });

    // Seed (or tear down) the drawer state for whatever the URL asks for. Rooms and room
    // types are read reactively so a deep link / refresh re-seeds once their data arrives.
    effect(() => {
      const req = this.drawerRequest();
      const rooms = this.state().data;
      const types = this.roomTypesState().data;

      untracked(() => this.seedDrawer(req, rooms, types));
    }, { allowSignalWrites: true });

    effect(() => {
      const state = this.roomTypesState();
      if (state.loading || state.error || !state.data.length) return;
      const first = state.data[0];

      untracked(() => {
        const f = this.form();
        if (f && !f.id && !f.type) {
          this.form.set({ ...f, type: first.name, capacity: String(first.capacity) });
        }

        const bf = this.bulkForm();
        if (bf && !bf.roomType) {
          this.bulkForm.set({ ...bf, roomType: first.name, capacity: String(first.capacity) });
        }
      });
    }, { allowSignalWrites: true });
  }

  private syncFromRoute(): void {
    const snapshot = this.route.snapshot;
    const seg = snapshot.url[0]?.path;

    if (seg === 'create') {
      this.drawerRequest.set({
        mode: 'create',
        cloneFrom: snapshot.queryParamMap.get('cloneFrom') ?? undefined,
      });
      return;
    }
    if (seg === 'bulk') {
      this.drawerRequest.set({ mode: 'bulk' });
      return;
    }
    if (seg === 'edit') {
      const roomId = snapshot.paramMap.get('roomId');
      if (roomId) {
        this.drawerRequest.set({ mode: 'edit', roomId });
        return;
      }
    }
    this.drawerRequest.set(null);
  }

  /**
   * Reconciles drawer state with the URL. Never re-seeds a drawer that is already showing the
   * requested thing, so typing in a field survives unrelated signal churn.
   */
  private seedDrawer(
    req: DrawerRequest | null,
    rooms: Room[] | null,
    types: RoomTypeOption[],
  ): void {
    if (!req) {
      this.form.set(null);
      this.bulkForm.set(null);
      this.saveError.set(null);
      this.bulkError.set(null);
      return;
    }

    const first = types[0];

    if (req.mode === 'bulk') {
      this.form.set(null);
      if (this.bulkForm()) return;
      this.bulkError.set(null);
      this.bulkForm.set({
        mode: 'range',
        prefix: '',
        start: '101',
        count: '10',
        custom: '',
        rows: [{ number: '', type: first?.name ?? '', capacity: first ? String(first.capacity) : '' }],
        roomType: first?.name ?? '',
        capacity: first ? String(first.capacity) : '',
      });
      return;
    }

    this.bulkForm.set(null);

    if (req.mode === 'create') {
      // Switching edit → create reuses the component, so drop a stale edit form first.
      if (this.form()?.id) this.form.set(null);
      if (this.form()) return;

      if (req.cloneFrom) {
        const src = rooms?.find((r) => r.id === req.cloneFrom);
        if (!src) return; // rooms not loaded yet — this effect re-runs when they are
        this.saveError.set(null);
        this.form.set({
          id: null,
          number: `${src.number} (copy)`,
          floor: src.floor && src.floor !== '—' ? src.floor : '',
          type: src.type,
          capacity: String(src.capacity),
        });
        return;
      }

      this.saveError.set(null);
      this.form.set({
        id: null,
        number: '',
        floor: '',
        type: first?.name ?? '',
        capacity: first ? String(first.capacity) : '',
      });
      return;
    }

    if (this.form()?.id === req.roomId) return;
    const room = rooms?.find((r) => r.id === req.roomId);
    if (!room) return; // rooms not loaded yet — this effect re-runs when they are
    this.saveError.set(null);
    this.form.set({
      id: room.id,
      number: room.number,
      floor: room.floor && room.floor !== '—' ? room.floor : '',
      type: room.type,
      capacity: String(room.capacity),
    });
  }

  /** `['/host', <hostelId>, 'rooms']`, or `null` when no hostel is selected yet. */
  private roomsBase(): unknown[] | null {
    const hostelId = this.store.selected();
    return hostelId ? ['/host', hostelId, 'rooms'] : null;
  }

  private goToList(): void {
    const base = this.roomsBase();
    if (!base) return;
    void this.router.navigate(base, {
      queryParams: { cloneFrom: null },
      queryParamsHandling: 'merge',
    });
  }

  private readonly fetchKey = computed(() => ({
    hostelId: this.store.selected(),
    refresh: this.refresh(),
    search: this.searchQuery(),
    statusFilter: this.statusFilter(),
    page: this.page(),
  }));

  private readonly fetched = toSignal(
    toObservable(this.fetchKey).pipe(
      switchMap(({ hostelId, search, statusFilter, page }) => {
        if (!hostelId) return of<ViewState>({ loading: false, error: false, subscriptionError: false, networkError: false, data: [], total: 0, aggs: null, statuses: [] });
        const filters: Record<string, string> = {};
        if (search.trim()) filters['f[room_number]'] = search.trim();
        if (statusFilter !== 'all') filters['f[status.slug]'] = statusFilter;
        return this.api.rooms(hostelId, page, ROOMS_LIMIT, filters).pipe(
          map((res): ViewState => ({ loading: false, error: false, subscriptionError: false, networkError: false, data: res.rooms, total: res.total, aggs: res.aggs, statuses: res.statuses })),
          startWith<ViewState>({ loading: true, error: false, subscriptionError: false, networkError: false, data: null, total: 0, aggs: null, statuses: [] }),
          catchError((err) => {
            const sub = isSubscriptionError(err);
            const net = isNetworkError(err);
            return of<ViewState>({
              loading: false,
              error: !sub,
              subscriptionError: sub,
              networkError: net,
              data: null,
              total: 0,
              aggs: null,
              statuses: [],
            });
          }),
        );
      }),
    ),
    { initialValue: { loading: true, error: false, subscriptionError: false, networkError: false, data: null, total: 0, aggs: null, statuses: [] } as ViewState },
  );

  protected readonly state = computed<ViewState>(() => {
    const base = this.fetched();
    const overlay = this.local();
    if (!overlay || base.loading || base.error) return base;
    return { ...base, data: overlay, aggs: this.localAggs() ?? base.aggs };
  });

  protected readonly totalRooms = computed(() =>
    this.state().aggs?.totalRooms ?? (this.state().data?.length ?? 0),
  );
  protected readonly totalBeds = computed(() =>
    this.state().aggs?.totalCapacity ?? (this.state().data ?? []).reduce((n, r) => n + r.capacity, 0),
  );
  protected readonly occupiedBeds = computed(() =>
    this.state().aggs?.occupiedCapacity ?? (this.state().data ?? []).reduce((n, r) => n + r.occupied, 0),
  );
  protected readonly vacantBeds = computed(
    () => this.state().aggs?.vacantCapacity ?? (this.totalBeds() - this.occupiedBeds()),
  );

  // ── Occupancy grid ──────────────────────────────────────────────────────────
  /**
   * Rooms grouped by their `floor` value, each a card with status + occupant label.
   * Rooms with no floor set fall into an "Unassigned" group shown last. Occupant names come
   * from the rooms payload (`room.occupants`); status is derived from bed counts.
   */
  protected readonly floorGroups = computed<FloorGroup[]>(() => {
    const groups = new Map<string, FloorGroup>();
    for (const room of this.sorted()) {
      const raw = room.floor && room.floor !== '—' ? room.floor.trim() : '';
      const key = raw || '__none__';
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          label: raw ? floorLabel(raw) : 'Unassigned',
          order: raw ? floorOrder(raw) : Number.POSITIVE_INFINITY,
          cards: [], available: 0, partial: 0, full: 0,
        };
        groups.set(key, g);
      }
      let status: RoomCardStatus;
      if (room.occupied <= 0) { status = 'available'; g.available++; }
      else if (room.occupied >= room.capacity) { status = 'full'; g.full++; }
      else { status = 'partial'; g.partial++; }
      const names = room.occupants ?? [];
      const label =
        status === 'available' ? 'Available'
          : names.length === 0 ? `${room.occupied} occupied`
            : names.slice(0, 2).map(titleCase).join(', ');
      const extra = names.length > 2 ? names.length - 2 : 0;
      const code = raw ? `${titleCase(raw)} - ${room.number}` : room.number;
      g.cards.push({ room, status, code, label, extra, bg: CARD_BG[status] });
    }
    return [...groups.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  });

  protected readonly availableRooms = computed(() => this.floorGroups().reduce((n, g) => n + g.available, 0));
  protected readonly partialRooms = computed(() => this.floorGroups().reduce((n, g) => n + g.partial, 0));
  protected readonly fullRooms = computed(() => this.floorGroups().reduce((n, g) => n + g.full, 0));
  protected readonly pctOccupied = computed(() => {
    const total = this.totalBeds();
    return total > 0 ? Math.round((this.occupiedBeds() / total) * 100) : 0;
  });
  /** Friendly room-type label (Single/Double/…) for the card subtitle. */
  protected readonly typeLabel = displayLabelFor;

  protected readonly totalPages = computed(() => {
    const total = this.state().total;
    return total > 0 ? Math.ceil(total / ROOMS_LIMIT) : null;
  });

  protected readonly hasNextPage = computed(() => {
    const pages = this.totalPages();
    if (pages !== null) return this.page() < pages;
    return (this.state().data?.length ?? 0) >= ROOMS_LIMIT;
  });

  protected readonly filteredDetail = computed<RoomRenter[] | null>(() => {
    const detail = this.expandedDetail();
    if (!detail) return detail;
    const deleted = this.deletedRenterIds();
    return deleted.size ? detail.filter((r) => !deleted.has(r.id)) : detail;
  });

  protected readonly sorted = computed<Room[]>(() => {
    const data = this.state().data ?? [];
    const col = this.sortCol();
    const dir = this.sortDir();
    if (!col) return data;
    return [...data].sort((a, b) => {
      const diff = col === 'createdAt'
        ? a.createdAt.localeCompare(b.createdAt)
        : a.occupied - b.occupied;
      return dir === 'asc' ? diff : -diff;
    });
  });

  protected setSearch(v: string): void {
    this.local.set(null);
    this.localAggs.set(null);
    this.page.set(1);
    this.searchQuery.set(v);
  }

  protected setStatusFilter(v: string): void {
    this.statusFilter.set(v);
    this.page.set(1);
    this.local.set(null);
    this.localAggs.set(null);
    void this.router.navigate([], {
      queryParams: { status: v === 'all' ? null : v },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected goToPage(n: number): void {
    this.local.set(null);
    this.localAggs.set(null);
    this.page.set(n);
  }

  protected toggleRow(r: Room): void {
    if (this.expandedId() === r.id) {
      this.expandedId.set(null);
      this.expandedDetail.set(null);
      return;
    }
    const hostelId = this.store.selected();
    if (!hostelId) return;
    this.expandedId.set(r.id);
    this.expandedDetail.set(null);
    this.detailLoading.set(true);
    this.detailError.set(false);
    this.api.roomDetail(hostelId, r.id).subscribe({
      next: (renters) => {
        this.detailLoading.set(false);
        this.expandedDetail.set(renters);
      },
      error: () => {
        this.detailLoading.set(false);
        this.detailError.set(true);
      },
    });
  }

  protected toggleSort(col: 'createdAt' | 'occupancy'): void {
    if (this.sortCol() === col) {
      this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  protected statusTone(r: Room) {
    return STATUS_TONE[this.status(r)];
  }
  protected statusLabel(r: Room): string {
    return STATUS_LABEL[this.status(r)];
  }
  private status(r: Room): RoomStatus {
    if (r.occupied <= 0) return 'available';
    return r.occupied >= r.capacity ? 'full' : 'partial';
  }

  protected openCreate(): void {
    const base = this.roomsBase();
    if (!base) return;
    void this.router.navigate([...base, 'create'], { queryParamsHandling: 'preserve' });
  }
  protected openEdit(r: Room): void {
    const base = this.roomsBase();
    if (!base) return;
    void this.router.navigate([...base, 'edit', r.id], { queryParamsHandling: 'preserve' });
  }
  protected close(): void {
    this.goToList();
  }
  protected patch(key: keyof RoomForm, value: string): void {
    this.form.update((f) => (f ? { ...f, [key]: value } : f));
  }

  protected setRoomType(v: string | string[] | null): void {
    if (typeof v !== 'string') return;
    this.patch('type', v);
    const rt = this.roomTypesState().data.find((r) => r.name === v);
    if (rt != null) this.patch('capacity', String(rt.capacity));
  }

  protected retryRoomTypes(): void {
    this.roomTypesRefresh.update((n) => n + 1);
  }

  protected toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    if (this.menuOpenId() === id) {
      this.menuOpenId.set(null);
      this.menuPos.set(null);
    } else {
      this.menuOpenId.set(id);
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.menuPos.set({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }

  protected closeMenu(): void {
    this.menuOpenId.set(null);
    this.menuPos.set(null);
  }

  protected readonly tableCols = ROOMS_TABLE_COLS;
  protected readonly roomsRowId = (row: unknown) => (row as Room).id;

  protected readonly roomsSortState = computed<SortState | null>(() => {
    const col = this.sortCol();
    return col ? { key: col, dir: this.sortDir() } : null;
  });

  protected readonly roomsPaginationConf = computed<PaginationConfig | null>(() => {
    const total = this.state().total;
    const pages = this.totalPages();
    if (!pages || pages <= 1) return null;
    return {
      page: this.page(),
      total,
      totalPages: pages,
      hasNextPage: this.hasNextPage(),
      itemLabel: 'room',
    };
  });

  protected onRoomsSort(s: SortState | null): void {
    if (!s) { this.sortCol.set(null); }
    else { this.sortCol.set(s.key as 'createdAt' | 'occupancy'); this.sortDir.set(s.dir); }
  }

  protected onRoomRowClick(row: unknown): void {
    const hostelId = this.store.selected();
    if (!hostelId) return;
    this.router.navigate(['/host', hostelId, 'rooms', (row as Room).id]);
  }

  protected onRoomAction(ev: { row: unknown; event: MouseEvent }): void {
    this.toggleMenu((ev.row as Room).id, ev.event);
  }

  protected toggleRenterMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.renterMenuId.update((cur) => (cur === id ? null : id));
  }

  protected closeRenterMenu(): void {
    this.renterMenuId.set(null);
  }

  protected editRenter(renter: RoomRenter): void {
    this.closeRenterMenu();
    const hostelId = this.store.selected();
    if (!hostelId) return;
    this.router.navigate(['/host', hostelId, 'tenants', 'edit', renter.id]);
  }

  protected deleteRenterPrompt(renter: RoomRenter): void {
    this.closeRenterMenu();
    this.renterDeletePending.set(renter);
  }

  protected confirmRenterDelete(): void {
    const renter = this.renterDeletePending();
    const hostelId = this.store.selected();
    if (!renter || !hostelId) return;
    this.deletedRenterIds.update((s) => { const n = new Set(s); n.add(renter.id); return n; });
    this.renterDeletePending.set(null);
    this.renterDeleting.set(true);
    // The backend exposes no DELETE for renters, so this always 404s; the revert + toast make the failure visible.
    this.api.deleteRenter(hostelId, renter.id).subscribe({
      next: () => { this.renterDeleting.set(false); },
      error: (err: ApiError) => {
        this.deletedRenterIds.update((s) => { const n = new Set(s); n.delete(renter.id); return n; });
        this.renterDeleting.set(false);
        this.notifyDeleteFailure(err);
      },
    });
  }

  protected cancelRenterDelete(): void {
    this.renterDeletePending.set(null);
  }

  protected cloneRoom(r: Room): void {
    this.closeMenu();
    const base = this.roomsBase();
    if (!base) return;
    void this.router.navigate([...base, 'create'], {
      queryParams: { cloneFrom: r.id },
      queryParamsHandling: 'merge',
    });
  }

  protected promptDeleteRoom(r: Room): void {
    this.closeMenu();
    this.roomDeletePending.set(r);
  }

  protected confirmDeleteRoom(): void {
    const r = this.roomDeletePending();
    if (!r) return;
    this.roomDeletePending.set(null);
    this.local.set((this.state().data ?? []).filter((x) => x.id !== r.id));
    this.localAggs.set(null);
    const hostelId = this.store.selected();
    if (!hostelId) return;
    this.api.deleteRoom(hostelId, r.id).subscribe({
      error: (err: ApiError) => {
        this.refresh.update((n) => n + 1);
        this.notifyDeleteFailure(err);
      },
    });
  }

  protected cancelRoomDelete(): void {
    this.roomDeletePending.set(null);
  }

  /** Surfaces a delete failure as a pinned toast so the reverted item isn't a silent no-op. */
  private notifyDeleteFailure(err: ApiError): void {
    const { title, message } = toToastCopy(err);
    this.notifications.show({ kind: 'error', title, message }, 0);
  }

  protected save(): void {
    const f = this.form();
    if (!f || !f.number.trim() || !f.floor.trim()) return;

    if (f.id) {
      // Edit: call API
      const hostelId = this.store.selected();
      if (!hostelId) return;
      const rtId = this.roomTypesState().data.find((rt) => rt.name === f.type)?.id;
      this.saving.set(true);
      this.saveError.set(null);
      this.api
        .updateRoom(hostelId, f.id, {
          ...(rtId != null && { room_type_id: rtId }),
          capacity: Math.max(0, Number(f.capacity) || 0),
          floor: f.floor.trim() || null,
        })
        .subscribe({
          next: (updated) => {
            this.saving.set(false);
            this.close();
            this.replaceRoom(updated);
          },
          error: () => {
            this.saving.set(false);
            this.saveError.set('Failed to update room. Please try again.');
          },
        });
      return;
    }

    // Create: call API
    const hostelId = this.store.selected();
    if (!hostelId) return;
    const rtId = this.roomTypesState().data.find((rt) => rt.name === f.type)?.id ?? '';
    this.saving.set(true);
    this.saveError.set(null);
    this.api
      .createRoom(hostelId, {
        room_number: f.number.trim(),
        room_type_id: rtId,
        capacity: Math.max(0, Number(f.capacity) || 0),
        floor: f.floor.trim() || null,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        // The created room, straight onto the grid. This used to bump `refresh`, which
        // re-read every room in the property to display the one just returned — a second
        // round trip, and a visible wait, for information already in hand.
        next: (created) => {
          this.close();
          this.insertRoom(created);
        },
        error: () => this.saveError.set('Failed to create room. Please try again.'),
      });
  }

  /**
   * Puts a newly created room on the grid without re-reading the list.
   *
   * Appended rather than sorted into place: the floor grouping re-derives from the array,
   * so the card lands under its own floor either way, and the newest room sitting last in
   * that group is what a host who just typed it expects to see.
   */
  private insertRoom(room: Room): void {
    this.local.set([...(this.state().data ?? []), room]);
    this.shiftAggs(null, room);
  }

  /**
   * Swaps an edited room for the version the server returned.
   *
   * In place, so a room does not jump to the end of its floor because its capacity changed.
   * A miss leaves the list untouched rather than appending a duplicate: the row can only be
   * absent if the list moved under the edit, and in that case the next load is the truth.
   */
  private replaceRoom(room: Room): void {
    const rows = this.state().data ?? [];
    const previous = rows.find((r) => r.id === room.id);
    if (!previous) return;
    this.local.set(rows.map((r) => (r.id === room.id ? room : r)));
    this.shiftAggs(previous, room);
  }

  /**
   * Moves the header counts by the difference one room made.
   *
   * A delta rather than a recount of what is on screen: the grid is one page and the counts
   * describe the whole property, so summing the visible rows would quietly redefine them.
   * Null aggs means the server sent none and the header is already summing rows itself.
   */
  private shiftAggs(before: Room | null, after: Room): void {
    const aggs = this.state().aggs;
    if (!aggs) { this.localAggs.set(null); return; }
    const free = (r: Room) => r.capacity - r.occupied;
    this.localAggs.set({
      totalRooms: aggs.totalRooms + (before ? 0 : 1),
      totalCapacity: aggs.totalCapacity + after.capacity - (before?.capacity ?? 0),
      occupiedCapacity: aggs.occupiedCapacity + after.occupied - (before?.occupied ?? 0),
      vacantCapacity: aggs.vacantCapacity + free(after) - (before ? free(before) : 0),
    });
  }

  protected openBulkCreate(): void {
    const base = this.roomsBase();
    if (!base) return;
    void this.router.navigate([...base, 'bulk'], { queryParamsHandling: 'preserve' });
  }

  protected closeBulk(): void {
    this.goToList();
  }

  protected patchBulk(key: Exclude<keyof BulkForm, 'rows' | 'mode'>, value: string): void {
    this.bulkForm.update((f) => (f ? { ...f, [key]: value } : f));
  }

  protected setBulkMode(mode: 'range' | 'custom' | 'manual'): void {
    this.bulkForm.update((f) => (f ? { ...f, mode } : f));
  }

  protected addManualRow(): void {
    this.bulkForm.update((f) => (f ? { ...f, rows: [...f.rows, { number: '', type: '', capacity: '' }] } : f));
  }

  protected patchManualRow(index: number, key: keyof ManualRow, value: string): void {
    this.bulkForm.update((f) => {
      if (!f) return f;
      const rows = f.rows.map((r, i) => i === index ? { ...r, [key]: value } : r);
      return { ...f, rows };
    });
  }

  protected setManualRowType(index: number, v: string | string[] | null): void {
    if (typeof v !== 'string') return;
    this.patchManualRow(index, 'type', v);
    const rt = this.roomTypesState().data.find((r) => r.name === v);
    if (rt != null) this.patchManualRow(index, 'capacity', String(rt.capacity));
  }

  protected removeManualRow(index: number): void {
    this.bulkForm.update((f) => {
      if (!f) return f;
      const rows = f.rows.filter((_, i) => i !== index);
      return { ...f, rows: rows.length ? rows : [{ number: '', type: '', capacity: '' }] };
    });
  }

  protected setBulkRoomType(v: string | string[] | null): void {
    if (typeof v !== 'string') return;
    this.patchBulk('roomType', v);
    const rt = this.roomTypesState().data.find((r) => r.name === v);
    if (rt != null) this.patchBulk('capacity', String(rt.capacity));
  }

  protected readonly bulkRoomNumbers = computed(() => {
    const f = this.bulkForm();
    if (!f) return [] as string[];
    if (f.mode === 'range') {
      const prefix = f.prefix.trim();
      const start = Math.max(1, parseInt(f.start, 10) || 1);
      const count = Math.min(50, Math.max(0, parseInt(f.count, 10) || 0));
      return Array.from({ length: count }, (_, i) => `${prefix}${start + i}`);
    }
    if (f.mode === 'manual') {
      return f.rows.map((r) => r.number.trim()).filter(Boolean).slice(0, 50);
    }
    return f.custom.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
  });

  protected readonly rangeExample = computed(() => {
    const f = this.bulkForm();
    if (!f || f.mode !== 'range') return '';
    const prefix = f.prefix.trim();
    const start = Math.max(1, parseInt(f.start, 10) || 1);
    const count = Math.min(50, Math.max(0, parseInt(f.count, 10) || 0));
    if (count === 0) return 'no rooms';
    return `${prefix}${start}, ${prefix}${start + 1}… ${prefix}${start + count - 1} (${count} rooms)`;
  });

  protected bulkCreate(): void {
    const f = this.bulkForm();
    const hostelId = this.store.selected();
    if (!f || !hostelId) return;

    let rooms: { room_number: string; room_type_id: string; capacity: number }[];
    if (f.mode === 'manual') {
      rooms = f.rows
        .filter((r) => r.number.trim())
        .map((r) => ({
          room_number: r.number.trim(),
          room_type_id: this.roomTypesState().data.find((rt) => rt.name === r.type)?.id ?? '',
          capacity: Math.max(0, parseInt(r.capacity, 10) || 0),
        }));
    } else {
      const numbers = this.bulkRoomNumbers();
      if (!numbers.length) return;
      const rtId = this.roomTypesState().data.find((rt) => rt.name === f.roomType)?.id ?? '';
      const capacity = Math.max(0, parseInt(f.capacity, 10) || 0);
      rooms = numbers.map((room_number) => ({ room_number, room_type_id: rtId, capacity }));
    }

    if (!rooms.length) return;
    this.bulkSaving.set(true);
    this.bulkError.set(null);
    this.api
      .bulkCreateRooms(hostelId, rooms)
      .pipe(finalize(() => this.bulkSaving.set(false)))
      .subscribe({
        next: (all) => {
          this.closeBulk();
          this.showAllRooms(all);
        },
        error: () => this.bulkError.set('Failed to create rooms. Please try again.'),
      });
  }

  /**
   * Replaces the grid with the full room list the bulk create returned.
   *
   * A wholesale replacement rather than the delta the single create uses, because this
   * response is the whole set — so the counts can be summed from it exactly rather than
   * nudged.
   *
   * Unless something is narrowing the view. The list the server sent is unfiltered and
   * unpaged, and dropping it onto a screen showing "Fully occupied" or a room-number search
   * would silently widen the filter without the chip changing — so in that case this falls
   * back to a re-read, which is one request to keep the screen honest.
   */
  private showAllRooms(all: Room[]): void {
    const narrowed = this.searchQuery().trim() !== '' || this.statusFilter() !== 'all';
    if (narrowed || !all.length) {
      this.refetchDelay.track('/rooms');
      this.refresh.update((n) => n + 1);
      return;
    }
    this.local.set(all);
    this.localAggs.set({
      totalRooms: all.length,
      totalCapacity: all.reduce((n, r) => n + r.capacity, 0),
      occupiedCapacity: all.reduce((n, r) => n + r.occupied, 0),
      vacantCapacity: all.reduce((n, r) => n + (r.capacity - r.occupied), 0),
    });
  }

  protected retry(): void {
    this.local.set(null);
    this.localAggs.set(null);
    this.refresh.update((n) => n + 1);
  }
}
