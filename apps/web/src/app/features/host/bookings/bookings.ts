import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import {
  Button,
  ConfirmModal,
  ContextMenu,
  DataTable,
  EmptyState,
  ErrorState,
  FilterOption,
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
import { LaneKey, laneFor } from './booking-month';
import {
  bookingFilterGroups,
  bookingFilterParams,
} from '@app/util/filter-configs/booking-filter-groups';
import { HostBooking, HostBookingPage, HostBookingsApi } from './host-bookings-api';
import { PAGE_SIZE } from '@util/pagination';
import { AssignRoomsPanel, AssignSelection } from './assign-rooms-panel';
import { BookingAction, BookingDetailsPanel, actionsFor } from './booking-details-panel';
import { NotificationService } from '@core/notification.service';
import { ALL_ROOMS_LIMIT, HostOpsApi, SubscriptionStore } from '@services';
import { RouterLink } from '@angular/router';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';
import { CurrencySymbolPipe } from '@app/shared/currency/currency-symbol.pipe';

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
    RouterLink,
    LocaleLink,
    EmptyState,
    ErrorState,
    ContextMenu,
    DataTable,
    GlobalFilter,
    Tabs,
    Skeleton,
    CurrencySymbolPipe,
    TranslocoPipe,
  ],
  templateUrl: './bookings.html',
})
export class HostBookings {
  private readonly route = inject(ActivatedRoute);
  private readonly bookingsApi = inject(HostBookingsApi);

  private readonly refresh = signal(0);
  private readonly calendar = viewChild(BookingCalendar);

  /**
   * Page and filter are declared up here, above {@link state}, and the order is load-bearing.
   *
   * `toObservable` subscribes while the class fields are initialising, so {@link query} reads
   * both of these before Angular has run a single binding. Left further down the class they
   * would still be `undefined` at that moment and the page would throw on construction.
   */
  private readonly page = signal(1);
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

  private readonly hostOps = inject(HostOpsApi);
  /** The hostel's rooms, for the "Guests in room" filter. */
  private readonly roomOptions = toSignal(
    toObservable(computed(() => this.hostelId())).pipe(
      switchMap((id) =>
        !id
          ? of([] as FilterOption[])
          : this.hostOps.rooms(id, 1, ALL_ROOMS_LIMIT).pipe(
              map((r) => r.rooms.map((room) => ({ value: room.id, label: `Room ${room.number}` }))),
              catchError(() => of([] as FilterOption[])),
            ),
      ),
    ),
    { initialValue: [] as FilterOption[] },
  );
  protected readonly filterGroups = computed(() => bookingFilterGroups(this.roomOptions()));

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
   * A plain list now the pipe does the translating.
   *
   * This was a computed that read `locale.ready()` and `locale.active()` and used neither —
   * signals touched purely to force a second evaluation once the language file arrived,
   * because the imperative `translate()` below them returned the key on the first pass and
   * logged a missing-translation warning doing it. Handing `hh-tabs` the key removes the
   * warning and the ceremony together.
   */
  protected readonly viewTabs: TabItem[] = [
    { value: 'calendar', labelKey: 'hostBookings.calendarTab' },
    { value: 'list', labelKey: 'hostBookings.listTab' },
  ];

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
    return dispositions.length > 0 || !!range.from || !!range.to || !!f['room'];
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

  /* ------------------------------------------------------- the lifecycle (Trello #80) */

  /** The booking open in the details panel. */
  protected readonly viewing = signal<HostBooking | null>(null);
  protected readonly viewError = signal('');
  /** One lifecycle request at a time; every control holds while it is out. */
  protected readonly busy = signal(false);

  protected openDetails(booking: HostBooking | null | undefined): void {
    if (!booking) return;
    this.closeMenu();
    this.viewError.set('');
    this.viewing.set(booking);
  }

  protected closeDetails(): void {
    if (this.busy()) return;
    this.viewing.set(null);
    this.viewError.set('');
  }

  /**
   * One door for every move, from the panel, the row menu and the calendar.
   *
   * Confirming goes straight out — it is the move a pending request is waiting for, and the
   * guest is the one it helps. Checking in opens the room allocation. Everything that ends a
   * stay, bills it, or needs a reason asks first.
   */
  protected onAct(e: { action: BookingAction; booking: HostBooking }): void {
    this.closeMenu();
    switch (e.action) {
      case 'confirm':
        this.send(e.booking, (id) => this.bookingsApi.confirm(this.hostelId(), id), 'Booking confirmed', 'The guest has been emailed their confirmation.');
        return;
      case 'checkIn':
        this.openAssign(e.booking);
        return;
      default:
        this.dialogReason.set('');
        this.dialogError.set('');
        // The details panel steps aside rather than stacking under the dialog: it sits a layer
        // above modals (z-[70]) so its own dropdowns can open over it, which put a dialog opened
        // from it *behind* it. It comes back when the dialog closes — see `closeDialog`.
        this.panelBehindDialog = this.viewing()?.id === e.booking.id ? this.viewing() : null;
        if (this.panelBehindDialog) this.viewing.set(null);
        this.dialog.set({ action: e.action, booking: e.booking });
    }
  }

  /** The booking whose details panel stepped aside for a dialog, to reopen afterwards. */
  private panelBehindDialog: HostBooking | null = null;

  /**
   * Sends one move and takes the server's copy of the booking back.
   *
   * The details panel, if open on it, redraws from that copy — the next moves follow from
   * where the booking now is — and the list re-reads, since the move may take the row out of
   * whatever the filter is narrowing to. A refusal is shown where the host pressed the button.
   */
  private send(
    booking: HostBooking,
    request: (id: string) => Observable<HostBooking>,
    title: string,
    message = '',
    onError: (text: string) => void = (text) => this.viewError.set(text),
    onSuccess: () => void = () => undefined,
  ): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.viewError.set('');
    request(booking.id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        if (this.viewing()?.id === updated.id) this.viewing.set(updated);
        // A panel that stepped aside for the dialog comes back showing what the move did.
        if (this.panelBehindDialog?.id === updated.id) this.viewing.set(updated);
        this.panelBehindDialog = null;
        this.dialog.set(null);
        onSuccess();
        // The reply is the updated booking: the calendar's counts and the table's row move
        // from it locally, with no second request.
        this.calendar()?.applyChange(booking, updated);
        this.listData.update((d) => d && { ...d, items: d.items.map((b) => (b.id === updated.id ? updated : b)) });
        this.notifications.success(title, message);
      },
      error: (err: { message?: string } | null) => {
        this.busy.set(false);
        onError(err?.message || 'The server did not accept that. Please try again.');
      },
    });
  }

  // ── asking first: cancel, no-show, check-out, invoice ──────────────────────────

  protected readonly dialog = signal<{ action: BookingAction; booking: HostBooking } | null>(null);
  protected readonly dialogReason = signal('');
  protected readonly dialogError = signal('');
  /** The server refuses a cancellation without one; a no-show's is kept on the record too. */
  protected readonly reasonRequired = computed(() => this.dialog()?.action === 'cancel');
  protected readonly asksReason = computed(() => {
    const a = this.dialog()?.action;
    return a === 'cancel' || a === 'noShow';
  });

  protected closeDialog(): void {
    if (this.busy()) return;
    this.dialog.set(null);
    // Backed out: the host is returned to the booking they were looking at.
    if (this.panelBehindDialog) this.viewing.set(this.panelBehindDialog);
    this.panelBehindDialog = null;
  }

  protected confirmDialog(): void {
    const d = this.dialog();
    if (!d) return;
    const reason = this.dialogReason().trim();
    if (this.reasonRequired() && !reason) {
      this.dialogError.set('Give the guest a reason — it is sent to them and kept on the booking.');
      return;
    }
    const hostelId = this.hostelId();
    const fail = (text: string) => this.dialogError.set(text);
    switch (d.action) {
      case 'cancel':
        this.send(d.booking, (id) => this.bookingsApi.cancel(hostelId, id, reason), 'Booking cancelled', 'The guest, host and manager have been told.', fail);
        return;
      case 'noShow':
        this.send(d.booking, (id) => this.bookingsApi.markNoShow(hostelId, id, reason), 'Marked as a no show', '', fail);
        return;
      case 'checkOut':
        this.send(d.booking, (id) => this.bookingsApi.checkOut(hostelId, id), 'Checked out', 'Every bed this booking held is free again.', fail);
        return;
      case 'markPaid':
        this.send(d.booking, (id) => this.bookingsApi.markPaid(hostelId, id), 'Marked as paid', 'Nothing is left due on this booking.', fail);
        return;
      case 'invoice':
        this.send(
          d.booking,
          // The invoice answers with the bill, not the booking; the booking itself is unchanged.
          (id) => this.bookingsApi.generateInvoice(hostelId, id).pipe(map(() => d.booking)),
          'Invoice generated',
          'Find it under Invoices.',
          fail,
        );
        return;
    }
  }

  // ── checking in: placing guests in rooms ───────────────────────────────────────

  protected readonly assigning = signal<HostBooking | null>(null);
  protected readonly assignError = signal('');

  protected openAssign(booking: HostBooking | null | undefined): void {
    if (!booking) return;
    this.closeMenu();
    // Hand off from the details panel rather than stacking two dialogs on each other.
    this.viewing.set(null);
    this.assignError.set('');
    this.assigning.set(booking);
  }

  protected closeAssign(): void {
    if (this.busy()) return;
    this.assigning.set(null);
    this.assignError.set('');
  }

  /** `mark_as_checked_in` with one allocation per room; capacity is the server's to refuse. */
  protected onAssign(sel: AssignSelection): void {
    const booking = this.assigning();
    if (!booking) return;
    const allocations = sel.rooms.map((r) => ({ roomId: r.roomId, guests: r.guests }));
    this.send(
      booking,
      (id) => this.bookingsApi.checkIn(this.hostelId(), id, allocations),
      'Checked in',
      sel.rooms.map((r) => `Room ${r.roomNumber} × ${r.guests}`).join(', '),
      (text) => this.assignError.set(text),
      () => this.assigning.set(null),
    );
  }

  private readonly notifications = inject(NotificationService);

  /**
   * The hostel's subscription has lapsed. This page stays open (the server keeps existing
   * bookings working), so it says what is paused and how to renew, rather than letting the
   * host find out from a refused walk-in.
   */
  private readonly subscription = inject(SubscriptionStore);
  protected readonly lapsed = computed(
    () => this.subscription.status() === 'ready' && !this.subscription.isActive(),
  );
  protected readonly subscriptionLink = computed(() => `/host/${this.hostelId()}/subscription`);

  /** The moves the row menu offers — the same set the panel does, from the same table. */
  protected rowActions(b: HostBooking): readonly BookingAction[] {
    return actionsFor(b);
  }

  protected actionLabel(action: BookingAction): string {
    return ACTION_MENU_LABEL[action];
  }

  /** The status badge the list uses, so the dialog names the stage the same way. */
  protected laneBadge(b: HostBooking): string {
    return laneFor(b.disposition.slug)?.badge ?? 'bg-ink-100 text-ink-600';
  }

  /** "101 × 2 · 102 × 1" — who is in which room now, or `''` before check-in. */
  protected activeRooms(b: HostBooking): string {
    return b.occupancies
      .filter((o) => o.active)
      .map((o) => `${o.roomNumber} × ${o.guests}`)
      .join(' · ');
  }

  protected actionIcon(action: BookingAction): string {
    return ACTION_ICON[action];
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
  protected readonly rows = computed(() => this.listData()?.items ?? []);

  /**
   * The fetched page, with this page's own actions applied on top.
   *
   * An action's reply is the updated booking, so a cancel or a confirm swaps that one row in
   * place instead of asking for the page again. Re-seeded by every real fetch.
   */
  private readonly listData = linkedSignal(() => this.state().data);

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
}

/** The row menu's wording — a verb phrase, since a menu item stands without the panel's context. */
const ACTION_MENU_LABEL: Record<BookingAction, string> = {
  confirm: 'Confirm booking',
  checkIn: 'Check in',
  checkOut: 'Check out',
  invoice: 'Generate invoice',
  cancel: 'Cancel booking',
  noShow: 'Mark no show',
  markPaid: 'Mark as paid',
};

const ACTION_ICON: Record<BookingAction, string> = {
  confirm: 'ti-circle-check',
  checkIn: 'ti-door-enter',
  checkOut: 'ti-door-exit',
  invoice: 'ti-file-invoice',
  cancel: 'ti-calendar-x',
  noShow: 'ti-user-x',
  markPaid: 'ti-cash',
};
