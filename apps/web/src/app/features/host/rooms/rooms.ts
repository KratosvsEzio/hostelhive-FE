import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationStart, Router } from '@angular/router';
import { catchError, filter, finalize, map, of, startWith, switchMap } from 'rxjs';
import {
  Button,
  Card,
  ConfirmModal,
  ContextMenu,
  ContextMenuDivider,
  DataTable,
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
import { toToastCopy } from '@core/errors/api-error-message';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { SubscriptionGate } from '@layout/components/subscription-gate/subscription-gate';
import { isSubscriptionError } from '@util/subscription-error';
import { isNetworkError } from '@util/network-error';
import { displayLabelFor } from '@util/room-types';
import { PAGE_SIZE } from '@util/pagination';
import { ROOMS_TABLE_COLS } from '@app/util/table-configs/rooms-table-cols';

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


@Component({
  selector: 'hh-rooms',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    SubscriptionGate,
    Card,
    Button,
    ConfirmModal,
    DataTable,
    Dropdown,
    FilterChips,
    Input,
    ContextMenu,
    ContextMenuDivider,
    Search,
    Skeleton,
    EmptyState,
    ErrorState,
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
  private readonly refresh = signal(0);

  /** Locally-mutated copy so create/edit reflect immediately (no write API yet). */
  private readonly local = signal<Room[] | null>(null);

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
    this.router.events.pipe(
      filter(e => e instanceof NavigationStart),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      this.form.set(null);
      this.bulkForm.set(null);
    });

    effect(() => {
      const s = this.fetched().statuses;
      if (s?.length) this.statuses.set(s);
    }, { allowSignalWrites: true });

    effect(() => {
      const state = this.roomTypesState();
      if (state.loading || state.error || !state.data.length) return;
      const first = state.data[0];

      const f = this.form();
      if (f && !f.id && !f.type) {
        this.form.set({ ...f, type: first.name, capacity: String(first.capacity) });
      }

      const bf = this.bulkForm();
      if (bf && !bf.roomType) {
        this.bulkForm.set({ ...bf, roomType: first.name, capacity: String(first.capacity) });
      }
    }, { allowSignalWrites: true });
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
        return this.api.rooms(hostelId, page, PAGE_SIZE, filters).pipe(
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
    return overlay && !base.loading && !base.error
      ? { ...base, data: overlay }
      : base;
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

  protected readonly totalPages = computed(() => {
    const total = this.state().total;
    return total > 0 ? Math.ceil(total / PAGE_SIZE) : null;
  });

  protected readonly hasNextPage = computed(() => {
    const pages = this.totalPages();
    if (pages !== null) return this.page() < pages;
    return (this.state().data?.length ?? 0) >= PAGE_SIZE;
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
    this.page.set(1);
    this.searchQuery.set(v);
  }

  protected setStatusFilter(v: string): void {
    this.statusFilter.set(v);
    this.page.set(1);
    this.local.set(null);
    void this.router.navigate([], {
      queryParams: { status: v === 'all' ? null : v },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected goToPage(n: number): void {
    this.local.set(null);
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
    const first = this.roomTypesState().data[0];
    this.form.set({
      id: null,
      number: '',
      type: first?.name ?? '',
      capacity: first ? String(first.capacity) : '',
    });
  }
  protected openEdit(r: Room): void {
    this.form.set({
      id: r.id,
      number: r.number,
      type: r.type,
      capacity: String(r.capacity),
    });
  }
  protected close(): void {
    this.form.set(null);
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
    this.form.set({
      id: null,
      number: `${r.number} (copy)`,
      type: r.type,
      capacity: String(r.capacity),
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
    if (!f || !f.number.trim()) return;

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
        })
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => {
            this.close();
            this.refresh.update((n) => n + 1);
          },
          error: () => this.saveError.set('Failed to update room. Please try again.'),
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
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.close();
          this.refresh.update((n) => n + 1);
        },
        error: () => this.saveError.set('Failed to create room. Please try again.'),
      });
  }

  protected openBulkCreate(): void {
    const first = this.roomTypesState().data[0];
    this.bulkForm.set({ mode: 'range', prefix: '', start: '101', count: '10', custom: '', rows: [{ number: '', type: first?.name ?? '', capacity: first ? String(first.capacity) : '' }], roomType: first?.name ?? '', capacity: first ? String(first.capacity) : '' });
    this.bulkError.set(null);
  }

  protected closeBulk(): void {
    this.bulkForm.set(null);
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
        next: () => { this.closeBulk(); this.refresh.update((n) => n + 1); },
        error: () => this.bulkError.set('Failed to create rooms. Please try again.'),
      });
  }

  protected retry(): void {
    this.local.set(null);
    this.refresh.update((n) => n + 1);
  }
}
