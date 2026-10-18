import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  Observable,
  catchError,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { Invoice } from '@hostelhive/data-access';
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
import { INVOICEABLE_LANES, LaneKey, PAYABLE_LANES, laneFor, laneKeyFor } from './booking-month';
import {
  bookingFilterGroups,
  bookingFilterParams,
} from '@app/util/filter-configs/booking-filter-groups';
import {
  HostBooking,
  HostBookingPage,
  HostBookingRequestOptions,
  HostBookingsApi,
} from './host-bookings-api';
import { PAGE_SIZE } from '@util/pagination';
import { AssignRoomsPanel, AssignSelection } from './assign-rooms-panel';
import {
  BookingAction,
  BookingDetailsPanel,
  InvoiceLookup,
  actionsFor,
} from './booking-details-panel';
import { NotificationService } from '@core/notification.service';
import { RefetchDelay } from '@core/refetch-delay';
import { errorStatus } from '@core/errors/api-error-text';
import { ALL_ROOMS_LIMIT, HostOpsApi } from '@services';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CurrencySymbolPipe } from '@app/shared/currency/currency-symbol.pipe';
import { MoneyPipe } from '@app/shared/currency/money.pipe';
import { currencySymbol } from '@util/currencies';
import { bookingPath, invoicePath } from '@util/host-links';
import { buildInvoiceId } from '@util/table-configs/invoice-table-cols';
import { bookingRefusal } from '@util/booking-refusal';
import {
  MovedOnKind,
  bookingMoveFailureKey,
  crossPayInvoiceFailureKey,
  movedOnKind,
  refusalBorneOut,
  stageChanged,
} from './booking-move-failure';

interface ViewState {
  loading: boolean;
  error: boolean;
  data: HostBookingPage | null;
}

/** Before a hostel is known there is nothing to wait for — not the same as loading. */
const IDLE: ViewState = { loading: false, error: false, data: null };
const LOADING: ViewState = { loading: true, error: false, data: null };

/** Where a stay move's refusal is shown: the room allocation, its dialog, or the details panel's footer. */
type MoveSurface = 'assign' | 'dialog' | 'panel';

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
  /** A translation key, or `''` while there is nothing to report. */
  protected readonly viewError = signal('');
  /** One lifecycle request at a time; every control holds while it is out. */
  protected readonly busy = signal(false);

  private readonly router = inject(Router);
  private readonly i18n = inject(TranslocoService);
  private readonly refetchDelay = inject(RefetchDelay);
  private readonly money = new MoneyPipe();

  /** The booking `bookings/:bookingId` names, or null on the list's own URL. */
  private urlBookingId: string | null = null;

  constructor() {
    // The page's invoices, asked for once per fetched page; local swaps re-use what is known.
    effect(() => {
      const items = this.state().data?.items ?? [];
      const ids = items.filter(isInvoiceable).map((b) => b.id);
      untracked(() => this.lookupInvoices(ids));
    });
    // A booking opened from the calendar may not be on the list's page, so it asks for its own.
    effect(() => {
      const b = this.viewing();
      if (b) untracked(() => this.ensureInvoice(b));
    });
    this.route.paramMap
      .pipe(
        map((p) => p.get('bookingId')),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((id) => this.followUrl(id));
  }

  protected openDetails(booking: HostBooking | null | undefined): void {
    if (!booking) return;
    this.showDetails(booking);
    this.reread(booking);
    if (this.urlBookingId !== booking.id) {
      void this.router.navigateByUrl(bookingPath(this.hostelId(), booking.id));
    }
  }

  protected closeDetails(): void {
    if (this.busy()) return;
    this.viewing.set(null);
    this.viewError.set('');
    this.leaveBookingUrl();
  }

  private showDetails(booking: HostBooking): void {
    this.closeMenu();
    this.viewError.set('');
    this.viewing.set(booking);
    this.epoch++;
  }

  /**
   * Bumped by every open and by every move as it starts and as it lands.
   *
   * A re-read answering under a later epoch is dropped: the panel has moved on, or a move's reply
   * — the newer server copy — has landed or is about to.
   */
  private epoch = 0;

  /**
   * Swaps the database's copy of an opened booking in over the one shown.
   *
   * The list and the calendar answer from a search index that can lag the database by minutes, so
   * a booking opened from either may still show a stage it has left — confirmed, with Check in on
   * offer, for a guest already in their room. `get` reads the database. It is quiet, and a failure
   * keeps the copy already shown: that copy is still the best the page has.
   */
  private reread(shown: HostBooking): void {
    const epoch = this.epoch;
    this.bookingsApi.get(this.hostelId(), shown.id, { suppressErrorToast: true }).subscribe({
      next: (fresh) => {
        const open = this.viewing() ?? this.panelBehindDialog;
        if (this.epoch !== epoch || open?.id !== fresh.id) return;
        if (this.panelBehindDialog?.id === fresh.id) this.panelBehindDialog = fresh;
        this.calendar()?.applyChange(shown, fresh);
        this.replaceBooking(fresh);
      },
      error: () => undefined,
    });
  }

  /**
   * Opens what the URL names: from the loaded page when it is there, else read on its own.
   *
   * Nothing to do when the booking is already in front of the host, or has only stepped aside
   * for a dialog or the room allocation — those return to it themselves.
   */
  private followUrl(id: string | null): void {
    this.urlBookingId = id;
    if (!id) {
      // Back from a booking's URL: the panel goes with it.
      if (this.viewing() && !this.busy()) {
        this.viewing.set(null);
        this.viewError.set('');
      }
      return;
    }
    if (this.viewing()?.id === id || this.dialog()?.booking.id === id || this.assigning()?.id === id) {
      return;
    }
    const row = this.rows().find((b) => b.id === id);
    if (row) {
      this.showDetails(row);
      this.reread(row);
      return;
    }
    // Already the database's copy, so the panel does not read it again. A failure is reported
    // as `bookingNotFound` below, so the global toast stays quiet.
    this.bookingsApi.get(this.hostelId(), id, { suppressErrorToast: true }).subscribe({
      next: (booking) => {
        if (this.urlBookingId === booking.id) this.showDetails(booking);
      },
      error: () => {
        if (this.urlBookingId !== id) return;
        this.notifications.error(this.i18n.translate<string>('hostBookings.bookingNotFound'));
        this.leaveBookingUrl();
      },
    });
  }

  /** Back to the list's own URL, when a booking's is showing. */
  private leaveBookingUrl(): void {
    const hostelId = this.hostelId();
    if (!this.urlBookingId || !hostelId) return;
    void this.router.navigateByUrl(`/host/${hostelId}/bookings`);
  }

  /** The booking the server now holds, in both the list's row and the open panel. */
  private replaceBooking(updated: HostBooking): void {
    if (this.viewing()?.id === updated.id) this.viewing.set(updated);
    this.listData.update((d) => d && { ...d, items: d.items.map((b) => (b.id === updated.id ? updated : b)) });
  }

  /** A release changes the booking's rooms, so the row re-reads it rather than keep stale ones. */
  protected onReleased(booking: HostBooking): void {
    this.epoch++;
    this.refetchDelay.track('/rooms');
    this.bookingsApi.get(this.hostelId(), booking.id).subscribe({
      next: (updated) => this.replaceBooking(updated),
      error: () => this.refresh.update((n) => n + 1),
    });
  }

  // ── the booking's invoice ────────────────────────────────────────────────────────

  /**
   * Each looked-up booking's invoice; `null` once a lookup has found none.
   *
   * A known invoice is never replaced by `null`: the bills list is a search index, and a bill
   * generated a moment ago can still be missing from it.
   */
  protected readonly invoices = signal<ReadonlyMap<string, Invoice | null>>(new Map());
  /** Lookups in flight or failed, by booking id; settled ones are absent. */
  private readonly invoiceLookups = signal<ReadonlyMap<string, 'loading' | 'error'>>(new Map());

  protected readonly viewingInvoice = computed(() => {
    const b = this.viewing();
    return (b && this.invoices().get(b.id)) ?? null;
  });

  protected readonly viewingInvoiceLookup = computed<InvoiceLookup>(() => {
    const b = this.viewing();
    if (!b || this.invoices().get(b.id)) return 'done';
    const pending = this.invoiceLookups().get(b.id);
    if (pending) return pending;
    // Not asked yet: the effect above is about to.
    return this.invoices().has(b.id) ? 'done' : 'loading';
  });

  /** The booking's invoice while money is still owed on it — what cross-pay and cancel warn about. */
  protected unpaidInvoice(b: HostBooking): Invoice | null {
    const inv = this.invoices().get(b.id);
    return inv && invoiceOwing(inv) ? inv : null;
  }

  protected invoiceNumber(inv: Invoice): string {
    return buildInvoiceId(inv);
  }

  private ensureInvoice(b: HostBooking): void {
    if (!isInvoiceable(b) || this.invoices().has(b.id) || this.invoiceLookups().get(b.id) === 'loading') return;
    this.lookupInvoices([b.id], PANEL_LOOKUP);
  }

  /**
   * `opts` quiets the global toast for a lookup made for the open panel, whose Invoice section
   * says "Could not check for an invoice." itself. The page's own lookup keeps its toast: a
   * failure there shows nowhere else, and the row menu would otherwise offer "Generate invoice"
   * on a booking that may already have one.
   */
  private lookupInvoices(ids: readonly string[], opts?: HostBookingRequestOptions): void {
    const hostelId = this.hostelId();
    if (!hostelId || !ids.length) return;
    this.setLookups(ids, 'loading');
    this.hostOps.bookingInvoices(hostelId, ids, opts).subscribe({
      next: (found) => {
        this.invoices.update((known) => {
          const next = new Map(known);
          for (const id of ids) {
            const inv = found.get(id) ?? null;
            const before = next.get(id) ?? null;
            if (inv) next.set(id, keepSettled(before, inv));
            else if (!before) next.set(id, null);
          }
          return next;
        });
        this.setLookups(ids, null);
      },
      error: () => this.setLookups(ids, 'error'),
    });
  }

  private setLookups(ids: readonly string[], state: 'loading' | 'error' | null): void {
    this.invoiceLookups.update((current) => {
      const next = new Map(current);
      for (const id of ids) {
        if (state) next.set(id, state);
        else next.delete(id);
      }
      return next;
    });
  }

  private recordInvoice(bookingId: string, inv: Invoice): void {
    this.invoices.update((known) => new Map(known).set(bookingId, inv));
    this.setLookups([bookingId], null);
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
      case 'viewInvoice': {
        const inv = this.invoices().get(e.booking.id);
        if (inv) void this.router.navigateByUrl(invoicePath(this.hostelId(), inv.id));
        return;
      }
      default:
        this.dialogReason.set('');
        this.dialogError.set('');
        this.payInvoiceToo.set(true);
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
   * whatever the filter is narrowing to. A refusal is shown where the host pressed the button,
   * as translated copy picked from the failure, never its own text; one saying the booking is not
   * where the screen shows it goes on to {@link onMovedOn}.
   * An empty `title` leaves the success toast to `onSuccess`, for moves whose outcome has parts.
   */
  private send(
    booking: HostBooking,
    request: (id: string) => Observable<HostBooking>,
    title: string,
    message = '',
    onError: (err: unknown) => void = (err) => this.viewError.set(bookingMoveFailureKey(err)),
    onSuccess: () => void = () => undefined,
  ): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.epoch++;
    this.viewError.set('');
    request(booking.id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.epoch++;
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
        if (title) this.notifications.success(title, message);
      },
      error: (err: unknown) => {
        this.epoch++;
        const kind = movedOnKind(err);
        if (kind) {
          // The refusal shows while the booking is read back, and `busy` holds until then.
          onError(err);
          this.onMovedOn(booking, err, kind);
          return;
        }
        this.busy.set(false);
        onError(err);
      },
    });
  }

  /**
   * A move refused because the booking is not where the screen shows it: the move was already
   * made, or the booking has moved on to another stage.
   *
   * The database's copy is read back quietly and replaces the shown one in the row and the
   * calendar. A copy that bears the refusal out closes the move ({@link closeMovedOn}); one that
   * does not leaves it open with the generic message. A host who opened something else while the
   * read was out keeps it. A failed read refreshes the list instead, and a booking that is gone
   * takes every surface on it with it.
   */
  private onMovedOn(shown: HostBooking, err: unknown, kind: MovedOnKind): void {
    const hostelId = this.hostelId();
    const epoch = this.epoch;
    const url = this.urlBookingId;
    const surface = this.refusalSurface(shown.id);
    const action = surface === 'assign' ? 'checkIn' : this.dialog()?.action;
    const roomsMove = action === 'checkIn' || action === 'checkOut' || action === 'cancel';
    const stillHere = () => this.epoch === epoch && this.urlBookingId === url && this.hostelId() === hostelId;
    this.bookingsApi.get(hostelId, shown.id, { suppressErrorToast: true }).subscribe({
      next: (fresh) => {
        this.busy.set(false);
        this.calendar()?.applyChange(shown, fresh);
        this.replaceBooking(fresh);
        if (this.panelBehindDialog?.id === fresh.id) this.panelBehindDialog = fresh;
        if (roomsMove && stageChanged(shown, fresh)) this.refetchDelay.track('/rooms');
        if (!stillHere()) return;
        if (refusalBorneOut(err, shown, fresh)) this.closeMovedOn(fresh, surface, kind, bookingMoveFailureKey(err));
        else this.keepMoveOpen(fresh, surface);
      },
      error: (readErr: unknown) => {
        this.busy.set(false);
        if (stillHere() && errorStatus(readErr) === 404) this.dropMissing();
        this.refresh.update((n) => n + 1);
      },
    });
  }

  /** Where a refused move on this booking is being reported. */
  private refusalSurface(id: string): MoveSurface {
    if (this.assigning()?.id === id) return 'assign';
    if (this.dialog()?.booking.id === id) return 'dialog';
    return 'panel';
  }

  /**
   * The move no longer applies, so its dialog or room allocation closes.
   *
   * The details panel shows the server's copy when the host had it open, or it stepped aside for
   * the dialog, and always after a check-in, which lands on the booking's URL so the rooms a
   * colleague picked are in front of the host. A move already made is news; one the booking has
   * moved on from is an error, in the panel's footer or, with no panel, a toast.
   */
  private closeMovedOn(fresh: HostBooking, surface: MoveSurface, kind: MovedOnKind, key: string): void {
    const panel =
      surface === 'assign' || this.viewing()?.id === fresh.id || this.panelBehindDialog?.id === fresh.id;
    if (surface === 'assign') {
      this.assigning.set(null);
      this.assignError.set('');
    }
    if (surface === 'dialog') {
      this.dialog.set(null);
      this.dialogError.set('');
    }
    this.panelBehindDialog = null;
    if (panel) {
      this.showDetails(fresh);
      if (this.urlBookingId !== fresh.id) void this.router.navigateByUrl(bookingPath(this.hostelId(), fresh.id));
    } else {
      this.ensureInvoice(fresh);
    }
    if (kind === 'done') this.notifications.info(this.i18n.translate<string>(key));
    else if (panel) this.viewError.set(key);
    else this.notifications.error(this.i18n.translate<string>(key));
  }

  /** The server's copy does not bear the refusal out: the move stays open on it, with the generic message. */
  private keepMoveOpen(fresh: HostBooking, surface: MoveSurface): void {
    const key = 'hostBookings.moveNotAccepted';
    switch (surface) {
      case 'assign':
        this.assigning.set(fresh);
        this.assignError.set(key);
        return;
      case 'dialog':
        this.dialog.update((d) => d && { ...d, booking: fresh });
        this.dialogError.set(key);
        return;
      default:
        this.viewError.set(key);
    }
  }

  /** The booking is gone: everything open on it closes and the host is told. */
  private dropMissing(): void {
    this.assigning.set(null);
    this.assignError.set('');
    this.dialog.set(null);
    this.dialogError.set('');
    this.panelBehindDialog = null;
    this.viewing.set(null);
    this.viewError.set('');
    this.leaveBookingUrl();
    this.notifications.error(this.i18n.translate<string>('hostBookings.bookingNotFound'));
  }

  // ── asking first: cancel, no-show, check-out, invoice ──────────────────────────

  protected readonly dialog = signal<{ action: BookingAction; booking: HostBooking } | null>(null);
  protected readonly dialogReason = signal('');
  /** A translation key, or `''` while there is nothing to report. */
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
      this.dialogError.set('hostBookings.giveTheGuestAReason');
      return;
    }
    const hostelId = this.hostelId();
    const fail = (err: unknown) => this.dialogError.set(bookingMoveFailureKey(err));
    // Every refusal here is written into the dialog, so the global toast would repeat it.
    const quiet = { suppressErrorToast: true };
    const roomsMoved = () => this.refetchDelay.track('/rooms');
    switch (d.action) {
      case 'cancel':
        this.send(d.booking, (id) => this.bookingsApi.cancel(hostelId, id, reason, quiet), 'Booking cancelled', 'The guest, host and manager have been told.', fail, roomsMoved);
        return;
      case 'noShow':
        this.send(d.booking, (id) => this.bookingsApi.markNoShow(hostelId, id, reason, quiet), 'Marked as a no show', '', fail);
        return;
      case 'checkOut':
        this.send(d.booking, (id) => this.bookingsApi.checkOut(hostelId, id, quiet), 'Checked out', 'Every bed this booking held is free again.', fail, roomsMoved);
        return;
      case 'markPaid':
        this.markPaid(d.booking, fail);
        return;
      case 'invoice':
        this.send(
          d.booking,
          // The invoice answers with the bill, not the booking; the booking itself is unchanged.
          (id) =>
            this.bookingsApi.generateInvoice(hostelId, id, quiet).pipe(
              tap((inv) => this.recordInvoice(id, inv)),
              map(() => d.booking),
            ),
          '',
          '',
          (err) => this.onGenerateRefused(d.booking, err),
          () => this.announceInvoice(d.booking),
        );
        return;
    }
  }

  /** Ticked by default: a guest settling at the desk has usually settled the invoice too. */
  protected readonly payInvoiceToo = signal(true);

  /**
   * The booking first, then — when the host left the box ticked — its invoice.
   *
   * Two requests under one `busy`, so nothing else can start between them. The booking's
   * refusal stops both and shows in the dialog; the invoice's arrives after the booking is
   * already paid, so it is reported on its own rather than undoing anything.
   *
   * A booking already paid elsewhere has the ticked invoice paid only when the database agrees
   * on both: the booking's copy shows it settled and still in a stage that takes payment, and
   * the invoice's own copy shows it still owing. A booking copy that says otherwise, or none,
   * lets the refusal stand. An invoice found already paid is recorded as paid; one that cannot
   * be read is left alone, never paid blind, and the page's own lookup is asked again.
   */
  private markPaid(booking: HostBooking, fail: (err: unknown) => void): void {
    const hostelId = this.hostelId();
    const quiet = { suppressErrorToast: true };
    const inv = this.payInvoiceToo() ? this.unpaidInvoice(booking) : null;
    let settled: Invoice | null = null;
    let invoiceFailureKey = '';
    let paidElsewhere = false;
    // The invoice's own copy when whoever paid the booking had paid it too; null when it could not be read.
    let foundPaid: Invoice | null = null;
    this.send(
      booking,
      (id) =>
        this.bookingsApi.markPaid(hostelId, id, quiet).pipe(
          catchError((err: unknown) =>
            inv && bookingRefusal(err) === 'alreadyPaid'
              ? this.bookingsApi.get(hostelId, id, quiet).pipe(
                  switchMap((fresh) =>
                    refusalBorneOut(err, booking, fresh) && isPayable(fresh) ? of(fresh) : throwError(() => err),
                  ),
                  // An unread, unsettled or no longer payable copy hands the refusal itself on, so `send` deals with it.
                  catchError(() => throwError(() => err)),
                  tap(() => (paidElsewhere = true)),
                )
              : throwError(() => err),
          ),
          switchMap((updated) => {
            if (!inv) return of(updated);
            // Built only by a branch that pays; its refusal is reported as `invoiceNotPaid` below, with a translated reason.
            const payInvoice = (): Observable<HostBooking> =>
              this.hostOps.markInvoicePaid(hostelId, inv.id, quiet).pipe(
                map((paid) => {
                  settled = paid;
                  return updated;
                }),
                catchError((err: unknown) => {
                  invoiceFailureKey = crossPayInvoiceFailureKey(err);
                  return of(updated);
                }),
              );
            if (!paidElsewhere) return payInvoice();
            // The bill's own read, not the bills list, which is a search index and lags a payment.
            return this.hostOps.invoice(hostelId, inv.id, quiet).pipe(
              map((current): Invoice | null => (current.id ? current : null)),
              catchError(() => of(null)),
              switchMap((current) => {
                if (current && invoiceOwing(current)) return payInvoice();
                foundPaid = current;
                return of(updated);
              }),
            );
          }),
        ),
      '',
      '',
      fail,
      () => {
        if (!inv) {
          this.notifications.success('Marked as paid', 'Nothing is left due on this booking.');
        } else if (settled) {
          this.recordInvoice(booking.id, settled);
          this.notifications.success(
            paidElsewhere
              ? this.i18n.translate<string>('hostBookings.alreadyPaidInvoicePaid', { invoice: buildInvoiceId(inv) })
              : this.i18n.translate<string>('hostBookings.bookingAndInvoicePaid'),
          );
        } else if (invoiceFailureKey) {
          const reason = this.i18n.translate<string>(invoiceFailureKey);
          this.notifications.error(this.i18n.translate<string>('hostBookings.invoiceNotPaid', { reason }));
        } else {
          // Paid elsewhere and the invoice left alone. A known invoice outlives a failed lookup, so it stays quiet.
          if (foundPaid) this.recordInvoice(booking.id, foundPaid);
          else this.lookupInvoices([booking.id], PANEL_LOOKUP);
          this.notifications.info(this.i18n.translate<string>('hostBookings.bookingAlreadyPaid'));
        }
      },
    );
  }

  /** The bill the server just raised, by the number and amount the host will look for. */
  private announceInvoice(booking: HostBooking): void {
    const inv = this.invoices().get(booking.id);
    if (!inv) return;
    this.notifications.success(
      'Invoice generated',
      `${buildInvoiceId(inv)} · ${currencySymbol(booking.currency)} ${this.money.transform(inv.amount)}`,
    );
  }

  /**
   * A second invoice is refused because one already exists — which means this page missed it,
   * so it asks again and offers that one instead of a dead end.
   */
  private onGenerateRefused(booking: HostBooking, err: unknown): void {
    if (bookingRefusal(err) !== 'invoiceExists') {
      this.dialogError.set(bookingMoveFailureKey(err));
      return;
    }
    this.closeDialog();
    this.notifications.info(this.i18n.translate<string>('hostBookings.invoiceAlreadyExists'));
    // Quiet only when the panel is back on this booking to say so itself.
    this.lookupInvoices([booking.id], this.viewing()?.id === booking.id ? PANEL_LOOKUP : undefined);
  }

  // ── checking in: placing guests in rooms ───────────────────────────────────────

  protected readonly assigning = signal<HostBooking | null>(null);
  /** A translation key, or `''` while there is nothing to report. */
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
    this.leaveBookingUrl();
  }

  /**
   * `mark_as_checked_in` with one allocation per room; capacity is the server's to refuse.
   * The refusal is written in the allocation's footer, so the global toast stays quiet.
   */
  protected onAssign(sel: AssignSelection): void {
    const booking = this.assigning();
    if (!booking) return;
    const allocations = sel.rooms.map((r) => ({ roomId: r.roomId, guests: r.guests }));
    this.send(
      booking,
      (id) => this.bookingsApi.checkIn(this.hostelId(), id, allocations, { suppressErrorToast: true }),
      'Checked in',
      sel.rooms.map((r) => `Room ${r.roomNumber} × ${r.guests}`).join(', '),
      (err) => this.assignError.set(bookingMoveFailureKey(err)),
      () => {
        this.assigning.set(null);
        this.refetchDelay.track('/rooms');
        this.leaveBookingUrl();
      },
    );
  }

  private readonly notifications = inject(NotificationService);

  /** The moves the row menu offers — the same set the panel does, from the same table. */
  protected rowActions(b: HostBooking): readonly BookingAction[] {
    return actionsFor(b, this.invoices().get(b.id) ?? null);
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
  viewInvoice: 'View invoice',
  cancel: 'Cancel booking',
  noShow: 'Mark no show',
  markPaid: 'Mark as paid',
};

const ACTION_ICON: Record<BookingAction, string> = {
  confirm: 'ti-circle-check',
  checkIn: 'ti-door-enter',
  checkOut: 'ti-door-exit',
  invoice: 'ti-file-invoice',
  viewInvoice: 'ti-eye',
  cancel: 'ti-calendar-x',
  noShow: 'ti-user-x',
  markPaid: 'ti-cash',
};

/** A lookup made for the open panel, which renders its failure inline. */
const PANEL_LOOKUP: HostBookingRequestOptions = { suppressErrorToast: true };

/** The server invoices only a stay that happened: checked in or checked out. */
function isInvoiceable(b: HostBooking): boolean {
  const lane = laneKeyFor(b.disposition.slug);
  return !!lane && INVOICEABLE_LANES.includes(lane);
}

/** The stages a booking still takes a payment in: confirmed, checked in or checked out. */
function isPayable(b: HostBooking): boolean {
  const lane = laneKeyFor(b.disposition.slug);
  return !!lane && PAYABLE_LANES.includes(lane);
}

/** Whether money is still owed on a bill: anything short of paid, overdue included. */
function invoiceOwing(inv: Invoice): boolean {
  return inv.status !== 'paid';
}

/**
 * A lookup's copy of a bill, unless it would undo a payment this page already saw.
 *
 * The bills list is a search index and lags a write by a moment, so the bill just marked paid
 * can come back from it still due.
 */
function keepSettled(before: Invoice | null, found: Invoice): Invoice {
  return before?.id === found.id && before.status === 'paid' && found.status !== 'paid' ? before : found;
}
