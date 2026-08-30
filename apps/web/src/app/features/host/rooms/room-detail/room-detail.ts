import { DecimalPipe, TitleCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusPill,
  TabItem,
  Tabs,
} from '@hostelhive/ui';
import { HostOpsApi, HostPropertyStore, RoomRenter, RoomShowData } from '@services';
import { HostRoom as Room } from '@hostelhive/data-access';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';
import { ApiDate } from '@util/api-date';
import { RoomCalendar } from '../room-calendar/room-calendar';
import { tenantStatusLabel, tenantStatusTone } from '@util/tenant-status';
import { TranslocoPipe } from '@jsverse/transloco';

type RoomStatus = 'available' | 'partial' | 'full';

interface DetailState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  room: Room | null;
  renters: RoomRenter[];
}

const LOADING: DetailState = { loading: true, error: false, networkError: false, room: null, renters: [] };

@Component({
  selector: 'hh-room-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ApiDate, DecimalPipe, TitleCasePipe, DashboardLayout, Avatar, Button, EmptyState, ErrorState, Skeleton, StatusPill, Tabs, RoomCalendar, TranslocoPipe],
  templateUrl: './room-detail.html',
})
export class RoomDetail {
  private readonly api    = inject(HostOpsApi);
  private readonly store  = inject(HostPropertyStore);
  private readonly route  = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /**
   * A month-billed hostel has no night-by-night calendar to draw.
   *
   * The calendar answers "which beds are sold on which nights", which is a question only a
   * per-night hostel asks \x2D\x2D the same rule that gates online booking. Showing it to a
   * monthly hostel offered a tab whose every cell was a guess.
   *
   * Empty reads as unknown and keeps the tab: hiding a page's main view because a field did
   * not arrive is a worse failure than showing one that does not apply.
   */
  protected readonly monthlyBilling = computed(() => this.store.isMonthlyBilled());

  /**
   * Which half of the room is on screen. Calendar first: the page is reached from the
   * rooms list, where the number, type and occupancy are already shown — what is not
   * shown anywhere else is what this room is sold for, and when.
   */
  protected readonly view = signal<'calendar' | 'details'>('calendar');

  /**
   * Still a computed, but only because the list itself changes: a hostel billed monthly
   * has no calendar to show. The language no longer enters into it — `hh-tabs` resolves
   * the key through the pipe, so the `ready`/`active` reads that used to force a second
   * pass after the strings loaded are gone, and with them the missing-translation warning
   * the first pass logged.
   */
  protected readonly tabs = computed<TabItem[]>(() => {
    const details = { value: 'details', labelKey: 'hostRooms.detailsTab' };
    if (this.monthlyBilling()) return [details];
    return [{ value: 'calendar', labelKey: 'hostRooms.calendarTab' }, details];
  });

  /**
   * Keeps the view on a tab that exists.
   *
   * `view` starts on the calendar and the hostel arrives afterwards, so without this a
   * monthly hostel lands on a tab that has just been removed from the strip \x2D\x2D the calendar
   * still rendered, with nothing selected above it.
   */
  private readonly forceDetails = effect(() => {
    if (this.monthlyBilling() && this.view() === 'calendar') this.view.set('details');
  });


  /** Both ids the booking calendar needs, read from the same sources the page already uses. */
  protected readonly hostelId = this.store.selected;
  protected readonly roomId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('roomId') ?? '')),
    { initialValue: '' },
  );

  protected readonly state = toSignal(
    toObservable(this.store.selected).pipe(
      switchMap((hostelId) =>
        this.route.paramMap.pipe(map((p) => ({ hostelId, roomId: p.get('roomId') ?? '' }))),
      ),
      switchMap(({ hostelId, roomId }) =>
        hostelId && roomId
          ? this.api.roomShow(hostelId, roomId).pipe(
              map((d: RoomShowData): DetailState => ({
                loading: false, error: false, networkError: false,
                room: d.room, renters: d.renters,
              })),
              catchError((err) => of<DetailState>({
                loading: false, error: true, networkError: isNetworkError(err),
                room: null, renters: [],
              })),
            )
          : of<DetailState>({ loading: false, error: true, networkError: false, room: null, renters: [] }),
      ),
    ),
    { initialValue: LOADING },
  );

  /**
   * Tenants actually in a bed, and those only on the record.
   *
   * The header and this card disagreed: the header counts what `roomShow` puts on
   * `room.occupied` — active renters — while the card counted every row the endpoint
   * returned. A room whose four tenants had all gone inactive read "Occupied 0 / 4" beside
   * "4 of 4 beds occupied", on the same screen, about the same four people.
   *
   * Active is the number that means anything: a bed with a former tenant's record against it
   * is a bed a host can sell. The past ones stay listed — this is the only place their stay
   * in *this* room is visible — but they are counted separately rather than as occupancy.
   */
  protected readonly activeRenters = computed(() =>
    this.state().renters.filter((r) => r.status === 'active'),
  );

  protected readonly pastRenters = computed(() =>
    this.state().renters.filter((r) => r.status !== 'active'),
  );

  protected readonly roomStatus = computed<RoomStatus>(() => {
    const r = this.state().room;
    if (!r || r.occupied <= 0) return 'available';
    return r.occupied >= r.capacity ? 'full' : 'partial';
  });

  protected readonly statusTone = computed(() => {
    const s = this.roomStatus();
    return s === 'available' ? 'ok' : s === 'partial' ? 'warn' : 'neutral';
  });

  protected readonly statusLabel = computed(() => {
    const s = this.roomStatus();
    return s === 'available' ? 'Available' : s === 'partial' ? 'Partial' : 'Full';
  });

  /** Where the chevron and the parent crumb both point. */
  protected readonly roomsUrl = computed(() => `/host/${this.store.selected()}/rooms`);

  protected readonly label = computed(() => {
    const r = this.state().room;
    return r ? `Room ${r.number}` : 'Room details';
  });

  protected goToTenant(tenantId: string): void {
    this.router.navigate(['/host', this.store.selected(), 'tenants', 'profile', tenantId]);
  }

  // Both from the console's one status table. These were a local two-way guess — `active`
  // or "Checked out" — which labelled an Inactive tenant, and one on notice, as gone.
  protected readonly renterTone = tenantStatusTone;
  protected readonly renterLabel = tenantStatusLabel;
}
