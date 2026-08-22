import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Skeleton } from '@hostelhive/ui';
import { BookingApi } from '@features/public/listing/booking/booking-api';
import {
  ApiBooking,
  ApiCalendarDay,
} from '@features/public/listing/booking/booking-api.contract';

/** A cell in the month grid. `null` pads the week before the 1st. */
interface Cell {
  day: ApiCalendarDay | null;
  /** Rounded caps mark where a stay starts and ends, so two adjacent bookings read as two. */
  startsHere: boolean;
  endsHere: boolean;
}

type CellState = 'free' | 'partial' | 'full';

/**
 * What is sold in one room, by date.
 *
 * Three states rather than two, because two cannot describe a dorm. A six-bed room with four
 * beds sold is neither free nor full: painting it "booked" tells the host it is gone when two
 * beds are still sellable, and painting it "free" hides that it is nearly gone. A private room
 * really is binary, and its calendar only ever shows two of the three.
 */
@Component({
  selector: 'hh-room-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, Skeleton],
  templateUrl: './room-calendar.html',
})
export class RoomCalendar {
  readonly hostelId = input.required<string>();
  readonly roomId = input.required<string>();

  private readonly api = inject(BookingApi);

  /** Months from the current one. 0 is this month; the arrows step it. */
  protected readonly offset = signal(0);

  protected readonly month = computed(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + this.offset(), 1);
  });

  protected readonly monthLabel = computed(() => this.month());

  private readonly range = computed(() => {
    const m = this.month();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return {
      from: fmt(new Date(m.getFullYear(), m.getMonth(), 1)),
      to: fmt(new Date(m.getFullYear(), m.getMonth() + 1, 0)),
    };
  });

  private readonly state = toSignal(
    toObservable(computed(() => ({ ...this.range(), room: this.roomId(), hostel: this.hostelId() }))).pipe(
      switchMap((q) =>
        this.api.roomCalendar(q.hostel, q.room, q.from, q.to).pipe(
          map((r) => ({ loading: false, error: false, days: r.days, bookings: r.bookings })),
          catchError(() =>
            of({ loading: false, error: true, days: [] as ApiCalendarDay[], bookings: [] as ApiBooking[] }),
          ),
          startWith({
            loading: true,
            error: false,
            days: [] as ApiCalendarDay[],
            bookings: [] as ApiBooking[],
          }),
        ),
      ),
    ),
    {
      initialValue: {
        loading: true,
        error: false,
        days: [] as ApiCalendarDay[],
        bookings: [] as ApiBooking[],
      },
    },
  );

  protected readonly loading = computed(() => this.state().loading);
  protected readonly error = computed(() => this.state().error);

  protected readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  /**
   * The month laid out as a grid, padded so the 1st sits under its weekday.
   *
   * Weeks start Monday — the convention across the rest of the host console.
   */
  protected readonly cells = computed<Cell[]>(() => {
    const days = this.state().days;
    if (!days.length) return [];
    const m = this.month();
    // getDay() is Sunday-first; shift so Monday is 0.
    const lead = (new Date(m.getFullYear(), m.getMonth(), 1).getDay() + 6) % 7;
    const pad: Cell[] = Array.from({ length: lead }, () => ({
      day: null,
      startsHere: false,
      endsHere: false,
    }));
    return [
      ...pad,
      ...days.map((day, i) => ({
        day,
        startsHere: day.booked > 0 && (days[i - 1]?.booked ?? 0) === 0,
        endsHere: day.booked > 0 && (days[i + 1]?.booked ?? 0) === 0,
      })),
    ];
  });

  protected state_(day: ApiCalendarDay): CellState {
    if (day.booked <= 0) return 'free';
    return day.booked >= day.capacity ? 'full' : 'partial';
  }

  /** Units still sellable on this date. Drives the "2 left" label on a partial cell. */
  protected left(day: ApiCalendarDay): number {
    return Math.max(0, day.capacity - day.booked);
  }

  /** The day whose card is open. Hover on a pointer, tap on touch — see the template. */
  protected readonly active = signal<string | null>(null);

  protected bookingsOn(date: string): ApiBooking[] {
    const day = this.state().days.find((d) => d.date === date);
    if (!day) return [];
    return this.state().bookings.filter((b) => day.booking_ids.includes(b.id));
  }

  protected quantityIn(booking: ApiBooking): number {
    return booking.lines
      .filter((l) => l.room_id === this.roomId())
      .reduce((n, l) => n + l.quantity, 0);
  }

  protected step(by: number): void {
    this.offset.update((n) => n + by);
    this.active.set(null);
  }
}
