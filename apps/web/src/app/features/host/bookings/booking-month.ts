import { CalendarDayCounts } from './host-bookings-api';

/**
 * The five lanes, in the order the design puts them: action first, cancellations last.
 *
 * These are the backend's own **dispositions**, not an invention — `possible_statuses` on the
 * bookings endpoint declares exactly these five, grouped under four statuses:
 *
 *   Paid        → pending-allotment, room-assigned
 *   Checked In  → checked-in
 *   Checked Out → checked-out
 *   Cancelled   → cancelled
 *
 * Colours come from the app's status tones rather than the mockup's palette. The table
 * directly beneath this calendar pills the same bookings, and a second colour system would
 * have one booking reading amber in one half of the page and indigo in the other.
 */
export type LaneKey =
  | 'pending-allotment'
  | 'room-assigned'
  | 'checked-in'
  | 'checked-out'
  | 'cancelled';

export interface Lane {
  /** The disposition slug, which is also the key into the API's `by_status`. */
  key: LaneKey;
  /**
   * What the lane is called. The only name it has, and always written out in full.
   *
   * There were three of these: this, a `short` for the desktop strip, and a three-or-four
   * character `abbr` — “PEND”, “ASGN”, “CXL” — for the phone. Both count strips divided
   * their width into five fixed columns, and a fifth of a phone is 67px, which holds no
   * label longer than “OUT”. The codes were the only thing that fit.
   *
   * They were legible to whoever wrote them and to nobody else, and the tooltip that
   * expanded them needed a mouse — so on the one screen where the text was abbreviated,
   * the expansion could not be reached at all. Both strips wrap now instead of dividing:
   * a chip is as wide as its own text and the row reflows when it runs out, so the full
   * name always fits and no layout depends on how long the English happens to be.
   */
  label: string;
  /** Static classes, never interpolated: Tailwind only ships what it can find in the source. */
  dot: string;
  value: string;
  tile: string;
  /** Background + text together, for a filled pill in the table below the calendar. */
  badge: string;
}

export const LANES: readonly Lane[] = [
  {
    key: 'pending-allotment',
    label: 'Pending allotment',
    dot: 'bg-warn',
    value: 'text-warn',
    tile: 'bg-warn/10',
    badge: 'bg-warn/10 text-warn',
  },
  {
    key: 'room-assigned',
    label: 'Room assigned',
    // Violet, not the brand orange this used to be. Orange and the cancelled red are
    // neighbouring hues, and at the 8px dot these lanes are drawn as they were near enough
    // indistinguishable — which put "assigned" and "cancelled", two states a host reacts to
    // in opposite ways, on the same colour. Violet is far enough round the wheel to survive
    // both the small size and a colour-blind reader.
    dot: 'bg-violet-500',
    value: 'text-violet-600',
    tile: 'bg-violet-50',
    badge: 'bg-violet-50 text-violet-700',
  },
  {
    key: 'checked-in',
    label: 'Checked in',
    dot: 'bg-ok',
    value: 'text-ok',
    tile: 'bg-ok/10',
    badge: 'bg-ok/10 text-ok',
  },
  {
    key: 'checked-out',
    label: 'Checked out',
    dot: 'bg-ink-400',
    value: 'text-ink-600',
    tile: 'bg-ink-100',
    badge: 'bg-ink-100 text-ink-600',
  },
  {
    key: 'cancelled',
    label: 'Cancelled',
    dot: 'bg-danger',
    value: 'text-danger',
    tile: 'bg-danger/10',
    badge: 'bg-danger/10 text-danger',
  },
] as const;

export type LaneCounts = Record<LaneKey, number>;

export interface DayCell {
  /** `yyyy-MM-dd`, or `''` for the padding cells either side of the month. */
  date: string;
  /** Day of month as text, `''` when padding. */
  n: string;
  inMonth: boolean;
  isToday: boolean;
  counts: LaneCounts;
  /** Arrivals and departures — events, kept out of the lanes so the bar cannot exceed 100%. */
  checkins: number;
  checkouts: number;
  /** Every lane at zero: the cell greys its numbers rather than rendering blank. */
  empty: boolean;
}

export interface BookingMonth {
  /** Always 42 cells: six weeks, Monday first, so the grid never changes height mid-year. */
  days: DayCell[];
  totals: LaneCounts;
}

const ZERO = (): LaneCounts => ({
  'pending-allotment': 0,
  'room-assigned': 0,
  'checked-in': 0,
  'checked-out': 0,
  cancelled: 0,
});

/** `yyyy-MM-dd` in local time. `toISOString` would shift the date west of Greenwich. */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** First and last day of the month holding `d`, as the endpoint's `start_date` / `end_date`. */
export function monthRange(d: Date): { start: string; end: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    start: isoDate(new Date(y, m, 1)),
    // Day 0 of the next month is the last day of this one, so February needs no special case.
    end: isoDate(new Date(y, m + 1, 0)),
  };
}

/**
 * The API's per-day tallies laid into a Monday-first grid.
 *
 * The counting is the server's; this is only placement, which is still worth testing on its
 * own — a day landing a column off, or the 1st padded to the wrong weekday, is arithmetic
 * that looks fine until you open the one month where it shows.
 *
 * Days the response does not mention read as zero rather than as missing: the endpoint sends
 * `by_status: {}` for an empty day, and a month it has not indexed yet should look empty, not
 * broken.
 */
export function buildBookingMonth(
  days: readonly CalendarDayCounts[],
  monthStart: Date,
  today: Date = new Date(),
): BookingMonth {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  // getDay() is Sunday-first; shift so Monday is 0, matching the room calendar and the rest
  // of the host console.
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const todayIso = isoDate(today);
  const byDate = new Map(days.map((d) => [d.date, d]));

  const cells: DayCell[] = [];
  const totals = ZERO();

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(year, month, i - lead + 1);
    if (cellDate.getMonth() !== month || cellDate.getFullYear() !== year) {
      cells.push({
        date: '',
        n: '',
        inMonth: false,
        isToday: false,
        counts: ZERO(),
        checkins: 0,
        checkouts: 0,
        empty: true,
      });
      continue;
    }

    const date = isoDate(cellDate);
    const src = byDate.get(date);
    const counts = ZERO();
    for (const lane of LANES) {
      const n = src?.byDisposition?.[lane.key] ?? 0;
      counts[lane.key] = n;
      totals[lane.key] += n;
    }

    cells.push({
      date,
      n: String(cellDate.getDate()),
      inMonth: true,
      isToday: date === todayIso,
      counts,
      checkins: src?.checkins ?? 0,
      checkouts: src?.checkouts ?? 0,
      empty: LANES.every((l) => counts[l.key] === 0),
    });
  }

  return { days: cells, totals };
}

/**
 * The share each lane takes of the mobile micro-bar.
 *
 * Cancelled is left out: it is not occupancy, and a day with one stay and three cancellations
 * would draw a bar three-quarters red for rooms nobody is in.
 */
export function barSegments(counts: LaneCounts): { key: LaneKey; pct: number; dot: string }[] {
  const live: LaneKey[] = ['pending-allotment', 'room-assigned', 'checked-in'];
  const total = live.reduce((n, k) => n + counts[k], 0);
  if (!total) return [];
  return live
    .filter((k) => counts[k] > 0)
    .map((k) => ({
      key: k,
      pct: Math.round((counts[k] / total) * 100),
      dot: LANES.find((l) => l.key === k)!.dot,
    }));
}

/** The lane for a disposition slug, or undefined for one this app does not draw. */
export function laneFor(slug: string): Lane | undefined {
  return LANES.find((l) => l.key === slug);
}
