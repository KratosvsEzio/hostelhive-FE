import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import {
  Button,
  ConfirmModal,
  ContextMenu,
  DataTable,
  EmptyState,
  ErrorState,
  FilterValues,
  GlobalFilter,
  PaginationConfig,
  TabItem,
  Tabs,
  Skeleton,
} from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { BookingFormDrawer } from './booking-form-drawer/booking-form-drawer';
import { HOST_BOOKINGS_TABLE_COLS } from '@util/table-configs/host-bookings-table-cols';
import { BookingCalendar } from './booking-calendar';
import { LaneKey } from './booking-month';
import {
  bookingFilterGroups,
  bookingFilterParams,
} from '@app/util/filter-configs/booking-filter-groups';
import { HostBooking, HostBookingPage, HostBookingsApi } from './host-bookings-api';
import { PAGE_SIZE } from '@util/pagination';
import { AssignRoomsPanel, AssignSelection } from './assign-rooms-panel';
import { BookingDetailsPanel } from './booking-details-panel';
import { BookingApi } from '@features/public/listing/booking/booking-api';
import { ApiHostCancellationQuote } from '@features/public/listing/booking/booking-api.contract';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LocaleStore } from '@core/i18n/locale-store';

interface ViewState {
  loading: boolean;
  error: boolean;
  data: HostBookingPage | null;
}

/** Before a hostel is known there is nothing to wait for — not the same as loading. */
const IDLE: ViewState = { loading: false, error: false, data: null };
const LOADING: ViewState = { loading: true, error: false, data: null };

/**
 * Every booking across the property, which the room calendar cannot answer.
 *
 * The calendar shows one room. A host with fourteen of them needs "who is arriving this week",
 * and somewhere to cancel from that is not hunting through room calendars one at a time.
 *
 * A row is a **booking**, not a room: a booking can hold several rooms and several beds, and
 * splitting it across rows would read as several separate guests — and make the cancel action
 * ambiguous, since cancelling applies to the whole booking.
 */
@Component({
  selector: 'hh-host-bookings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    Button,
    ConfirmModal,
    BookingCalendar,
    AssignRoomsPanel,
    BookingDetailsPanel,
    BookingFormDrawer,
    DashboardLayout,
    EmptyState,
    ErrorState,
    ContextMenu,
    DataTable,
    GlobalFilter,
    Tabs,
    Skeleton,
    TranslocoPipe,
  ],
  templateUrl: './bookings.html',
})
export class HostBookings {
  private readonly api = inject(BookingApi);
  private readonly i18n = inject(TranslocoService);
  private readonly locale = inject(LocaleStore);
  private readonly route = inject(ActivatedRoute);
  private readonly bookingsApi = inject(HostBookingsApi);

  private readonly refresh = signal(0);

  /**
   * Page and filter are declared up here, above {@link state}, and the order is load-bearing.
   *
   * `toObservable` subscribes while the class fields are initialising, so {@link query} reads
   * both of these before Angular has run a single binding. Left further down the class they
   * would still be `undefined` at that moment and the page would throw on construction.
   */
  private readonly page = signal(1);
  protected readonly filterGroups = bookingFilterGroups();
  protected readonly filters = signal<FilterValues>({});

  /**
   * `:hostelId` lives on the parent route, since this page is a child of the host shell.
   * Falls back to the current route rather than asserting a parent exists — the assertion
   * would be the only thing between a route refactor and a crash on load.
   */
  private readonly hostelId = toSignal(
    (this.route.parent ?? this.route).paramMap.pipe(map((p) => p.get('hostelId') ?? '')),
    { initialValue: '' },
  );

  /**
   * One request per hostel, page and filter — the server does the narrowing now.
   *
   * `hostelId` is part of the query rather than read inside the `switchMap`: it used to be
   * the latter, which meant a hostel change alone never re-ran the request, and the page
   * kept showing the property it first loaded with.
   */
  private readonly query = computed(() => ({
    hostelId: this.hostelId(),
    page: this.page(),
    filters: bookingFilterParams(this.filters()),
    tick: this.refresh(),
  }));

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      switchMap(({ hostelId, page, filters }) =>
        !hostelId
          ? of(IDLE)
          : this.bookingsApi.list(hostelId, page, PAGE_SIZE, filters).pipe(
              map((data): ViewState => ({ loading: false, error: false, data })),
              startWith(LOADING),
              catchError(() => of<ViewState>({ loading: false, error: true, data: null })),
            ),
      ),
    ),
    { initialValue: LOADING },
  );

  /**
   * Which half of the page is on screen.
   *
   * The month and the list answer different questions — "what does August look like and
   * what needs me today" against "show me the bookings" — and stacking them meant the
   * table started below the fold on every visit. Calendar leads because the day ledger is
   * the part with something to act on.
   */
  protected readonly view = signal<'calendar' | 'list'>('calendar');

  /**
   * Rebuilt on both signals for the same reason the room detail tabs are: `ready` flips
   * once when the strings arrive, so a computed cannot cache a raw key from the render
   * before they did, and `active` moves on every switch after that.
   */
  protected readonly viewTabs = computed<TabItem[]>(() => {
    this.locale.ready();
    this.locale.active();
    return [
      { value: 'calendar', label: this.i18n.translate<string>('hostBookings.calendarTab') },
      { value: 'list', label: this.i18n.translate<string>('hostBookings.listTab') },
    ];
  });

  /**
   * Whether anything is narrowing the table.
   *
   * Only the empty state needs it, and only to tell two silences apart: a property with no
   * bookings in it yet, and a filter that happens to match none of the ones there are.
   */
  protected readonly filtered = computed(() => {
    const f = this.filters();
    const dispositions = Array.isArray(f['disposition']) ? (f['disposition'] as string[]) : [];
    const range = (f['checkIn'] ?? {}) as { from?: string; to?: string };
    return dispositions.length > 0 || !!range.from || !!range.to;
  });

  protected onFiltersApply(values: FilterValues): void {
    this.applyFilters(values);
  }

  /**
   * Every route to a new filter goes through here, because every one of them has to reset
   * the page. Page 5 of the old filter almost certainly does not exist under the new one,
   * and asking for it returns an empty page — which on screen is indistinguishable from
   * the filter having matched nothing at all.
   */
  private applyFilters(values: FilterValues): void {
    this.filters.set(values);
    this.page.set(1);
  }

  protected setPage(page: number): void {
    this.page.set(page);
  }

  /* ------------------------------------------------------- assigning a room */

  protected readonly assigning = signal<HostBooking | null>(null);
  protected readonly assignError = signal('');

  /** The request behind a pending allotment, read before deciding what to do with it. */
  protected readonly viewing = signal<HostBooking | null>(null);
  protected readonly viewError = signal('');

  protected openDetails(booking: HostBooking | null | undefined): void {
    if (!booking) return;
    this.closeMenu();
    this.viewError.set('');
    this.viewing.set(booking);
  }

  protected closeDetails(): void {
    this.viewing.set(null);
    this.viewError.set('');
  }

  /**
   * Declining releases the room and refunds the deposit — a real, irreversible thing.
   *
   * Which is exactly why it is not wired to a guessed URL. There is no decline route on the
   * API, and inventing one on a path that moves money is the last place to be optimistic.
   */
  protected onDecline(): void {
    this.viewError.set(
      'Declining needs its endpoint — nothing was sent, and no deposit has been touched.',
    );
  }

  /** Opened from the calendar's pending card and from the row menu — one panel, three doors. */
  protected openAssign(booking: HostBooking | null | undefined): void {
    if (!booking) return;
    this.closeMenu();
    // Hand off from the request panel rather than stacking two dialogs on each other.
    this.viewing.set(null);
    this.assignError.set('');
    this.assigning.set(booking);
  }

  protected closeAssign(): void {
    this.assigning.set(null);
    this.assignError.set('');
  }

  /**
   * The host has settled on where the booking goes; nothing sends it yet.
   *
   * There is no assignment endpoint — a booking carries `room_id: null` and no route sets it —
   * so this stops here rather than guessing a URL, which would either 404 or, worse, hit an
   * unverified write path. The panel keeps the selection on screen so the work is not lost
   * when the endpoint lands.
   */
  protected onAssign(sel: AssignSelection): void {
    const where = sel.rooms.map((r) => `${r.roomNumber} × ${r.beds}`).join(', ');
    this.assignError.set(
      `Ready to assign ${where} — but this build has no assignment endpoint to send it to.`,
    );
  }

  /**
   * A lane in the calendar's day ledger narrows the list to exactly what that number counted.
   *
   * It can be exact now the chips are gone. The five numbers in the ledger are the day's
   * arrivals split by disposition — the aggregation's `by_status` sums to that same day's
   * `checkins` on every day it returns — so the lane and the date together name a set the
   * filter can express precisely: this disposition, arriving on this date. Mapped onto three
   * chips it could only ever get the host to the right neighbourhood.
   *
   * It also crosses to the list, which is behind the other tab: filtering a table the host
   * cannot see would read as the number having done nothing at all.
   */
  protected onLaneSelect(e: { date: string; lane: LaneKey }): void {
    this.applyFilters({ disposition: [e.lane], checkIn: { from: e.date, to: e.date } });
    this.view.set('list');
  }

  /* ------------------------------------------------------------- create a booking */

  protected readonly formOpen = signal(false);

  /** The drawer needs a non-null id; the button is hidden until the route supplies one. */
  protected readonly hostelIdForForm = computed(() => this.hostelId());

  protected openForm(): void {
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
  }

  /**
   * Closes and re-reads the list.
   *
   * Re-reads rather than pushing the new booking into the local array: the server decides a
   * booking's disposition, and a hand-maintained copy would have to guess it — then guess
   * wrong for whatever the filter is narrowing to.
   */
  protected onSaved(): void {
    this.formOpen.set(false);
    this.refresh.update((n) => n + 1);
  }

  /* ------------------------------------------------------------------- the table */

  protected readonly tableCols = HOST_BOOKINGS_TABLE_COLS;
  protected readonly bookingRowId = (row: unknown) => (row as HostBooking).id;

  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly menuPos = signal<{ top: number; right: number } | null>(null);

  /** Keeps the row's trigger looking pressed while its menu is open. */
  protected readonly menuActionActive = (row: unknown): boolean =>
    this.menuOpenId() === (row as HostBooking).id;

  protected openMenu(b: HostBooking, event: MouseEvent): void {
    event.stopPropagation();
    if (this.menuOpenId() === b.id) {
      this.menuOpenId.set(null);
      return;
    }
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuPos.set({ top: r.bottom + 4, right: window.innerWidth - r.right });
    this.menuOpenId.set(b.id);
  }

  protected closeMenu(): void {
    this.menuOpenId.set(null);
  }

  /**
   * The page the server returned, in the order it returned it.
   *
   * Everything this used to do — filter by disposition, clip to an arrival range, sort by
   * check-in — now travels as query params instead. Not because the array work was slow,
   * but because it was answering with only the rows that happened to be in hand: one page
   * of ten, presented as though it were the property’s whole book.
   */
  protected readonly rows = computed(() => this.state().data?.items ?? []);

  /**
   * Null below two pages, which is what hides the pager: a control whose every button is
   * disabled is worse than no control, and it would sit under most filtered lists.
   */
  protected readonly paginationConf = computed<PaginationConfig | null>(() => {
    const data = this.state().data;
    const totalPages = data?.totalPages ?? 1;
    if (totalPages <= 1) return null;
    const page = this.page();
    return {
      page,
      total: data?.total ?? 0,
      totalPages,
      hasNextPage: page < totalPages,
      itemLabel: 'booking',
    };
  });

  // ── cancelling ─────────────────────────────────────────────────────────────

  protected readonly cancelling = signal<HostBooking | null>(null);
  protected readonly quote = signal<ApiHostCancellationQuote | null>(null);
  protected readonly quoteLoading = signal(false);
  protected readonly cancelError = signal('');
  protected readonly cancelOpen = computed(() => this.cancelling() !== null);

  /**
   * Asks the server what cancelling costs before showing the dialogue.
   *
   * Never derived here: a host looking at a stale page would be quoted one figure and charged
   * another, and this is the screen where that is least forgivable.
   */
  protected askToCancel(booking: HostBooking): void {
    this.cancelling.set(booking);
    this.quote.set(null);
    this.cancelError.set('');
    this.quoteLoading.set(true);
    this.api.hostCancellationQuote(booking.id).subscribe({
      next: (q) => {
        this.quote.set(q);
        this.quoteLoading.set(false);
      },
      error: () => {
        this.cancelError.set('We could not work out the penalty. Please try again.');
        this.quoteLoading.set(false);
      },
    });
  }

  protected closeCancel(): void {
    this.cancelling.set(null);
    this.quote.set(null);
  }

  protected confirmCancel(): void {
    const booking = this.cancelling();
    if (!booking) return;
    this.api.hostCancel(booking.id).subscribe({
      next: () => {
        this.closeCancel();
        this.refresh.update((n) => n + 1);
      },
      error: () => this.cancelError.set('We could not cancel this booking. Please try again.'),
    });
  }
}
