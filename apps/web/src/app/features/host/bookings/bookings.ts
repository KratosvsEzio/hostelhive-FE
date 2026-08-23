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
import { Button, ConfirmModal, EmptyState, ErrorState, Skeleton } from '@hostelhive/ui';
import { BookingApi } from '@features/public/listing/booking/booking-api';
import {
  ApiBooking,
  ApiBookingStatus,
  ApiHostCancellationQuote,
} from '@features/public/listing/booking/booking-api.contract';
import { TranslocoPipe } from '@jsverse/transloco';

interface ViewState {
  loading: boolean;
  error: boolean;
  data: ApiBooking[];
}

type Tab = 'upcoming' | 'past' | 'cancelled';

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
  imports: [DatePipe, DecimalPipe, Button, ConfirmModal, EmptyState, ErrorState, Skeleton, TranslocoPipe],
  templateUrl: './bookings.html',
})
export class HostBookings {
  private readonly api = inject(BookingApi);
  private readonly route = inject(ActivatedRoute);

  private readonly refresh = signal(0);
  protected readonly tab = signal<Tab>('upcoming');

  /**
   * `:hostelId` lives on the parent route, since this page is a child of the host shell.
   * Falls back to the current route rather than asserting a parent exists — the assertion
   * would be the only thing between a route refactor and a crash on load.
   */
  private readonly hostelId = toSignal(
    (this.route.parent ?? this.route).paramMap.pipe(map((p) => p.get('hostelId') ?? '')),
    { initialValue: '' },
  );

  protected readonly state = toSignal(
    toObservable(this.refresh).pipe(
      switchMap(() =>
        this.api.hostBookings(this.hostelId()).pipe(
          map((data): ViewState => ({ loading: false, error: false, data })),
          catchError(() => of({ loading: false, error: true, data: [] as ApiBooking[] })),
          startWith({ loading: true, error: false, data: [] as ApiBooking[] }),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, data: [] as ApiBooking[] } },
  );

  /** Counts per tab, so a host can see there is something in Past without switching to it. */
  protected readonly counts = computed(() => {
    const all = this.state().data;
    return {
      upcoming: all.filter((b) => this.bucket(b) === 'upcoming').length,
      past: all.filter((b) => this.bucket(b) === 'past').length,
      cancelled: all.filter((b) => this.bucket(b) === 'cancelled').length,
    };
  });

  /**
   * Arrivals soonest first.
   *
   * The reason a host opens this screen is nearly always somebody turning up, so the default
   * tab answers that and the rest stay one click away rather than filling the rows.
   */
  protected readonly rows = computed(() =>
    this.state()
      .data.filter((b) => this.bucket(b) === this.tab())
      .sort((a, b) => a.check_in.localeCompare(b.check_in)),
  );

  private bucket(b: ApiBooking): Tab {
    if (b.status === 'cancelled') return 'cancelled';
    return b.check_out < this.today() ? 'past' : 'upcoming';
  }

  private today(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  protected statusLabel(s: ApiBookingStatus): string {
    return s === 'cancelled' ? 'Cancelled' : s === 'completed' ? 'Completed' : 'Confirmed';
  }

  /** "2 rooms + 3 beds" — the booking summarised, with the line items underneath it. */
  protected summary(b: ApiBooking): string {
    const rooms = b.lines.filter((l) => l.room_type === 'private').reduce((n, l) => n + l.quantity, 0);
    const beds = b.lines.filter((l) => l.room_type === 'shared').reduce((n, l) => n + l.quantity, 0);
    const parts: string[] = [];
    if (rooms) parts.push(`${rooms} room${rooms === 1 ? '' : 's'}`);
    if (beds) parts.push(`${beds} bed${beds === 1 ? '' : 's'}`);
    return parts.join(' + ') || '—';
  }

  // ── cancelling ─────────────────────────────────────────────────────────────

  protected readonly cancelling = signal<ApiBooking | null>(null);
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
  protected askToCancel(booking: ApiBooking): void {
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
