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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
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
import { bookingPath } from '@util/host-links';
import { LocaleLink } from '@core/i18n/locale-link';
import { HostBooking, HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { TranslocoPipe } from '@jsverse/transloco';

type RoomStatus = 'available' | 'partial' | 'full';

/** One checked-in booking with beds in this room. */
interface RoomBookingGuest {
  bookingId: string;
  ref: string;
  guestName: string;
  initials: string;
  /** Guests the booking has in this room, not across all its rooms. */
  guests: number;
  /** `yyyy-MM-dd`. */
  checkOut: string;
  link: string;
}

interface BookingGuestsState {
  loading: boolean;
  error: boolean;
  guests: RoomBookingGuest[];
}

const NO_BOOKING_GUESTS: BookingGuestsState = { loading: false, error: false, guests: [] };

/** Enough for any one room: a booking only appears here while it holds beds in it. */
const BOOKING_GUESTS_LIMIT = 100;

/** The booking as this room sees it, or null when it holds no active beds here. */
function toRoomBookingGuest(booking: HostBooking, roomId: string, hostelId: string): RoomBookingGuest | null {
  const guests = booking.occupancies
    .filter((o) => o.active && o.roomId === roomId)
    .reduce((n, o) => n + o.guests, 0);
  if (guests <= 0) return null;
  const name = booking.guest.name.trim();
  return {
    bookingId: booking.id,
    ref: booking.ref,
    guestName: name || '—',
    initials: name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?',
    guests,
    checkOut: booking.checkOut,
    link: bookingPath(hostelId, booking.id),
  };
}

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
  imports: [ApiDate, DecimalPipe, TitleCasePipe, RouterLink, LocaleLink, DashboardLayout, Avatar, Button, EmptyState, ErrorState, Skeleton, StatusPill, Tabs, RoomCalendar, TranslocoPipe],
  templateUrl: './room-detail.html',
})
export class RoomDetail {
  private readonly api    = inject(HostOpsApi);
  private readonly bookingsApi = inject(HostBookingsApi);
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

  /**
   * The hostel's time zone for the calendar's "today": `undefined` while it is being read,
   * `null` when there is none (the calendar then uses the device's date).
   *
   * The calendar waits for it rather than drawing first and correcting: a device a day behind
   * the hostel would show the today cell, the roster's day and the free beds jump a day once
   * the zone landed. A month-billed hostel has no calendar, so it is not asked.
   */
  protected readonly timeZone = toSignal(
    toObservable(
      computed(() => ({ hostelId: this.store.selected(), skip: this.monthlyBilling() }), {
        equal: (a, b) => a.hostelId === b.hostelId && a.skip === b.skip,
      }),
    ).pipe(
      switchMap(({ hostelId, skip }) =>
        !hostelId || skip
          ? of(null)
          : this.store.timeZoneOf(hostelId).pipe(startWith<string | null | undefined>(undefined)),
      ),
    ),
    { initialValue: undefined },
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

  private readonly bookingGuestsKey = computed(
    () => ({ hostelId: this.store.selected(), roomId: this.roomId(), skip: this.monthlyBilling() }),
    { equal: (a, b) => a.hostelId === b.hostelId && a.roomId === b.roomId && a.skip === b.skip },
  );

  /**
   * Checked-in bookings with beds in this room, read from the bookings index's active
   * occupancies. Its own stream, so a failure here leaves the renters on screen.
   *
   * The server filter is kept in step with a client check: the index can lag a release, and
   * a booking whose occupancy here has just gone inactive must not still count a bed.
   * Month-billed hostels take no bookings, so they are not asked.
   */
  protected readonly bookingGuests = toSignal(
    toObservable(this.bookingGuestsKey).pipe(
      switchMap(({ hostelId, roomId, skip }) => {
        if (!hostelId || !roomId || skip) return of(NO_BOOKING_GUESTS);
        return this.bookingsApi
          // The failure is written in the card itself, so the global toast stays quiet.
          .list(hostelId, 1, BOOKING_GUESTS_LIMIT, { 'f[occupied_room_ids]': roomId }, { suppressErrorToast: true })
          .pipe(
            map((page): BookingGuestsState => ({
              loading: false,
              error: false,
              guests: page.items
                .map((b) => toRoomBookingGuest(b, roomId, hostelId))
                .filter((g): g is RoomBookingGuest => g !== null),
            })),
            startWith<BookingGuestsState>({ loading: true, error: false, guests: [] }),
            catchError(() => of<BookingGuestsState>({ loading: false, error: true, guests: [] })),
          );
      }),
    ),
    { initialValue: { loading: true, error: false, guests: [] } as BookingGuestsState },
  );

  /**
   * Beds taken in this room: active tenants plus booking guests checked into it.
   *
   * `room.occupied` is active renters only, so on its own it called a room full of guests
   * empty. Every occupancy figure on the page reads this one number so they cannot disagree.
   */
  protected readonly occupied = computed(
    () => this.activeRenters().length + this.bookingGuests().guests.reduce((n, g) => n + g.guests, 0),
  );

  /**
   * False while the booking guests are loading or failed to load: the bed count is then a lower
   * bound, and a room holding only guests would read "Available". Month-billed hostels ask
   * nothing, so theirs is known at once.
   */
  protected readonly guestCountKnown = computed(() => {
    const g = this.bookingGuests();
    return !g.loading && !g.error;
  });

  protected readonly roomStatus = computed<RoomStatus>(() => {
    const r = this.state().room;
    const occupied = this.occupied();
    if (!r || occupied <= 0) return 'available';
    return occupied >= r.capacity ? 'full' : 'partial';
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
