import { TranslocoPipe } from '@jsverse/transloco';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Button, StatusPill, StatusTone } from '@hostelhive/ui';
import { Invoice } from '@hostelhive/data-access';
import { CurrencySymbolPipe } from '@app/shared/currency/currency-symbol.pipe';
import { MoneyPipe } from '@app/shared/currency/money.pipe';
import { LocaleLink } from '@core/i18n/locale-link';
import { invoicePath } from '@util/host-links';
import {
  buildInvoiceId,
  invoiceStatusLabel,
  invoiceStatusTone,
} from '@util/table-configs/invoice-table-cols';
import { INVOICEABLE_LANES, LaneKey, PAYABLE_LANES, laneFor, laneKeyFor } from './booking-month';
import { BookingOccupancy, HostBooking, HostBookingsApi } from './host-bookings-api';
import { releaseFailureKey } from './booking-move-failure';
import { isPrivateOccupancy } from '@util/occupancy-type';
import { bookingRefusal } from '@util/booking-refusal';

/** What a host can do to a booking, as the lifecycle (Trello #80) allows it. */
export type BookingAction =
  | 'confirm'
  | 'checkIn'
  | 'checkOut'
  | 'invoice'
  | 'viewInvoice'
  | 'cancel'
  | 'noShow'
  | 'markPaid';

/**
 * Where the page is in finding out whether a booking has an invoice.
 *
 * `done` covers both answers — the invoice itself travels separately, and its absence after
 * `done` means the booking has none yet.
 */
export type InvoiceLookup = 'loading' | 'error' | 'done';

/**
 * Which actions each stage offers, primary last.
 *
 * Offered only from the state the lifecycle allows, because the server does not guard two of
 * them: it would confirm a cancelled booking, and check in one nobody confirmed. Cancel is
 * open until the stay ends; a no-show only from confirmed; an invoice once there is a stay to
 * bill — checked in or checked out. A no-show is closed: the server refuses to invoice it.
 */
export const ACTIONS_BY_LANE: Readonly<Record<LaneKey, readonly BookingAction[]>> = {
  pending: ['cancel', 'confirm'],
  confirmed: ['cancel', 'noShow', 'checkIn'],
  'checked-in': ['cancel', 'invoice', 'checkOut'],
  'checked-out': ['invoice'],
  'no-show': [],
  cancelled: [],
};

/**
 * The moves a booking offers now: its stage's, plus "Mark as paid" while money is still owed on
 * a stage that can be paid (Trello #81). Placed before the stage's primary move, so the move
 * that finishes the stage stays last and filled.
 *
 * A booking is invoiced once, so when its invoice is known "Generate invoice" becomes
 * "View invoice" in the same place.
 */
export function actionsFor(b: HostBooking, invoice: Invoice | null = null): readonly BookingAction[] {
  const lane = laneKeyFor(b.disposition.slug);
  if (!lane) return [];
  const stage = ACTIONS_BY_LANE[lane];
  const base = invoice ? stage.map((a) => (a === 'invoice' ? 'viewInvoice' : a)) : stage;
  const owed = b.paid < b.total;
  if (!owed || !PAYABLE_LANES.includes(lane)) return base;
  return [...base.slice(0, -1), 'markPaid', ...base.slice(-1)];
}

interface OccupancyState {
  loading: boolean;
  error: boolean;
  rows: BookingOccupancy[];
}

/**
 * One booking and what can be done with it next.
 *
 * One layout for every stage: the facts at the top, what was booked, who is in which room
 * once checked in, and the lifecycle's next moves at the bottom. The moves are emitted, not
 * performed — the page owns the requests, their confirmations and the refresh after.
 */
@Component({
  selector: 'hh-booking-details-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    LocaleLink,
    Button,
    StatusPill,
    CurrencySymbolPipe,
    MoneyPipe,
    TranslocoPipe,
  ],
  templateUrl: './booking-details-panel.html',
})
export class BookingDetailsPanel {
  readonly booking = input<HostBooking | null>(null);
  /** The hostel, for reading the booking's rooms once it is checked in. */
  readonly hostelId = input('');
  /** Set by the page when an action could not be sent: a translation key for why, shown in the footer. */
  readonly actionError = input('');
  /** An action is in flight; every button waits for it. */
  readonly busy = input(false);
  /** The booking's invoice, once the page has found one. */
  readonly invoice = input<Invoice | null>(null);
  /** Whether the page is still asking for {@link invoice}, or could not. */
  readonly invoiceLookup = input<InvoiceLookup>('done');

  readonly closed = output<void>();
  readonly act = output<{ action: BookingAction; booking: HostBooking }>();
  /** A room was released, so the booking the page holds no longer matches the server's. */
  readonly released = output<HostBooking>();

  private readonly api = inject(HostBookingsApi);

  protected readonly lane = computed(() => laneKeyFor(this.booking()?.disposition.slug ?? ''));

  protected readonly badge = computed(
    () => laneFor(this.booking()?.disposition.slug ?? '')?.badge ?? 'bg-ink-100 text-ink-600',
  );

  protected readonly actions = computed<readonly BookingAction[]>(() => {
    const b = this.booking();
    return b ? actionsFor(b, this.invoice()) : [];
  });
  /** The move that finishes this stage — drawn filled, the rest outlined. */
  protected readonly primary = computed(() => {
    const a = this.actions();
    const last = a[a.length - 1];
    return last && !SECONDARY_ACTIONS.includes(last) ? last : null;
  });

  // ── the invoice ──────────────────────────────────────────────────────────────────
  /** Only a stay that happened can be invoiced, so only those stages say whether it has been. */
  protected readonly showInvoice = computed(() => {
    const lane = this.lane();
    return !!lane && INVOICEABLE_LANES.includes(lane);
  });
  protected readonly invoiceNumber = computed(() => {
    const inv = this.invoice();
    return inv ? buildInvoiceId(inv) : '';
  });
  protected readonly invoiceStatusText = computed(() => {
    const inv = this.invoice();
    return inv ? invoiceStatusLabel(inv.status) : '';
  });
  protected readonly invoiceTone = computed<StatusTone>(() => {
    const inv = this.invoice();
    return inv ? invoiceStatusTone(inv.status) : 'neutral';
  });
  protected readonly invoiceLink = computed(() => {
    const inv = this.invoice();
    return inv ? invoicePath(this.hostelId(), inv.id) : '';
  });

  /**
   * The rooms a finished stay used, read-only.
   *
   * From the rooms the booking carries: once it is checked out or cancelled nothing can be
   * released, so there is nothing to re-read either.
   */
  protected readonly stayHistory = computed<readonly BookingOccupancy[]>(() => {
    const b = this.booking();
    const lane = this.lane();
    return b && (lane === 'checked-out' || lane === 'cancelled') ? b.occupancies : [];
  });
  /** What became of each {@link stayHistory} room: a cancelled stay released it, nobody checked out. */
  protected readonly stayRowLabel = computed(() =>
    this.lane() === 'cancelled' ? 'hostBookings.released' : 'hostBookings.checkedOut',
  );

  protected readonly isShared = computed(
    () => !isPrivateOccupancy(this.booking()?.roomType.occupancyType),
  );

  /**
   * "3 shared beds" / "1 private room" — the headline of what was booked.
   *
   * From the lines when the booking has them: a stay can mix rooms and beds, and the first
   * line's type is not the booking's. A single-type booking without lines falls back to the
   * old derivation — beds per guest on a dorm, the fewest rooms that seat the party otherwise.
   */
  protected readonly askedFor = computed(() => {
    const b = this.booking();
    if (!b) return '';
    if (b.lines.length) {
      const rooms = b.lines.filter((l) => !l.shared).reduce((n, l) => n + l.units, 0);
      const beds = b.lines.filter((l) => l.shared).reduce((n, l) => n + l.units, 0);
      return [
        rooms ? `${rooms} private room${rooms === 1 ? '' : 's'}` : '',
        beds ? `${beds} shared bed${beds === 1 ? '' : 's'}` : '',
      ]
        .filter(Boolean)
        .join(' + ');
    }
    if (this.isShared()) {
      const n = Math.max(1, b.guests);
      return `${n} shared bed${n === 1 ? '' : 's'}`;
    }
    const n = Math.max(1, Math.ceil(b.guests / (b.roomType.capacity || 1)));
    return `${n} private room${n === 1 ? '' : 's'}`;
  });

  /** "3 guests · King size room" — or "· 2 room types" for a mixed stay. */
  protected readonly askedForDetail = computed(() => {
    const b = this.booking();
    if (!b) return '';
    const what =
      b.lines.length > 1 ? `${b.lines.length} room types` : (b.lines[0]?.name ?? b.roomType.name);
    return `${b.guests} guest${b.guests === 1 ? '' : 's'} · ${what}`;
  });

  /** Whether nothing is left to collect at the property. */
  protected readonly settled = computed(() => {
    const b = this.booking();
    return !!b && b.total > 0 && b.balanceDue <= 0;
  });

  /** "12 minutes ago" from `created_at`, so the wait is legible without doing the sum. */
  protected readonly requestedAgo = computed(() => {
    const iso = this.booking()?.createdAt;
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return '';
    const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  });

  // ── who is in which room ─────────────────────────────────────────────────────────
  protected readonly releasing = signal<string | null>(null);

  // A computed only notifies when the id changes, so a same-booking re-read resets nothing below.
  private readonly bookingId = computed(() => this.booking()?.id ?? '');

  /**
   * Why the last release failed: a translation key, and the room it names.
   *
   * Keyed on the booking id, so it does not follow the host to the next booking; the page's
   * re-read of the same booking keeps it.
   */
  protected readonly releaseError = linkedSignal<string, { key: string; room: string } | null>({
    source: this.bookingId,
    computation: () => null,
  });

  /**
   * Rooms released from this panel, by occupancy id, keyed on the booking id it is showing.
   *
   * The occupancies endpoint answers from the search index, which lags a release by up to a
   * second — so re-reading it straight after one returns the room still active. The server's
   * "released" is final, so the panel records it here instead of asking again.
   */
  private readonly releasedIds = linkedSignal<string, ReadonlySet<string>>({
    source: this.bookingId,
    computation: () => new Set<string>(),
  });

  private readonly occupancyState = toSignal(
    toObservable(
      // The page swaps in the server's copy after every action (marked paid, a release). Same
      // booking, same rooms — so only a different booking reads them again.
      computed(() => {
        const b = this.booking();
        const checkedIn = b && laneKeyFor(b.disposition.slug) === 'checked-in';
        return checkedIn ? `${this.hostelId()}|${b.id}` : '';
      }),
    ).pipe(
      switchMap((key) => {
        if (!key) return of<OccupancyState>({ loading: false, error: false, rows: [] });
        const [hostelId, bookingId] = key.split('|');
        // The booking carries its rooms now (Trello #81): shown at once, then refreshed from
        // the endpoint.
        const carried = this.booking()?.occupancies ?? [];
        return this.api.occupancies(hostelId, bookingId).pipe(
          map((rows) => ({ loading: false, error: false, rows })),
          startWith<OccupancyState>({ loading: !carried.length, error: false, rows: carried }),
          catchError(() =>
            of<OccupancyState>({ loading: false, error: !carried.length, rows: carried }),
          ),
        );
      }),
    ),
    { initialValue: { loading: false, error: false, rows: [] } as OccupancyState },
  );

  protected readonly showOccupancies = computed(() => this.lane() === 'checked-in');
  /**
   * The rows to draw: the endpoint's, plus any room the booking carries that it does not list,
   * with every room known to be released marked so.
   *
   * The endpoint reads a search index that can lag the database by minutes, so a booking the page
   * re-read from the database may hold rooms it has not heard of yet. A room is never removed, only
   * released, so a room any source lists is kept. Released is final too, so any source saying so
   * wins over the index: this panel's own release, or the booking's copy.
   */
  protected readonly occupancies = computed<OccupancyState>(() => {
    const state = this.occupancyState();
    const carried = this.booking()?.occupancies ?? [];
    const listed = new Set(state.rows.map((o) => o.id));
    const unlisted = carried.filter((o) => !listed.has(o.id));
    const merged: OccupancyState = unlisted.length
      ? { loading: false, error: false, rows: [...state.rows, ...unlisted] }
      : state;
    const released = new Set(this.releasedIds());
    for (const o of carried) if (!o.active) released.add(o.id);
    if (!merged.rows.some((o) => o.active && released.has(o.id))) return merged;
    return { ...merged, rows: merged.rows.map((o) => (o.active && released.has(o.id) ? { ...o, active: false } : o)) };
  });

  protected release(o: BookingOccupancy): void {
    const b = this.booking();
    if (!b || this.releasing()) return;
    this.releasing.set(o.id);
    this.releaseError.set(null);
    // The failure is shown under the rooms, so the global toast would only repeat it.
    this.api.releaseOccupancy(this.hostelId(), b.id, o.id, { suppressErrorToast: true }).subscribe({
      next: () => {
        this.releasing.set(null);
        this.releasedIds.update((ids) => new Set(ids).add(o.id));
        this.released.emit(b);
      },
      error: (err: unknown) => {
        this.releasing.set(null);
        this.releaseError.set({ key: releaseFailureKey(err), room: o.roomNumber });
        // "Already released" is as final as a release that succeeded, so it is recorded the same way.
        if (bookingRefusal(err) === 'roomAlreadyReleased') {
          this.releasedIds.update((ids) => new Set(ids).add(o.id));
          this.released.emit(b);
        }
      },
    });
  }

  // ── the next move ────────────────────────────────────────────────────────────────
  protected label(action: BookingAction): string {
    return ACTION_LABEL[action];
  }

  protected run(action: BookingAction): void {
    const b = this.booking();
    if (b && !this.busy()) this.act.emit({ action, booking: b });
  }

  /** The line under the buttons: what the primary move does, so pressing it is not a guess. */
  protected readonly hint = computed(() => {
    switch (this.lane()) {
      case 'pending':
        return 'Confirming emails the guest their confirmation, with the booking as a PDF.';
      case 'confirmed':
        return 'Rooms are assigned at check-in. A guest who never arrives is a no show.';
      case 'checked-in':
        return 'Checking out releases every bed this booking holds.';
      case 'checked-out':
        return this.invoice() ? 'This stay has been invoiced.' : 'An invoice can be raised once per booking.';
      case 'no-show':
        return 'The guest never arrived, so this booking is closed.';
      case 'cancelled':
        return 'This booking was cancelled.';
      default:
        return '';
    }
  });

  protected close(): void {
    this.closed.emit();
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.length
      ? parts
          .map((p) => p[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()
      : '–';
  }
}

/** Moves that never finish a stage, so they are never drawn as its filled primary. */
const SECONDARY_ACTIONS: readonly BookingAction[] = ['cancel', 'invoice', 'viewInvoice', 'markPaid'];

const ACTION_LABEL: Record<BookingAction, string> = {
  confirm: 'Confirm',
  checkIn: 'Check in',
  checkOut: 'Check out',
  invoice: 'Generate invoice',
  viewInvoice: 'View invoice',
  cancel: 'Cancel booking',
  noShow: 'Mark no show',
  markPaid: 'Mark as paid',
};
