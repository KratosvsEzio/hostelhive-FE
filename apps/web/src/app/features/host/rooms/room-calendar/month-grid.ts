import {
  ApiBooking,
  ApiCalendarDay,
} from '@features/public/listing/booking/booking-api.contract';

/** A cell in the month grid. `null` pads the weeks either side of the month. */
export interface Cell {
  day: ApiCalendarDay | null;
  /** Rounded caps mark where occupancy starts and ends, so two adjacent stays read as two. */
  startsHere: boolean;
  endsHere: boolean;
}

/**
 * One booking's run across one week.
 *
 * A stay is split at the week boundary because a month grid wraps: a Friday-to-Tuesday stay
 * is one booking and two bars. `continuesBefore`/`continuesAfter` are what let the two halves
 * be drawn as a thing that carries on rather than two separate stays — the cut end stays
 * square while the real start and end are rounded.
 */
export interface Segment {
  booking: ApiBooking;
  /** 1-based, for `grid-column-start`. */
  col: number;
  span: number;
  /** Which stacked row within the week. Several bookings share a date on a dorm. */
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface Week {
  days: Cell[];
  segments: Segment[];
  /** How many lanes this week needs, so the row can be sized to hold them. */
  lanes: number;
}

const EMPTY: Cell = { day: null, startsHere: false, endsHere: false };

/**
 * The month as weeks, with each booking placed across the days it covers.
 *
 * Pure and exported so the placement can be tested without a browser: the parts that go
 * wrong here — a stay landing a column off, two bookings drawn on top of each other, a run
 * that vanishes because it started last month — are all arithmetic, and all invisible until
 * somebody looks at the right week of the right month.
 *
 * `check_out` is exclusive throughout: a guest leaving on the 5th does not occupy the 5th.
 */
export function buildWeeks(
  days: ApiCalendarDay[],
  bookings: ApiBooking[],
  monthStart: Date,
): Week[] {
  if (!days.length) return [];

  // getDay() is Sunday-first; shift so Monday is 0, matching the rest of the host console.
  const lead = (new Date(monthStart.getFullYear(), monthStart.getMonth(), 1).getDay() + 6) % 7;
  const cells: Cell[] = [
    ...Array.from({ length: lead }, () => EMPTY),
    ...days.map((day, i) => ({
      day,
      startsHere: day.booked > 0 && (days[i - 1]?.booked ?? 0) === 0,
      endsHere: day.booked > 0 && (days[i + 1]?.booked ?? 0) === 0,
    })),
  ];
  while (cells.length % 7) cells.push(EMPTY);

  const firstDate = days[0].date;
  const lastDate = days[days.length - 1].date;

  // Where each booking begins and ends *in this grid*, so the week split below is index
  // arithmetic rather than date arithmetic — no adding days, no month-end special cases.
  const runs = bookings
    .map((booking) => {
      let from = -1;
      let to = -1;
      for (let i = 0; i < cells.length; i++) {
        const date = cells[i].day?.date;
        if (!date || date < booking.check_in || date >= booking.check_out) continue;
        if (from === -1) from = i;
        to = i;
      }
      return { booking, from, to };
    })
    // A booking wholly outside the month covers nothing here and is not drawn.
    .filter((r) => r.from !== -1)
    // Longest first, then by start, so the bars that are hardest to place get the top lanes
    // and a week does not read as a staircase.
    .sort(
      (a, b) =>
        b.to - b.from - (a.to - a.from) ||
        a.from - b.from ||
        a.booking.id.localeCompare(b.booking.id),
    );

  const weeks: Week[] = [];
  for (let start = 0; start < cells.length; start += 7) {
    const end = start + 6;
    const segments: Segment[] = [];
    /** The last column each lane is occupied through, so a lane can be reused after it. */
    const laneEnds: number[] = [];

    for (const { booking, from, to } of runs) {
      if (to < start || from > end) continue;
      const segStart = Math.max(from, start);
      const segEnd = Math.min(to, end);

      let lane = laneEnds.findIndex((occupiedThrough) => occupiedThrough < segStart);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = segEnd;

      segments.push({
        booking,
        col: segStart - start + 1,
        span: segEnd - segStart + 1,
        lane,
        // Clipped by the week, or by the month itself — a stay that began in April is still
        // a stay that carries on, and the 1st of May should not look like its first night.
        continuesBefore: from < start || booking.check_in < firstDate,
        continuesAfter: to > end || booking.check_out > lastDate,
      });
    }

    weeks.push({
      days: cells.slice(start, start + 7),
      segments,
      lanes: laneEnds.length,
    });
  }
  return weeks;
}
