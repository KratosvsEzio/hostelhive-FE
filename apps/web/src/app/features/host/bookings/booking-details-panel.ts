import { TranslocoPipe } from '@jsverse/transloco';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Button } from '@hostelhive/ui';
import { CurrencySymbolPipe } from '@app/shared/currency/currency-symbol.pipe';
import { LaneKey, laneFor, laneKeyFor } from './booking-month';
import { BookingOccupancy, HostBooking, HostBookingsApi } from './host-bookings-api';
import { isPrivateOccupancy } from '@util/occupancy-type';

/** What a host can do to a booking, as the lifecycle (Trello #80) allows it. */
export type BookingAction = 'confirm' | 'checkIn' | 'checkOut' | 'invoice' | 'cancel' | 'noShow';

/**
 * Which actions each stage offers, primary last.
 *
 * Offered only from the state the lifecycle allows, because the server does not guard two of
 * them: it would confirm a cancelled booking, and check in one nobody confirmed. Cancel is
 * open until the stay ends; a no-show only from confirmed; an invoice once there is a stay to
 * bill — checked in, checked out, or a no-show, which stays invoiceable.
 */
export const ACTIONS_BY_LANE: Readonly<Record<LaneKey, readonly BookingAction[]>> = {
  pending: ['cancel', 'confirm'],
  confirmed: ['cancel', 'noShow', 'checkIn'],
  'checked-in': ['cancel', 'invoice', 'checkOut'],
  'checked-out': ['invoice'],
  'no-show': ['invoice'],
  cancelled: [],
};

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
  imports: [DatePipe, DecimalPipe, Button, CurrencySymbolPipe, TranslocoPipe],
  templateUrl: './booking-details-panel.html',
})
export class BookingDetailsPanel {
  readonly booking = input<HostBooking | null>(null);
  /** The hostel, for reading the booking's rooms once it is checked in. */
  readonly hostelId = input('');
  /** Set by the page when an action could not be sent, so the footer can say why. */
  readonly actionError = input('');
  /** An action is in flight; every button waits for it. */
  readonly busy = input(false);

  readonly closed = output<void>();
  readonly act = output<{ action: BookingAction; booking: HostBooking }>();

  private readonly api = inject(HostBookingsApi);

  protected readonly lane = computed(() => laneKeyFor(this.booking()?.disposition.slug ?? ''));

  protected readonly badge = computed(
    () => laneFor(this.booking()?.disposition.slug ?? '')?.badge ?? 'bg-ink-100 text-ink-600',
  );

  protected readonly actions = computed<readonly BookingAction[]>(() => {
    const lane = this.lane();
    return lane ? ACTIONS_BY_LANE[lane] : [];
  });
  /** The move that finishes this stage — drawn filled, the rest outlined. */
  protected readonly primary = computed(() => {
    const a = this.actions();
    const last = a[a.length - 1];
    return last && last !== 'cancel' && last !== 'invoice' ? last : null;
  });

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

  /** Whether the deposit has actually been taken. */
  protected readonly depositPaid = computed(() => (this.booking()?.paid ?? 0) > 0);

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
  /** Bumped after a release, so the list re-reads what the server now holds. */
  private readonly occupancyTick = signal(0);
  protected readonly releasing = signal<string | null>(null);
  protected readonly releaseError = signal('');

  private readonly occupancyState = toSignal(
    toObservable(
      computed(() => {
        const b = this.booking();
        const checkedIn = b && laneKeyFor(b.disposition.slug) === 'checked-in';
        return { key: checkedIn ? `${this.hostelId()}|${b.id}` : '', tick: this.occupancyTick() };
      }),
    ).pipe(
      switchMap(({ key }) => {
        if (!key) return of<OccupancyState>({ loading: false, error: false, rows: [] });
        const [hostelId, bookingId] = key.split('|');
        return this.api.occupancies(hostelId, bookingId).pipe(
          map((rows) => ({ loading: false, error: false, rows })),
          startWith<OccupancyState>({ loading: true, error: false, rows: [] }),
          catchError(() => of<OccupancyState>({ loading: false, error: true, rows: [] })),
        );
      }),
    ),
    { initialValue: { loading: false, error: false, rows: [] } as OccupancyState },
  );

  protected readonly showOccupancies = computed(() => this.lane() === 'checked-in');
  protected readonly occupancies = computed(() => this.occupancyState());

  protected release(o: BookingOccupancy): void {
    const b = this.booking();
    if (!b || this.releasing()) return;
    this.releasing.set(o.id);
    this.releaseError.set('');
    this.api.releaseOccupancy(this.hostelId(), b.id, o.id).subscribe({
      next: () => {
        this.releasing.set(null);
        this.occupancyTick.update((n) => n + 1);
      },
      error: (err: { message?: string } | null) => {
        this.releasing.set(null);
        this.releaseError.set(err?.message || `Could not release room ${o.roomNumber}.`);
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
      case 'no-show':
        return 'An invoice can be raised once per booking.';
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

const ACTION_LABEL: Record<BookingAction, string> = {
  confirm: 'Confirm',
  checkIn: 'Check in',
  checkOut: 'Check out',
  invoice: 'Generate invoice',
  cancel: 'Cancel booking',
  noShow: 'Mark no show',
};
