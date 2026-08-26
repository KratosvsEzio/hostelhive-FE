import { DecimalPipe, TitleCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LocaleStore } from '@core/i18n/locale-store';

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
  private readonly i18n = inject(TranslocoService);
  private readonly locale = inject(LocaleStore);

  /**
   * Which half of the room is on screen. Calendar first: the page is reached from the
   * rooms list, where the number, type and occupancy are already shown — what is not
   * shown anywhere else is what this room is sold for, and when.
   */
  protected readonly view = signal<'calendar' | 'details'>('calendar');

  /**
   * Rebuilt on both signals for the same reason the SEO headings are: `ready` flips once
   * when the strings arrive, so a computed cannot cache a raw key from the render before
   * they did, and `active` moves on every switch after that.
   */
  protected readonly tabs = computed<TabItem[]>(() => {
    this.locale.ready();
    this.locale.active();
    return [
      { value: 'calendar', label: this.i18n.translate<string>('hostRooms.calendarTab') },
      { value: 'details', label: this.i18n.translate<string>('hostRooms.detailsTab') },
    ];
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

  protected readonly label = computed(() => {
    const r = this.state().room;
    return r ? `Room ${r.number}` : 'Room details';
  });

  protected goBack(): void {
    this.router.navigate(['/host', this.store.selected(), 'rooms']);
  }

  protected goToTenant(tenantId: string): void {
    this.router.navigate(['/host', this.store.selected(), 'tenants', 'profile', tenantId]);
  }

  protected renterTone(status: string): 'ok' | 'neutral' {
    return status === 'active' ? 'ok' : 'neutral';
  }

  protected renterLabel(status: string): string {
    return status === 'active' ? 'Active' : 'Checked out';
  }
}
