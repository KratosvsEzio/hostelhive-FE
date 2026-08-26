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
import { DatePipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Button, Skeleton } from '@hostelhive/ui';
import {
  BookingCalendar as CalendarData,
  HostBooking,
  HostBookingsApi,
} from './host-bookings-api';
import {
  DayCell,
  LANES,
  LaneKey,
  barSegments,
  buildBookingMonth,
  isoDate,
  monthRange,
} from './booking-month';

interface CalendarState {
  loading: boolean;
  error: boolean;
  data: CalendarData;
}

/** The stays the selected day actually holds, as opposed to the month's counts. */
interface DayState {
  loading: boolean;
  error: boolean;
  data: readonly HostBooking[];
}

const EMPTY: CalendarData = { days: [], totals: {}, revenue: {} };

/**
 * The month above the bookings table — every room, every state, one screen.
 *
 * The table answers "show me the bookings"; this answers "what does August look like, and what
 * needs me today". It fetches its own month rather than deriving one from the table's rows,
 * because the counting is the server's: `booking_calender` already tallies each day by
 * disposition, and re-deriving it in the browser would be a second implementation of the same
 * rule, disagreeing quietly whenever the two drifted.
 *
 * Two layouts rather than two components. A 136px desktop cell holds five labelled rows; a
 * 48px phone cell cannot, so mobile keeps the same lanes and colours but compresses them to a
 * stacked micro-bar plus a pending badge, and moves the five numbers into the day ledger below
 * — the same ledger, one tap later. The lane order and meaning never change between the two,
 * which is the part a host learns once.
 */
@Component({
  selector: 'hh-booking-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Button, Skeleton],
  templateUrl: './booking-calendar.html',
})
export class BookingCalendar {
  /**
   * Deliberately not `input.required`.
   *
   * `request` is read through `toObservable`, which subscribes while the class fields are
   * initialising — before Angular has bound anything. A required input throws NG0950 when
   * read that early, and the whole component renders as a header with no grid under it.
   * Empty is a real state here anyway: the route's `:hostelId` resolves a tick later.
   */
  readonly hostelId = input('');
  /**
   * The table's rows, now only a stand-in while the selected day is being fetched.
   *
   * The ledger used to be built entirely from this, which made the cards only as complete
   * as the page's list; they come from {@link dayState} now. It is kept because a request
   * takes a moment and a host tapping across a week should not watch the cards flicker.
   * Nothing durable depends on it: every number on screen comes from the aggregation, so a
   * stale list can briefly leave a card out but can never make a total wrong.
   */
  readonly bookings = input<readonly HostBooking[]>([]);
  /** Emitted when a lane in the day ledger is clicked, so the table below can filter to it. */
  readonly laneSelect = output<{ date: string; lane: LaneKey }>();
  /** A pending card asking to be placed. The panel that does it lives on the page. */
  readonly assignRequested = output<HostBooking>();
  /** A pending card asking to be read before it is placed. */
  readonly detailsRequested = output<HostBooking>();

  private readonly api = inject(HostBookingsApi);

  protected readonly lanes = LANES;
  protected readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly weekdaysNarrow = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  /** 42, matching the grid, so the skeleton occupies exactly the space the month will. */
  protected readonly skeletonCells = Array.from({ length: 42 });

  private readonly today = new Date();

  /** First of the displayed month. Stepping months never touches the day-of-month. */
  protected readonly monthStart = signal(
    new Date(this.today.getFullYear(), this.today.getMonth(), 1),
  );

  private readonly request = computed(() => ({
    hostelId: this.hostelId(),
    ...monthRange(this.monthStart()),
  }));

  protected readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ hostelId, start, end }) =>
        !hostelId
          ? of<CalendarState>({ loading: false, error: false, data: EMPTY })
          : this.api.calendar(hostelId, start, end).pipe(
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
              switchMap((data) => of<CalendarState>({ loading: false, error: false, data })),
              startWith<CalendarState>({ loading: true, error: false, data: EMPTY }),
              catchError(() => of<CalendarState>({ loading: false, error: true, data: EMPTY })),
            ),
      ),
    ),
    { initialValue: { loading: true, error: false, data: EMPTY } as CalendarState },
  );

  protected readonly month = computed(() =>
    buildBookingMonth(this.state().data.days, this.monthStart(), this.today),
  );

  /**
   * The day the ledger is showing.
   *
   * A `linkedSignal` on the month so stepping to another month re-seeds the selection rather
   * than leaving the ledger on a date the grid no longer shows — that would pair March's
   * numbers with April's grid, and nothing on screen would say so. Defaults to today when
   * today is in view, otherwise the first of the month.
   */
  protected readonly selected = linkedSignal<Date, string>({
    source: this.monthStart,
    computation: (start) => {
      const sameMonth =
        start.getFullYear() === this.today.getFullYear() &&
        start.getMonth() === this.today.getMonth();
      return sameMonth ? isoDate(this.today) : isoDate(new Date(start.getFullYear(), start.getMonth(), 1));
    },
  });

  protected readonly selectedDay = computed<DayCell | undefined>(() =>
    this.month().days.find((d) => d.date === this.selected()),
  );

  /**
   * The bookings arriving on the selected day, asked of the server for that day.
   *
   * The month aggregation gives the ledger its five numbers but carries no guests, so the
   * cards under it need records. Fetching the day is what makes them the day's records:
   * filtering the page's list instead would show whatever that list happened to contain,
   * and a list that is paginated, filtered or simply stale would drop cards silently —
   * with the lane count above still reading the true number, which is the worst version
   * of wrong, because the two disagree in a way nothing on screen explains.
   */
  private readonly dayRequest = computed(() => ({
    hostelId: this.hostelId(),
    date: this.selected(),
  }));

  protected readonly dayState = toSignal(
    toObservable(this.dayRequest).pipe(
      switchMap(({ hostelId, date }) =>
        !hostelId || !date
          ? of<DayState>({ loading: false, error: false, data: [] })
          : this.api.bookingsOn(hostelId, date).pipe(
              map((data): DayState => ({ loading: false, error: false, data })),
              startWith<DayState>({ loading: true, error: false, data: [] }),
              catchError(() => of<DayState>({ loading: false, error: true, data: [] })),
            ),
      ),
    ),
    { initialValue: { loading: true, error: false, data: [] } as DayState },
  );

  /**
   * The stays awaiting a room on the selected day, for the cards under the ledger.
   *
   * Comes from {@link dayState} once the server has answered. While that request is in
   * flight the page's own list stands in, filtered to the same day — without it the cards
   * blank out and reappear on every date tapped, which reads as the day having nothing in
   * it right up until it does.
   *
   * Either way the match is on the check-in *date*: the records carry a full offset
   * timestamp (`2026-08-26T22:44:01+05:00`), so comparing raw strings would never match a
   * `yyyy-MM-dd` cell.
   */
  protected readonly needsAction = computed(() => {
    const day = this.dayState();
    const date = this.selected();
    const rows = day.loading
      ? this.bookings().filter((b) => b.checkIn === date)
      : day.data;
    return rows.filter((b) => b.disposition.slug === 'pending-allotment');
  });

  protected step(by: number): void {
    const m = this.monthStart();
    this.monthStart.set(new Date(m.getFullYear(), m.getMonth() + by, 1));
  }

  protected select(day: DayCell): void {
    if (day.inMonth) this.selected.set(day.date);
  }

  protected bars(day: DayCell): { key: LaneKey; pct: number; dot: string }[] {
    return barSegments(day.counts);
  }

  /** Initials for the avatar, falling back to a dash so the circle is never blank. */
  protected initials(name: string | undefined): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '–';
    return parts
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  /** "Dormitory · 4 guests · 7 nights" — what a host needs before assigning a room. */
  protected summary(b: HostBooking): string {
    const n = b.nights;
    return `${b.roomType.name} · ${b.guests} ${
      b.guests === 1 ? 'guest' : 'guests'
    } · ${n} ${n === 1 ? 'night' : 'nights'}`;
  }
}
