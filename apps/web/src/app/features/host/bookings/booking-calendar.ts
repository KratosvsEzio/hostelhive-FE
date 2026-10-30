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
import { DatePipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Button, Skeleton } from '@hostelhive/ui';
import { hostelZone } from '@services';
import { todayIn } from '@util/zoned-time';
import { LocaleStore } from '@core/i18n/locale-store';
import { guestsPhrase, nightsPhrase } from './booking-copy';
import {
  BookingCalendar as CalendarData,
  HostBooking,
  HostBookingsApi,
} from './host-bookings-api';
import {
  DayCell,
  LANES,
  LaneKey,
  laneKeyFor,
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
  imports: [DatePipe, Button, Skeleton, TranslocoPipe],
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
  /** A pending request the host wants to confirm straight from the day ledger. */
  readonly confirmRequested = output<HostBooking>();
  /** A pending card asking to be read before it is placed. */
  readonly detailsRequested = output<HostBooking>();

  private readonly api = inject(HostBookingsApi);

  protected readonly lanes = LANES;

  /**
   * Whether the last legend chip has to span both phone columns.
   *
   * Five lanes into a two-column grid leaves the last one alone in a half-width cell with a
   * hole beside it. Spanning it closes the row. Derived rather than hardcoded so adding a
   * sixth lane does not quietly leave a stretched chip in the middle of a full grid.
   */
  protected readonly lastLaneSpansRow = LANES.length % 2 === 1;
  private readonly locale = inject(LocaleStore);
  /** Monday first, worded by the browser in the host's language. */
  protected readonly weekdays = weekdayNames(this.locale.active(), 'short');
  protected readonly weekdaysNarrow = weekdayNames(this.locale.active(), 'narrow');
  /** 42, matching the grid, so the skeleton occupies exactly the space the month will. */
  protected readonly skeletonCells = Array.from({ length: 42 });

  /**
   * The hostel's IANA time zone: `undefined` while it is being read, `null` when there is
   * none (today is then the device's date).
   *
   * Read from the store here rather than passed in, so the page above needs no change. One
   * request per hostel per session — the store keeps the answer, null included.
   */
  private readonly zone = hostelZone(this.hostelId);

  /**
   * The instant this calendar opened, read from the clock once.
   *
   * A computed does not re-run when the clock moves, so reading it inside one would re-base
   * the month on whatever moment it last recomputed — and an arrow pressed after midnight on
   * a month's last night would skip a month. A page left open past midnight keeps the day it
   * opened on; a reload moves it on.
   */
  private readonly openedAt = new Date();

  /**
   * Today on the hostel's calendar, as `yyyy-MM-dd`: the highlighted cell, the month the
   * calendar opens on and the ledger's default day. Null until the zone is known, so the
   * first paint is the right day rather than one that jumps when the zone lands.
   */
  private readonly today = computed(() => {
    // No hostel yet (the route id resolves a tick later): stay pending rather than use the device's date.
    if (!this.hostelId()) return null;
    const zone = this.zone();
    return zone === undefined ? null : todayIn(zone, this.openedAt);
  });

  /** Whether today is known yet; until it is the month stays a skeleton and unlabelled. */
  protected readonly ready = computed(() => this.today() !== null);

  /** Months from the current one. 0 is this month; the arrows step it. */
  private readonly offset = signal(0);

  /** Bumped by "Try again", so the same month can be asked for twice. */
  private readonly attempt = signal(0);

  /**
   * First of the displayed month, built from the hostel's year and month.
   *
   * The device's month stands in while the zone is pending; nothing is fetched or labelled
   * from it. Compared by value, so a zone that moves today within the same month does not
   * count as a new month.
   */
  protected readonly monthStart = computed(
    () => {
      const [y, m] = (this.today() ?? isoDate(this.openedAt)).split('-').map(Number);
      return new Date(y, m - 1 + this.offset(), 1);
    },
    { equal: (a, b) => a.getTime() === b.getTime() },
  );

  private readonly request = computed(() => ({
    hostelId: this.hostelId(),
    ready: this.ready(),
    attempt: this.attempt(),
    ...monthRange(this.monthStart()),
  }));

  protected readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ hostelId, ready, start, end }) =>
        !ready
          ? of<CalendarState>({ loading: true, error: false, data: EMPTY })
          : !hostelId
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

  /**
   * The month as last fetched, plus any moves made on this page since.
   *
   * Re-seeded whenever a new month arrives, so a local adjustment never outlives the next
   * real answer from the server. See {@link applyChange}.
   */
  private readonly monthData = linkedSignal(() => this.state().data);

  protected readonly month = computed(() =>
    buildBookingMonth(this.monthData().days, this.monthStart(), this.today() ?? ''),
  );

  /** The month on screen and the day called today, which together decide the ledger's default. */
  private readonly selectionSource = computed(() => ({
    start: this.monthStart(),
    today: this.today(),
  }));

  /**
   * The day the ledger is showing.
   *
   * A `linkedSignal` on the month so stepping to another month re-seeds the selection rather
   * than leaving the ledger on a date the grid no longer shows — that would pair March's
   * numbers with April's grid, and nothing on screen would say so. Defaults to today when
   * today is in view, otherwise the first of the month; empty while today is not known yet.
   */
  protected readonly selected = linkedSignal<{ start: Date; today: string | null }, string>({
    source: this.selectionSource,
    computation: ({ start, today }) => {
      if (!today) return '';
      const first = isoDate(start);
      return today.slice(0, 7) === first.slice(0, 7) ? today : first;
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
    ready: this.ready(),
    date: this.selected(),
  }));

  protected readonly dayState = toSignal(
    toObservable(this.dayRequest).pipe(
      switchMap(({ hostelId, ready, date }) =>
        !ready
          ? of<DayState>({ loading: true, error: false, data: [] })
          : !hostelId || !date
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

  /** The selected day's stays as fetched, with this page's own moves applied on top. */
  private readonly dayBookings = linkedSignal(() => this.dayState().data);

  /**
   * Moves one booking from the lane it was in to the lane the server now says it is in —
   * a cancel, a no-show, a confirm — without asking for the month again.
   *
   * The action's reply already carries the updated booking, and the aggregation counts a
   * booking once, on its check-in day, by disposition. So the day's numbers change by
   * exactly one out of the old lane and one into the new: nothing a refetch would tell us
   * that we do not already know.
   */
  applyChange(before: HostBooking, after: HostBooking): void {
    const from = before.disposition.slug;
    const to = after.disposition.slug;
    const date = (after.checkIn || before.checkIn).slice(0, 10);

    if (from !== to) {
      this.monthData.update((data) => {
        if (!data.days.some((d) => d.date === date)) return data;
        const move = (counts: Record<string, number>): Record<string, number> => {
          const next = { ...counts };
          if (from && (next[from] ?? 0) > 0) next[from] -= 1;
          if (to) next[to] = (next[to] ?? 0) + 1;
          return next;
        };
        return {
          ...data,
          days: data.days.map((d) => (d.date === date ? { ...d, byDisposition: move(d.byDisposition) } : d)),
          totals: move(data.totals),
        };
      });
    }

    this.dayBookings.update((rows) => rows.map((b) => (b.id === after.id ? after : b)));
  }

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
      : this.dayBookings();
    return rows.filter((b) => laneKeyFor(b.disposition.slug) === 'pending');
  });

  protected step(by: number): void {
    if (!this.ready()) return;
    this.offset.update((n) => n + by);
  }

  /** Asks for the month on screen again after it failed to load. */
  protected retry(): void {
    this.attempt.update((n) => n + 1);
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

  // "Dormitory · 4 guests · 7 nights" under each request — what a host needs before confirming.
  protected readonly guestsOf = guestsPhrase;
  protected readonly nightsOf = nightsPhrase;
}

/** The seven day names, Monday first. 2024-01-01 was a Monday; noon UTC keeps it Monday in every zone. */
function weekdayNames(locale: string, weekday: 'short' | 'narrow'): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday, timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i, 12))));
}
