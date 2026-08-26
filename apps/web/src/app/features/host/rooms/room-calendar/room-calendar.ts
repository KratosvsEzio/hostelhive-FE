import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Skeleton } from '@hostelhive/ui';
import { HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { RoomDay, RoomStay, toRoomMonth } from './room-stays';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleStore } from '@core/i18n/locale-store';
import { buildWeeks } from './month-grid';

/** Most pips a single line holds before the row wraps. Eight keeps a pip about 5px wide. */
const PIPS_PER_ROW = 8;

/** Above this the ruler is unreadable digits rather than a legend. */
const RULER_MAX = 12;

/**
 * Colours a stay is drawn in, so the same guest is the same colour all month.
 *
 * Chosen to stay apart from the brand orange, which the console already uses to mean "the
 * thing you clicked". A bed being sold is not an action, and colouring it brand made every
 * busy month look like a page full of buttons.
 */
const GUEST_COLOURS = [
  '#5B5FA8',
  '#2F6F62',
  '#B4633A',
  '#7A4E9E',
  '#2B6CB0',
  '#A8497A',
] as const;

/** One bed's worth of a day: taken by someone, free, or sold twice. */
export interface Pip {
  bookingId: string | null;
  colour: string;
  clash: boolean;
  label: string;
}

export interface DayCell {
  /** `null` pads the weeks either side of the month. */
  date: string | null;
  n: number;
  capacity: number;
  booked: number;
  free: number;
  pips: Pip[];
  arrivals: number;
  departures: number;
  isToday: boolean;
  oversold: boolean;
}

export interface WeekRow {
  days: DayCell[];
  /** Beds sold as a share of beds sellable, across the days of this week in this month. */
  pct: number;
  label: string;
}

/** One line of the day roster: who is in the room, and on what terms. */
export interface RosterEntry {
  booking: RoomStay;
  colour: string;
  initials: string;
  name: string;
  units: number;
  range: string;
  status: string;
  arriving: boolean;
  leaving: boolean;
}

function iso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * What is sold in one room, by date — and who has it.
 *
 * A row of **pips**, one per bed, rather than a bar per stay. The question a host opens this
 * on is "how much of this room is gone", and a dorm answers it with a count: a six-bed room
 * with four beds sold is neither free nor full, and a single bar cannot say so. Pips make the
 * count the shape of the cell, so a month can be read at a glance without counting anything.
 *
 * A private room is the same component at capacity 1 — one pip spanning the cell, and no
 * "beds free" line, because there are no beds to be free.
 *
 * **What the pips do not say is which bed.** The calendar endpoint reports how many beds are
 * taken on a date, not which guest is in which bed, so a pip is one sold bed rather than a
 * named one, and the roster lists stays rather than bed numbers. Naming beds here would mean
 * inventing the assignment, and a host would act on it. Per-bed assignment — and the clash
 * state that only becomes possible once beds are named — needs the backend to carry it.
 */
@Component({
  selector: 'hh-room-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Skeleton, TranslocoPipe],
  templateUrl: './room-calendar.html',
})
export class RoomCalendar {
  readonly hostelId = input.required<string>();
  readonly roomId = input.required<string>();
  /**
   * Beds in this room, from the room record the parent already holds.
   *
   * Passed in rather than fetched again, and not derived from the bookings either: an empty
   * month would then report a room with no beds, and every pip row is drawn against this
   * number. The parent has it loaded before this tab renders.
   */
  readonly capacity = input(0);

  private readonly api = inject(HostBookingsApi);
  private readonly locale = inject(LocaleStore);

  /** Months from the current one. 0 is this month; the arrows step it. */
  protected readonly offset = signal(0);

  protected readonly month = computed(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + this.offset(), 1);
  });

  /**
   * Month and weekday names in the language being read.
   *
   * `Intl` rather than `DatePipe` or a table of keys: Angular only formats dates in the
   * locales the build registers, which is English here, so the pipe writes "August" onto
   * an otherwise Urdu page. `Intl` knows all eighteen already, and a weekday name is not
   * copy anybody needs to translate by hand.
   */
  protected readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat(this.locale.active(), { month: 'long', year: 'numeric' }).format(
      this.month(),
    ),
  );

  protected readonly weekdays = computed(() => this.weekdayNames("short"));

  /**
   * Single letters, for the phone.
   *
   * Seven columns of "Mon" need about 640px; seven of "M" fit a 360px screen with room
   * to spare, which is what lets the month be a month on a phone rather than something
   * scrolled sideways.
   */
  protected readonly weekdaysNarrow = computed(() => this.weekdayNames("narrow"));

  private weekdayNames(weekday: 'short' | 'narrow'): string[] {
    const fmt = new Intl.DateTimeFormat(this.locale.active(), { weekday });
    // 1 January 2024 was a Monday, so seven days from it name the week in order. Any
    // Monday would do; a fixed one keeps this pure.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  }

  private readonly range = computed(() => {
    const m = this.month();
    return {
      from: iso(new Date(m.getFullYear(), m.getMonth(), 1)),
      to: iso(new Date(m.getFullYear(), m.getMonth() + 1, 0)),
    };
  });

  /**
   * The month, from the real bookings endpoint filtered to this room and this range.
   *
   * The per-day occupancy is worked out here — see {@link toRoomMonth} — because the endpoint
   * answers with stays, not with a room's day-by-day fill. Capacity comes in as an input, so
   * it is part of the query: change room and the pips have to be redrawn against the new
   * number, not just refilled.
   */
  private readonly state = toSignal(
    toObservable(
      computed(() => ({
        ...this.range(),
        room: this.roomId(),
        hostel: this.hostelId(),
        capacity: this.capacity(),
      })),
    ).pipe(
      switchMap((q) =>
        this.api.bookingsInRoom(q.hostel, q.room, q.from, q.to).pipe(
          map((bookings) => {
            const { days, stays } = toRoomMonth(bookings, q.capacity, q.from, q.to);
            return { loading: false, error: false, days, bookings: stays };
          }),
          catchError(() =>
            of({
              loading: false,
              error: true,
              days: [] as RoomDay[],
              bookings: [] as RoomStay[],
            }),
          ),
          startWith({
            loading: true,
            error: false,
            days: [] as RoomDay[],
            bookings: [] as RoomStay[],
          }),
        ),
      ),
    ),
    {
      initialValue: {
        loading: true,
        error: false,
        days: [] as RoomDay[],
        bookings: [] as RoomStay[],
      },
    },
  );

  protected readonly loading = computed(() => this.state().loading);
  protected readonly error = computed(() => this.state().error);

  // Capacity used to be read back off the first day of the fetched month, which worked only
  // because the fixture stamped it onto every day. It is a property of the room, so it now
  // arrives as an input and a month with no stays still knows how many beds it is drawing.
  protected readonly isPrivate = computed(() => this.capacity() <= 1);

  /** 1…N across the top of the grid, so a pip's position has a label. Shared rooms only. */
  protected readonly bedRuler = computed(() =>
    this.isPrivate() ? [] : Array.from({ length: this.capacity() }, (_, i) => i + 1),
  );

  /**
   * How many pips sit on one line before the row wraps.
   *
   * A day cell is about 65px of usable width, so pips laid out in a single row shrink with
   * capacity: eight beds gives 5px each, twelve gives under 3, and a sixteen-bed dorm gives
   * 1.2 — a row of slivers nobody can count, and past twenty-two the arithmetic goes
   * negative and they vanish. Wrapping keeps a pip a readable size at any capacity.
   *
   * Rows are balanced rather than filled: sixteen beds reads as two rows of eight, not eight
   * and eight — and twelve as two rows of six rather than eight and a stub, which looks like
   * four beds are missing.
   */
  protected readonly pipColumns = computed(() => {
    const n = this.capacity();
    if (n <= PIPS_PER_ROW) return Math.max(1, n);
    return Math.ceil(n / Math.ceil(n / PIPS_PER_ROW));
  });

  /**
   * Whether to print the 1…N bed ruler.
   *
   * It is an index of bed numbers, not a column guide — it cannot line up with the pips,
   * which are sized to a day cell rather than to the ruler. Past a dozen it stops being a
   * legend and becomes a strip of unreadable digits, and the subheading above already says
   * how many beds there are.
   */
  protected readonly showBedRuler = computed(
    () => !this.isPrivate() && this.capacity() <= RULER_MAX,
  );

  /**
   * A colour per stay, fixed for the month.
   *
   * Keyed off arrival order rather than the id, so the palette walks in the order a host
   * reads the month rather than in whatever order the API happened to answer.
   */
  private readonly colours = computed(() => {
    const byArrival = [...this.state().bookings].sort((a, b) =>
      a.check_in.localeCompare(b.check_in),
    );
    const map = new Map<string, string>();
    byArrival.forEach((b, i) => map.set(b.id, GUEST_COLOURS[i % GUEST_COLOURS.length]));
    return map;
  });

  /** Beds this stay holds in this room. Already scoped: the query asked for one room. */
  protected unitsIn(booking: RoomStay): number {
    return booking.beds;
  }

  private bookingsOn(date: string): RoomStay[] {
    const day = this.state().days.find((d) => d.date === date);
    if (!day) return [];
    const ids = new Set(day.booking_ids);
    return this.state()
      .bookings.filter((b) => ids.has(b.id))
      .sort((a, b) => a.check_in.localeCompare(b.check_in));
  }

  /**
   * The month as weeks of day cells.
   *
   * `buildWeeks` supplies the calendar padding — which dates fall in which column, and
   * where the month starts and stops — and each cell is then filled with its own pips.
   */
  protected readonly weeks = computed<WeekRow[]>(() => {
    const today = iso(new Date());
    const colours = this.colours();

    return buildWeeks(this.state().days, this.state().bookings, this.month()).map((week) => {
      const days: DayCell[] = week.days.map((cell) => {
        const day = cell.day;
        if (!day) {
          return {
            date: null,
            n: 0,
            capacity: 0,
            booked: 0,
            free: 0,
            pips: [],
            arrivals: 0,
            departures: 0,
            isToday: false,
            oversold: false,
          };
        }

        const on = this.bookingsOn(day.date);
        const pips: Pip[] = [];
        for (const booking of on) {
          const label = booking.guest?.name || 'Guest';
          for (let i = 0; i < this.unitsIn(booking); i++) {
            pips.push({
              bookingId: booking.id,
              colour: colours.get(booking.id) ?? GUEST_COLOURS[0],
              // Past capacity the room is sold twice over, which is a thing a host has to
              // see rather than a rounding error to clamp away.
              clash: pips.length >= day.capacity,
              label,
            });
          }
        }
        const oversold = pips.length > day.capacity;
        while (pips.length < day.capacity) {
          pips.push({ bookingId: null, colour: '', clash: false, label: '' });
        }

        return {
          date: day.date,
          n: Number(day.date.slice(-2)),
          capacity: day.capacity,
          booked: day.booked,
          free: Math.max(0, day.capacity - day.booked),
          pips,
          arrivals: on.filter((b) => b.check_in === day.date).length,
          // `check_out` is exclusive: a guest leaving on the 5th does not occupy the 5th.
          departures: on.filter((b) => b.check_out === day.date).length,
          isToday: day.date === today,
          oversold,
        };
      });

      const real = days.filter((d) => d.date);
      const sellable = real.reduce((n, d) => n + d.capacity, 0);
      const sold = real.reduce((n, d) => n + Math.min(d.booked, d.capacity), 0);
      const pct = sellable ? Math.round((sold / sellable) * 100) : 0;
      return { days, pct, label: `${sold}/${sellable}` };
    });
  });

  /* ------------------------------------------------------------------ day roster */

  private readonly picked = signal<string | null>(null);

  /**
   * The day the roster is showing — whatever was clicked, else the first day worth opening
   * on.
   *
   * Defaulting to today keeps the panel from being empty on arrival, and today is the day a
   * host is usually asking about. Outside this month there is no today, so the month's first
   * occupied day stands in — an empty panel beside a full calendar reads as broken.
   */
  protected readonly selected = computed(() => {
    const chosen = this.picked();
    if (chosen) return chosen;
    const days = this.state().days;
    const today = iso(new Date());
    if (days.some((d) => d.date === today)) return today;
    return days.find((d) => d.booked > 0)?.date ?? days[0]?.date ?? null;
  });

  /** A month change makes the old selection meaningless, so it is dropped. */
  constructor() {
    effect(() => {
      this.month();
      this.picked.set(null);
    });
  }

  protected select(date: string | null): void {
    if (date) this.picked.set(date);
  }

  protected readonly selectedDay = computed(() => {
    const date = this.selected();
    return date ? (this.state().days.find((d) => d.date === date) ?? null) : null;
  });

  protected readonly roster = computed<RosterEntry[]>(() => {
    const date = this.selected();
    if (!date) return [];
    const colours = this.colours();
    const fmt = new Intl.DateTimeFormat(this.locale.active(), {
      day: 'numeric',
      month: 'short',
    });
    return this.bookingsOn(date).map((booking) => {
      const name = booking.guest?.name || 'Guest';
      return {
        booking,
        colour: colours.get(booking.id) ?? GUEST_COLOURS[0],
        initials: name
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0] ?? '')
          .join('')
          .toUpperCase(),
        name,
        units: this.unitsIn(booking),
        range: `${fmt.format(new Date(booking.check_in))} – ${fmt.format(new Date(booking.check_out))}`,
        status: booking.status,
        arriving: booking.check_in === date,
        leaving: booking.check_out === date,
      };
    });
  });

  /** "3 of 8 beds" — the headline the panel opens with. */
  protected readonly selectedRatio = computed(() => {
    const day = this.selectedDay();
    if (!day) return '';
    if (this.isPrivate()) return day.booked > 0 ? 'Booked' : 'Free';
    return `${day.booked} of ${day.capacity} beds`;
  });

  protected readonly selectedTurnover = computed(() => {
    const date = this.selected();
    if (!date) return '';
    const on = this.bookingsOn(date);
    const inn = on.filter((b) => b.check_in === date).length;
    const out = on.filter((b) => b.check_out === date).length;
    if (!inn && !out) return 'no arrivals or departures';
    return [inn ? `${inn} in` : '', out ? `${out} out` : ''].filter(Boolean).join(' · ');
  });

  /**
   * The day's headline, in the width a phone cell has.
   *
   * The desktop cell can afford "5 free" beside the date and a separate arrivals row.
   * A 52px cell can afford one short line, so the three states it has to tell apart —
   * sellable, gone, oversold — are said in a word each rather than a number and a word.
   */
  protected freeShort(d: DayCell): string {
    if (this.isPrivate()) return d.booked > 0 ? 'booked' : 'open';
    if (d.oversold) return `over ${d.booked - d.capacity}`;
    if (d.free === 0) return 'full';
    return `${d.free} free`;
  }

  /** Colour for {@link freeShort}: green while there is something left to sell. */
  protected freeTone(d: DayCell): string {
    if (d.oversold) return 'text-danger';
    if (this.isPrivate()) return d.booked > 0 ? 'text-amber-700' : 'text-emerald-700';
    if (d.free === 0) return 'text-brand-600';
    return d.booked ? 'text-ink-400' : 'text-emerald-700';
  }

  protected step(by: number): void {
    this.offset.update((n) => n + by);
  }
}
