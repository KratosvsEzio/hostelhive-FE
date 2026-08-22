import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Button, ConfirmModal, EmptyState, ErrorState, Skeleton } from '@hostelhive/ui';
import { RouterLink } from '@angular/router';
import { LocaleLink } from '@core/i18n/locale-link';
import { BookingApi } from '@features/public/listing/booking/booking-api';
import {
  ApiBooking,
  ApiCancellationQuote,
} from '@features/public/listing/booking/booking-api.contract';

interface ViewState {
  loading: boolean;
  error: boolean;
  data: ApiBooking[];
}

/**
 * The guest's own bookings, and the only place they can cancel one.
 *
 * Upcoming stays sort first because that is what somebody opens this page for; past ones stay
 * listed rather than disappearing, since "where did I stay in March" is a real errand and the
 * booking is the receipt.
 */
@Component({
  selector: 'app-account-bookings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    LocaleLink,
    Button,
    ConfirmModal,
    EmptyState,
    ErrorState,
    Skeleton,
  ],
  templateUrl: './bookings.html',
})
export class AccountBookings {
  private readonly api = inject(BookingApi);

  private readonly refresh = signal(0);

  protected readonly state = toSignal(
    toObservable(this.refresh).pipe(
      switchMap(() =>
        this.api.myBookings().pipe(
          map((data): ViewState => ({ loading: false, error: false, data })),
          catchError(() => of({ loading: false, error: true, data: [] as ApiBooking[] })),
          startWith({ loading: true, error: false, data: [] as ApiBooking[] }),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, data: [] as ApiBooking[] } },
  );

  /** Soonest arrival first; anything already past or cancelled falls below. */
  protected readonly bookings = computed(() =>
    [...this.state().data].sort((a, b) => {
      const aPast = this.isPast(a) ? 1 : 0;
      const bPast = this.isPast(b) ? 1 : 0;
      return aPast - bPast || a.check_in.localeCompare(b.check_in);
    }),
  );

  /** The booking a cancel dialogue is open for, with the server's quote. */
  protected readonly cancelling = signal<ApiBooking | null>(null);
  protected readonly quote = signal<ApiCancellationQuote | null>(null);
  protected readonly quoteLoading = signal(false);
  protected readonly cancelError = signal('');

  protected readonly cancelOpen = computed(() => this.cancelling() !== null);

  protected isPast(b: ApiBooking): boolean {
    return b.status !== 'confirmed' || b.check_out < this.today();
  }

  protected nights(b: ApiBooking): number {
    const [y1, m1, d1] = b.check_in.split('-').map(Number);
    const [y2, m2, d2] = b.check_out.split('-').map(Number);
    return Math.round(
      (new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86_400_000,
    );
  }

  private today(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  /**
   * Opens the dialogue and asks the server what cancelling costs.
   *
   * The figure is fetched rather than computed here: the band depends on time remaining, and a
   * page left open overnight would quote yesterday's number and charge today's.
   */
  protected askToCancel(booking: ApiBooking): void {
    this.cancelling.set(booking);
    this.quote.set(null);
    this.cancelError.set('');
    this.quoteLoading.set(true);
    this.api.cancellationQuote(booking.id).subscribe({
      next: (q) => {
        this.quote.set(q);
        this.quoteLoading.set(false);
      },
      error: () => {
        this.cancelError.set('We could not work out your refund. Please try again.');
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
    this.api.cancel(booking.id).subscribe({
      next: () => {
        this.closeCancel();
        this.refresh.update((n) => n + 1);
      },
      error: () => this.cancelError.set('We could not cancel this booking. Please try again.'),
    });
  }
}
