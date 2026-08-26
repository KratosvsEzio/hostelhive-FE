import {
  ApiBooking,
  ApiCalendarDay,
} from '@features/public/listing/booking/booking-api.contract';
import { eachDate } from '@features/public/listing/booking/booking-api';
import { buildWeeks } from './month-grid';

/** March 2026 starts on a Sunday, so the first week is six cells of padding then the 1st. */
const MARCH = new Date(2026, 2, 1);

function days(from: string, to: string, capacity = 4): ApiCalendarDay[] {
  return eachDate(from, to).map((date) => ({ date, booked: 0, capacity, booking_ids: [] }));
}

function booking(id: string, checkIn: string, checkOut: string, name = id): ApiBooking {
  return {
    id,
    hostel_id: 'h1',
    hostel_name: 'Test',
    check_in: checkIn,
    check_out: checkOut,
    guests: 1,
    lines: [
      { room_id: 'r1', room_title: 'R', room_type: 'shared', quantity: 1, unit_price: 0, actual_price: 0 },
    ],
    total: 0,
    deposit: 0,
    status: 'confirmed',
    created_at: checkIn,
    guest: { name, email: '' },
  };
}

/** All segments across every week, for assertions that do not care which week they landed in. */
function allSegments(weeks: ReturnType<typeof buildWeeks>) {
  return weeks.flatMap((w, week) => w.segments.map((s) => ({ ...s, week })));
}

describe('buildWeeks', () => {
  it('pads both ends so every week is seven cells', () => {
    const weeks = buildWeeks(days('2026-03-01', '2026-03-31'), [], MARCH);

    expect(weeks.every((w) => w.days.length === 7)).toBe(true);
    // 1 March 2026 is a Sunday, so Monday-first leaves six blanks before it.
    expect(weeks[0].days.filter((c) => c.day === null).length).toBe(6);
    expect(weeks[0].days[6].day?.date).toBe('2026-03-01');
  });

  it('places a stay on the days it covers, and not on check-out', () => {
    const weeks = buildWeeks(
      days('2026-03-01', '2026-03-31'),
      [booking('b1', '2026-03-09', '2026-03-12')],
      MARCH,
    );
    const [seg] = allSegments(weeks);

    // 9–11 March inclusive: Monday through Wednesday of the second week.
    expect(seg.col).toBe(1);
    expect(seg.span).toBe(3);
    expect(seg.continuesBefore).toBe(false);
    expect(seg.continuesAfter).toBe(false);
  });

  it('splits a stay that crosses a week boundary, and marks both cut ends', () => {
    const weeks = buildWeeks(
      days('2026-03-01', '2026-03-31'),
      [booking('b1', '2026-03-06', '2026-03-10')],
      MARCH,
    );
    const segs = allSegments(weeks);

    expect(segs.length).toBe(2);
    // Friday and Saturday of week one, then Monday to Wednesday... 6 March is a Friday.
    expect(segs[0].continuesBefore).toBe(false);
    expect(segs[0].continuesAfter).toBe(true);
    expect(segs[1].continuesBefore).toBe(true);
    expect(segs[1].continuesAfter).toBe(false);
    expect(segs[0].span + segs[1].span).toBe(4); // 6, 7, 8, 9 March
  });

  it('marks a stay that began before the month as carrying on', () => {
    const weeks = buildWeeks(
      days('2026-03-01', '2026-03-31'),
      [booking('b1', '2026-02-26', '2026-03-03')],
      MARCH,
    );
    const segs = allSegments(weeks);

    // Only 1 and 2 March are in view, and neither is where the guest arrived. They also fall
    // either side of a week boundary — 1 March is a Sunday — so this is two bars, not one.
    expect(segs.map((s) => s.span)).toEqual([1, 1]);
    expect(segs[0].continuesBefore).toBe(true);
    expect(segs[0].continuesAfter).toBe(true);
    expect(segs[1].continuesBefore).toBe(true);
    expect(segs[1].continuesAfter).toBe(false);
  });

  it('drops a booking that does not touch the month at all', () => {
    const weeks = buildWeeks(
      days('2026-03-01', '2026-03-31'),
      [booking('b1', '2026-01-05', '2026-01-09')],
      MARCH,
    );

    expect(allSegments(weeks)).toEqual([]);
  });

  it('stacks overlapping stays into separate lanes', () => {
    const weeks = buildWeeks(
      days('2026-03-01', '2026-03-31'),
      [
        booking('b1', '2026-03-09', '2026-03-13'),
        booking('b2', '2026-03-10', '2026-03-12'),
      ],
      MARCH,
    );
    const segs = allSegments(weeks);

    expect(new Set(segs.map((s) => s.lane)).size).toBe(2);
    expect(weeks.find((w) => w.segments.length === 2)?.lanes).toBe(2);
  });

  it('reuses a lane once the stay in it has ended', () => {
    const weeks = buildWeeks(
      days('2026-03-01', '2026-03-31'),
      [
        booking('b1', '2026-03-09', '2026-03-11'),
        booking('b2', '2026-03-12', '2026-03-14'),
      ],
      MARCH,
    );
    const segs = allSegments(weeks);

    // Back-to-back, not overlapping: one lane is enough for both.
    expect(segs.every((s) => s.lane === 0)).toBe(true);
  });

  it('returns nothing for a month it has no days for', () => {
    expect(buildWeeks([], [booking('b1', '2026-03-09', '2026-03-12')], MARCH)).toEqual([]);
  });
});
