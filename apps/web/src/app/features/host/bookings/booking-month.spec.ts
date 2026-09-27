import { CalendarDayCounts } from './host-bookings-api';
import {
  LANES,
  barSegments,
  buildBookingMonth,
  isoDate,
  laneFor,
  laneKeyFor,
  monthRange,
  slugsFor,
} from './booking-month';

/** August 2026 starts on a Saturday, so the grid needs five leading pad cells. */
const AUG = new Date(2026, 7, 1);
const TODAY = new Date(2026, 7, 24);

function day(date: string, over: Partial<CalendarDayCounts> = {}): CalendarDayCounts {
  return { date, checkins: 0, checkouts: 0, byDisposition: {}, ...over };
}

function cell(month: ReturnType<typeof buildBookingMonth>, date: string) {
  return month.days.find((d) => d.date === date)!;
}

describe('monthRange', () => {
  it('spans the whole month as plain dates, matching the dashboard endpoints', () => {
    expect(monthRange(new Date(2026, 7, 15))).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
    });
  });

  // Day 0 of the next month, so no month-length table and no leap-year special case.
  it('ends on the real last day of a short month', () => {
    expect(monthRange(new Date(2026, 1, 10)).end).toBe('2026-02-28');
    expect(monthRange(new Date(2024, 1, 10)).end).toBe('2024-02-29');
  });

  // A local-time bug here shifts every request by one day west of Greenwich.
  it('formats in local time', () => {
    expect(isoDate(new Date(2026, 7, 1))).toBe('2026-08-01');
  });
});

describe('buildBookingMonth grid', () => {
  it('always returns six weeks so the grid never changes height', () => {
    for (let m = 0; m < 12; m++) {
      expect(buildBookingMonth([], new Date(2026, m, 1), TODAY).days.length).toBe(42);
    }
  });

  // Monday-first, matching the room calendar and the rest of the host console.
  it('pads the lead so the 1st lands on its real weekday', () => {
    const month = buildBookingMonth([], AUG, TODAY);
    // 1 Aug 2026 is a Saturday — index 5 with Monday at 0.
    expect(month.days.slice(0, 5).every((d) => !d.inMonth)).toBe(true);
    expect(month.days[5].n).toBe('1');
  });

  it('marks only the real today', () => {
    const month = buildBookingMonth([], AUG, TODAY);
    expect(month.days.filter((d) => d.isToday).map((d) => d.n)).toEqual(['24']);
  });

  it('leaves the padding cells empty', () => {
    const month = buildBookingMonth([day('2026-08-01', { checkins: 3 })], AUG, TODAY);
    expect(month.days.slice(0, 5).every((d) => d.empty && !d.inMonth)).toBe(true);
  });
});

describe('buildBookingMonth lane placement', () => {
  it('lays each day’s dispositions into its own cell', () => {
    const month = buildBookingMonth(
      [day('2026-08-26', { byDisposition: { 'pending': 2, 'confirmed': 2 } })],
      AUG,
      TODAY,
    );
    const c = cell(month, '2026-08-26').counts;

    expect(c['pending']).toBe(2);
    expect(c['confirmed']).toBe(2);
    expect(c['checked-in']).toBe(0);
  });

  // The endpoint sends `by_status: {}` for a quiet day rather than a row of zeros.
  it('reads an absent disposition as zero, not as missing', () => {
    const month = buildBookingMonth([day('2026-08-10')], AUG, TODAY);
    const c = cell(month, '2026-08-10');

    expect(LANES.every((l) => c.counts[l.key] === 0)).toBe(true);
    expect(c.empty).toBe(true);
  });

  // A month the endpoint has not indexed should look empty, not broken.
  it('renders a month the response says nothing about', () => {
    const month = buildBookingMonth([], AUG, TODAY);

    expect(month.days.filter((d) => d.inMonth).length).toBe(31);
    expect(month.days.every((d) => d.empty)).toBe(true);
  });

  it('ignores days outside the month it was asked for', () => {
    const month = buildBookingMonth(
      [day('2026-09-04', { byDisposition: { 'confirmed': 9 } })],
      AUG,
      TODAY,
    );

    expect(month.totals['confirmed']).toBe(0);
  });

  // Arrivals and departures are events, not dispositions — a stay can be checked-in and also
  // arriving that day, so folding them into the lanes would double-count it.
  it('keeps check-ins and check-outs beside the lanes, not inside them', () => {
    const month = buildBookingMonth(
      [day('2026-08-30', { checkouts: 5, byDisposition: { 'confirmed': 1 } })],
      AUG,
      TODAY,
    );
    const c = cell(month, '2026-08-30');

    expect(c.checkouts).toBe(5);
    expect(c.counts['checked-out']).toBe(0);
    expect(c.counts['confirmed']).toBe(1);
  });
});

describe('buildBookingMonth totals', () => {
  it('sums each lane across the month', () => {
    const month = buildBookingMonth(
      [
        day('2026-08-21', { byDisposition: { 'confirmed': 1 } }),
        day('2026-08-25', { byDisposition: { 'confirmed': 2, cancelled: 1 } }),
        day('2026-08-26', { byDisposition: { 'pending': 2, 'confirmed': 2 } }),
      ],
      AUG,
      TODAY,
    );

    expect(month.totals['confirmed']).toBe(5);
    expect(month.totals['pending']).toBe(2);
    expect(month.totals['cancelled']).toBe(1);
    expect(month.totals['checked-in']).toBe(0);
  });
});

describe('barSegments', () => {
  const counts = (over: Record<string, number> = {}) =>
    ({
      pending: 0,
      confirmed: 0,
      'checked-in': 0,
      'checked-out': 0,
      cancelled: 0,
      'no-show': 0,
      ...over,
    }) as Parameters<typeof barSegments>[0];

  it('renders nothing when the day is empty', () => {
    expect(barSegments(counts())).toEqual([]);
  });

  it('splits the bar in proportion and fills it', () => {
    const segs = barSegments(counts({ 'pending': 1, 'confirmed': 3 }));

    expect(segs.map((s) => s.key)).toEqual(['pending', 'confirmed']);
    expect(segs.reduce((n, s) => n + s.pct, 0)).toBe(100);
  });

  // A day with one stay and three cancellations would otherwise draw three-quarters red for
  // rooms nobody is in.
  it('leaves cancellations and no-shows out of the occupancy bar', () => {
    expect(barSegments(counts({ cancelled: 4 }))).toEqual([]);
    expect(barSegments(counts({ 'no-show': 2 }))).toEqual([]);
  });

  it('drops zero-width lanes rather than rendering slivers', () => {
    expect(barSegments(counts({ 'checked-in': 2 })).map((s) => s.key)).toEqual(['checked-in']);
  });

  it('uses the lane palette', () => {
    const [seg] = barSegments(counts({ 'confirmed': 1 }));
    expect(seg.dot).toBe(LANES.find((l) => l.key === 'confirmed')!.dot);
  });
});

/**
 * Both count strips used to divide their width into five fixed columns, which left 57px a
 * lane in the day ledger — room for a code and nothing else. "PEND" and "CXL" were the
 * result, and the tooltip carrying what they meant needed a mouse, so the phone got the
 * abbreviation without the expansion.
 *
 * The strips wrap now, so a label is only ever as wide as itself. These guard the thing that
 * made the codes necessary: the moment a name is written to fit a column rather than to be
 * read, the tooltip comes back and the phone loses again.
 */
describe('lane names', () => {
  it('names every lane in words rather than a code', () => {
    for (const lane of LANES) {
      const name = lane.label.trim();
      expect(name.length).toBeGreaterThan(0);
      // What a code looks like: short and shouted. Nothing this compressed survives being
      // read by someone who did not write it.
      expect(name.length <= 4 && name === name.toUpperCase()).toBe(false);
    }
  });

  // Two lanes reading the same is the failure the abbreviations were introduced to avoid and
  // then reintroduced themselves, "IN" and "OUT" being one glance apart.
  it('keeps every name distinct', () => {
    const names = LANES.map((l) => l.label);
    expect(new Set(names).size).toBe(names.length);
  });

  it('says what each disposition actually is', () => {
    expect(LANES.map((l) => l.label)).toEqual([
      'Pending',
      'Confirmed',
      'Checked in',
      'Checked out',
      'Cancelled',
      'No show',
    ]);
  });
});

/**
 * Records made before the lifecycle was reseeded still carry the host side's old names. They
 * are the same stays in the same states, so every place that reads a slug has to count them.
 */
describe('legacy disposition slugs', () => {
  it('folds them into the lane they now belong to', () => {
    expect(laneKeyFor('pending-allotment')).toBe('pending');
    expect(laneKeyFor('room-assigned')).toBe('confirmed');
    expect(laneKeyFor('checked-in')).toBe('checked-in');
    expect(laneKeyFor('mystery')).toBeUndefined();
  });

  it('counts an old and a new slug on the same day as one lane', () => {
    const month = buildBookingMonth(
      [day('2026-08-26', { byDisposition: { 'pending-allotment': 2, pending: 1, 'room-assigned': 3 } })],
      AUG,
      TODAY,
    );
    const c = cell(month, '2026-08-26').counts;

    expect(c.pending).toBe(3);
    expect(c.confirmed).toBe(3);
    expect(month.totals.pending).toBe(3);
  });

  it('gives an old record its lane badge', () => {
    expect(laneFor('pending-allotment')?.key).toBe('pending');
  });

  it('asks the server for the old slug too when filtering on a lane', () => {
    expect(slugsFor('pending')).toEqual(['pending', 'pending-allotment']);
    expect(slugsFor('confirmed')).toEqual(['confirmed', 'room-assigned']);
    expect(slugsFor('no-show')).toEqual(['no-show']);
  });
});
